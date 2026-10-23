"""
Token benchmark for conversation memory: what does each memory strategy cost over a
20-turn consultation, and does the bot still remember turn-1 facts at turn 20?

Design (controlled, and affordable on Groq's 200K-tokens/day free tier):

  1. The real pipeline answers all turns with the SUMMARY strategy (last 4 messages
     verbatim + recursive long-term summary). Groq's reported usage is recorded for
     every call, including the summarization calls, so its total is net.
  2. For each turn, the answer prompt that the FULL-history and WINDOW (last 6
     messages) strategies would have sent is rebuilt from the same transcript and the
     same retrieved sources, and counted with the model's tokenizer (o200k_harmony,
     gpt-oss). Only the memory part differs, so retrieval noise does not leak into
     the comparison. The tokenizer count is calibrated against Groq's own number for
     the summary prompts (reported below).
  3. The final turn is also answered for real with the full and window prompts, and
     all three answers are checked for the turn-1 facts (script["must_mention"]).

Usage (from backend/rag_model):
    GROQ_MODELS=openai/gpt-oss-120b MEMORY_SUMMARY_MODEL=openai/gpt-oss-120b python eval/benchmark_memory.py
Results: eval/results/memory_benchmark_<timestamp>.md and .json
"""

import argparse
import json
import re
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import llm_usage  # noqa: E402
import rag_pipeline  # noqa: E402
from groq_tools import RateLimited  # noqa: E402
from memory import summary_block  # noqa: E402


class Recorder:
    """Keeps the exact messages of every 'answer' call."""

    def __init__(self, inner):
        self._inner = inner
        self.answer_messages = []

    def create(self, *args, **kwargs):
        if llm_usage._purpose.get() == "answer":
            self.answer_messages.append(kwargs["messages"])
        return self._inner.create(*args, **kwargs)


def count_tokens(enc, messages):
    # ~4 tokens of chat-format overhead per message; calibrated against Groq below
    return sum(len(enc.encode(m["content"])) + 4 for m in messages)


def fact_check(answer, script):
    hits = {p: bool(re.search(p, answer or "", re.IGNORECASE)) for p in script.get("must_mention", [])}
    return {"passed": all(hits.values()) if hits else None, "patterns": hits}


