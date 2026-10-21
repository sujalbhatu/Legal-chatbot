"""
Token benchmark for conversation memory.

Replays one scripted multi-turn consultation through the real pipeline (real
retrieval, real Groq calls) once per memory strategy, and sums Groq's own
reported token usage for EVERY call: translation, act detection, memory
summarization and the answer. Summarization cost is included, so the saving
reported is net.

Strategies
  full     entire conversation history every turn (baseline)
  window   last 6 messages only (the previous behaviour; forgets early facts)
  summary  last 4 messages verbatim + recursive long-term summary (new)

Fair comparison: the first strategy's answers become the canonical transcript,
and later strategies put those same answers into their history. Only the way
history is represented differs between runs, not its content.

Usage (from backend/rag_model, with GROQ_API_KEY in .env):
    python eval/benchmark_memory.py
    python eval/benchmark_memory.py --turns 12 --pause 8      # if you hit Groq rate limits

Results: eval/results/memory_benchmark_<timestamp>.md and .json
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from rag_pipeline import get_pipeline  # noqa: E402


def run_strategy(pipeline, strategy, questions, canonical_answers, pause):
    pipeline.memory_strategy = strategy
    history, summary = [], ""
    turns, answers = [], []

    for i, question in enumerate(questions, start=1):
        result = pipeline.query(question, history, None, summary)
        answer = result["answer"]
        if answer.startswith("Error: No available Groq models"):
            raise SystemExit(f"[{strategy}] turn {i}: Groq call failed ({answer[:160]}). "
                             "Increase --pause or lower --turns, then rerun.")

        usage = result["usage"]
        memory = result.get("memory") or {}
        answer_bucket = usage["by_purpose"].get("answer", {})
        turns.append({
            "turn": i,
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "llm_calls": usage["llm_calls"],
            "answer_prompt_tokens": answer_bucket.get("prompt_tokens", 0),
            "answer_models": answer_bucket.get("models", []),
            "summary_tokens": sum(usage["by_purpose"].get("memory_summary", {}).get(k, 0)
                                  for k in ("prompt_tokens", "completion_tokens")),
            "messages_folded": memory.get("summarized_count", 0),
        })
        answers.append(answer)
        print(f"  [{strategy:7}] turn {i:2}: {usage['total_tokens']:6} tokens "
              f"(answer prompt {answer_bucket.get('prompt_tokens', 0):6}, calls {usage['llm_calls']})")

        if memory.get("summarized_count"):
            history = history[memory["summarized_count"]:]
            summary = memory.get("summary", "")
        history_answer = canonical_answers[i - 1] if canonical_answers else answer
        history += [{"role": "user", "content": question}, {"role": "assistant", "content": history_answer}]
        time.sleep(pause)

    totals = {k: sum(t[k] for t in turns) for k in ("prompt_tokens", "completion_tokens", "total_tokens", "llm_calls", "summary_tokens")}
    return {"strategy": strategy, "turns": turns, "totals": totals, "answers": answers, "final_summary": summary}


def write_report(runs, script, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / f"memory_benchmark_{stamp}.json").write_text(json.dumps(runs, indent=2, ensure_ascii=False), encoding="utf-8")

    base = next((r for r in runs if r["strategy"] == "full"), None)
    lines = [
        f"# Memory benchmark - {script['name']}",
        "",
        f"Run on {datetime.now():%Y-%m-%d %H:%M}, {len(runs[0]['turns'])} turns, Groq-reported token usage for every LLM call.",
        "",
        "| Strategy | Total tokens | Prompt | Completion | LLM calls | Summarization tokens | Answer prompt, last turn | vs full history |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in runs:
        t = r["totals"]
        saving = ""
        if base and r is not base and base["totals"]["total_tokens"]:
            saving = f"{100 * (1 - t['total_tokens'] / base['totals']['total_tokens']):.1f}% fewer"
        lines.append(f"| {r['strategy']} | {t['total_tokens']:,} | {t['prompt_tokens']:,} | {t['completion_tokens']:,} | "
                     f"{t['llm_calls']} | {t['summary_tokens']:,} | {r['turns'][-1]['answer_prompt_tokens']:,} | {saving} |")

    lines += ["", "## Answer prompt tokens per turn", "", "| Turn | " + " | ".join(r["strategy"] for r in runs) + " |",
              "| ---: | " + " | ".join("---:" for _ in runs) + " |"]
    for i in range(len(runs[0]["turns"])):
        lines.append(f"| {i + 1} | " + " | ".join(f"{r['turns'][i]['answer_prompt_tokens']:,}" for r in runs) + " |")

    lines += ["", "## Memory check - answer to the last question", "",
              f"> {script['questions'][len(runs[0]['turns']) - 1]}", ""]
    for r in runs:
        lines += [f"### {r['strategy']}", "", r["answers"][-1].strip(), ""]

    summary_run = next((r for r in runs if r["strategy"] == "summary"), None)
    if summary_run and summary_run["final_summary"]:
        lines += ["## Long-term summary at the end (summary strategy)", "", summary_run["final_summary"], ""]

    md_path = out_dir / f"memory_benchmark_{stamp}.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--script", default=str(HERE / "consultation_cyber_fraud.json"))
    parser.add_argument("--strategies", nargs="+", default=["full", "window", "summary"])
    parser.add_argument("--turns", type=int, default=20)
    parser.add_argument("--pause", type=float, default=4.0, help="seconds between turns (Groq rate limits)")
    parser.add_argument("--no-fixed-history", action="store_true",
                        help="let each strategy keep its own answers in history instead of the canonical transcript")
    args = parser.parse_args()

    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    questions = script["questions"][: args.turns]
    pipeline = get_pipeline()

    runs, canonical = [], None
    for strategy in args.strategies:
        print(f"\n=== Strategy: {strategy} ===")
        run = run_strategy(pipeline, strategy, questions, None if args.no_fixed_history else canonical, args.pause)
        runs.append(run)
        if canonical is None:
            canonical = run["answers"]

    report = write_report(runs, script, HERE / "results")
    print(f"\nReport written to {report}")
    base = next((r for r in runs if r["strategy"] == "full"), None)
    for r in runs:
        line = f"  {r['strategy']:8} total {r['totals']['total_tokens']:,} tokens"
        if base and r is not base:
            line += f"  ({100 * (1 - r['totals']['total_tokens'] / base['totals']['total_tokens']):.1f}% vs full)"
        print(line)


if __name__ == "__main__":
    main()