def base_system(messages):
    """The system prompt without the long-term summary block."""
    system = messages[0]["content"]
    block = summary_block("x")
    marker = block[: block.index("x")]
    return system.split(marker)[0] if marker in system else system


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default=str(HERE / "consultation_cyber_fraud.json"))
    ap.add_argument("--pause", type=float, default=8.0)
    ap.add_argument("--window", type=int, default=6)
    args = ap.parse_args()

    import tiktoken
    enc = tiktoken.get_encoding("o200k_harmony")
    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    questions = script["questions"]

    rec = Recorder(RateLimited(rag_pipeline.groq_client.chat.completions._inner, max_wait_s=900))
    rag_pipeline.groq_client.chat.completions._inner = rec
    pipeline = rag_pipeline.get_pipeline()
    pipeline.memory_strategy = "summary"

    transcript, history, summary, turns = [], [], "", []
    full = window = None
    final_summary_answer = ""
    for i, question in enumerate(questions, 1):
        result = pipeline.query(question, history, None, summary)
        usage, memory = result["usage"], result.get("memory") or {}
        msgs = rec.answer_messages[-1]
        answer_bucket = usage["by_purpose"].get("answer", {})
        system_wo_summary = base_system(msgs)
        full = [{"role": "system", "content": system_wo_summary}] + transcript + [{"role": "user", "content": question}]
        window = [{"role": "system", "content": system_wo_summary}] + transcript[-args.window:] + \
            [{"role": "user", "content": question}]
        turns.append({
            "turn": i,
            "summary_answer_prompt_groq": answer_bucket.get("prompt_tokens", 0),
            "summary_answer_prompt_counted": count_tokens(enc, msgs),
            "full_answer_prompt_counted": count_tokens(enc, full),
            "window_answer_prompt_counted": count_tokens(enc, window),
            "summary_turn_total_groq": usage["total_tokens"],
            "summarizer_tokens": sum(usage["by_purpose"].get("memory_summary", {}).get(k, 0)
                                     for k in ("prompt_tokens", "completion_tokens")),
            "rewrite_tokens": sum(usage["by_purpose"].get("query_rewrite", {}).get(k, 0)
                                  for k in ("prompt_tokens", "completion_tokens")),
            "answer_completion_tokens": answer_bucket.get("completion_tokens", 0),
            "folded": memory.get("summarized_count", 0),
        })
        t = turns[-1]
        print(f"turn {i:2}: summary prompt {t['summary_answer_prompt_groq']:6} (counted {t['summary_answer_prompt_counted']:6}) "
              f"| full {t['full_answer_prompt_counted']:6} | window {t['window_answer_prompt_counted']:6} "
              f"| summarizer {t['summarizer_tokens']}", flush=True)

        if memory.get("summarized_count"):
            history = history[memory["summarized_count"]:]
            summary = memory.get("summary", "")
        turn_msgs = [{"role": "user", "content": question}, {"role": "assistant", "content": result["answer"]}]
        history += turn_msgs
        transcript += turn_msgs
        final_summary_answer = result["answer"]
        time.sleep(args.pause)

    # Real final-turn answers with the full and window prompts
    finals = {"summary": final_summary_answer}
    for name, prompt in (("full", full), ("window", window)):
        token = llm_usage.begin()
        raw, _ = pipeline._generate(prompt)
        finals[name] = rag_pipeline.split_followups(raw)[0]
        turns[-1][f"{name}_answer_prompt_groq"] = llm_usage.end(token)["prompt_tokens"]
        time.sleep(args.pause)

    # Calibration of the tokenizer count against Groq's numbers
    ratios = [t["summary_answer_prompt_groq"] / t["summary_answer_prompt_counted"]
              for t in turns if t["summary_answer_prompt_counted"] and t["summary_answer_prompt_groq"]]
    k = statistics.median(ratios)

    def total(key):
        return sum(t[key] for t in turns)

    summary_prompts = total("summary_answer_prompt_groq")
    summarizer = total("summarizer_tokens")
    full_prompts = round(total("full_answer_prompt_counted") * k)
    window_prompts = round(total("window_answer_prompt_counted") * k)
    checks = {name: fact_check(ans, script) for name, ans in finals.items()}
    last = {"full": turns[-1].get("full_answer_prompt_groq"), "window": turns[-1].get("window_answer_prompt_groq"),
            "summary": turns[-1]["summary_answer_prompt_groq"]}
    report = {
        "model": rag_pipeline.ANSWER_MODELS[0], "summary_model": rag_pipeline.MEMORY_SUMMARY_MODEL,
        "turns": turns, "calibration_ratio_groq_over_counted": round(k, 3),
        "calibration_ratio_range": [round(min(ratios), 3), round(max(ratios), 3)],
        "answer_prompt_tokens_total": {"full": full_prompts, "window": window_prompts, "summary": summary_prompts},
        "summarizer_tokens_total": summarizer,
        "last_turn_answer_prompt": last,
        "fact_check_turn_20": checks, "final_answers": finals, "final_summary": summary,
    }
    out = HERE / "results" / f"memory_benchmark_{datetime.now():%Y%m%d_%H%M%S}"
    out.with_suffix(".json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")

    lines = [f"# Memory benchmark - {script['name']}", "",
             f"{datetime.now():%Y-%m-%d}, {len(turns)} turns, answer model {report['model']}, "
             f"summarizer {report['summary_model']}.", "",
             "| Strategy | Answer-prompt tokens, 20 turns | + summarization | Net | vs full | Last-turn answer prompt | Turn-1 facts at turn 20 |",
             "|---|---:|---:|---:|---:|---:|---|"]
    for name, key, prompts, extra in (("full history", "full", full_prompts, 0),
                                      (f"window (last {args.window})", "window", window_prompts, 0),
                                      ("summary (last 4 + recursive summary)", "summary", summary_prompts, summarizer)):
        net = prompts + extra
        lines.append(f"| {name} | {prompts:,} | {extra:,} | {net:,} | {100 * (1 - net / full_prompts):.1f}% fewer | "
                     f"{last[key]:,} | {'PASS' if checks[key]['passed'] else 'FAIL'} {checks[key]['patterns']} |")
    lines += ["", "Full and window totals are tokenizer counts (o200k_harmony) of the prompts those strategies would send "
              "on the same transcript with the same retrieved sources, scaled by the median Groq/tokenizer ratio "
              f"measured on the summary prompts ({k:.3f}, range {report['calibration_ratio_range']}). "
              "Last-turn prompts are Groq-reported from real calls.", "",
              "## Final answers (turn 20)", "", f"> {questions[-1]}", ""]
    for name, ans in finals.items():
        lines += [f"### {name}", "", (ans or "").strip(), ""]
    lines += ["## Long-term summary after 20 turns", "", summary]
    out.with_suffix(".md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:10]))
    print(f"\nReport: {out}.md")


if __name__ == "__main__":
    main()
