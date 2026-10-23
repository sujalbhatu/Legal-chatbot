"""
Evaluate the legal RAG system on eval/questions.jsonl.

Two stages:

  retrieval  Recall@1/5/10 and MRR of the gold (act, section) in the ranked context
             list, per question type. Cheap: only the pipeline's own small LLM calls
             (act detection / translation) are made, and they are cached.

  answer     Runs the full pipeline (uncached) on a stratified subset and records the
             answer, citations, latency, Groq calls and tokens. Then:
               * citation precision   - share of citation cards shown to the user that are gold
               * unsupported citations - "Section N" / "Article N" in the answer that is not in
                                         the retrieved context (deterministic check)
               * hallucination rate   - LLM judge (gpt-oss-120b): does the answer state legal
                                         facts the context does not support? (cached)
               * right language       - answer written in the question's script
               * abstention           - out-of-corpus questions answered with "not found"

Usage (from backend/rag_model):
  python eval/run_eval.py retrieval --system baseline
  python eval/run_eval.py retrieval --system new --variant hybrid_rerank
  python eval/run_eval.py answer --system baseline --subset 30
  python eval/run_eval.py judge --run results/answer_baseline.jsonl

The baseline system is the pipeline code at commit bdababc, unchanged: its final
context list is captured right before it is formatted into the prompt. Live scraping
(IndiaCode / DuckDuckGo) is disabled during evaluation so runs are reproducible.
"""

import argparse
import json
import os
import re
import statistics
import time
from collections import defaultdict

from common import RESULTS_DIR, gold_pairs, load_questions, source_key

LANG_SCRIPTS = {
    "en": r"[A-Za-z]", "hi": r"[ऀ-ॿ]", "mr": r"[ऀ-ॿ]",
    "bn": r"[ঀ-৿]", "as": r"[ঀ-৿]", "or": r"[଀-୿]",
    "ta": r"[஀-௿]", "gu": r"[઀-૿]", "sat": r"[᱐-᱿]",
}
CITE_RE = re.compile(r"(?:Section|Sec\.|Article|Art\.|धारा|अनुच्छेद)\s*(\d{1,3}[A-Z]{0,2})", re.IGNORECASE)


def load_pipeline(system, cache):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import rag_pipeline
    import groq_tools
    import indiacode_fetcher
    # No live scraping while evaluating: every act in the eval is already indexed.
    indiacode_fetcher.search_indiacode = lambda *a, **k: ""
    if hasattr(indiacode_fetcher, "perform_web_search_context"):   # baseline code only
        indiacode_fetcher.perform_web_search_context = lambda *a, **k: ""
    wrapper = groq_tools.install(rag_pipeline.groq_client, cache=cache)
    return rag_pipeline, rag_pipeline.get_pipeline(), wrapper


def _rate_limiter(wrapper):
    return wrapper._inner if hasattr(wrapper, "hits") else wrapper


def _rss_mb():
    """Resident memory of this process (models + index loaded), in MB."""
    try:
        import psutil
        return round(psutil.Process().memory_info().rss / 2**20)
    except ImportError:
        return None


def ui_language(q):
    return q["lang"] if q["lang"] in LANG_SCRIPTS else None


class _Stop(Exception):
    pass


def baseline_context(pipeline, q):
    """Run the unchanged baseline up to the prompt and return its final context list."""
    captured = {"sources": []}
    original = pipeline.format_context

    def capture(sources):
        captured["sources"] = list(sources)
        raise _Stop

    pipeline.format_context = capture
    try:
        pipeline._run_query(q["question"], q.get("history") or [], ui_language(q), "")
    except _Stop:
        pass
    finally:
        pipeline.format_context = original
    return [{"metadata": s["metadata"], "score": s.get("similarity")} for s in captured["sources"]]


def ranked_sections(context):
    """Unique (stem, section) in rank order; parts of one section count once."""
    seen, ranked = set(), []
    for c in context:
        key = source_key(c["metadata"])
        if key not in seen:
            seen.add(key)
            ranked.append(key)
    return ranked


def retrieval_metrics(rows):
    out = {}
    groups = defaultdict(list)
    for r in rows:
        if r["gold"]:
            groups["all"].append(r)
            groups[r["type"]].append(r)
    for name, rs in groups.items():
        def recall(k):
            return sum(1 for r in rs if r["first_gold_rank"] and r["first_gold_rank"] <= k) / len(rs)
        out[name] = {
            "n": len(rs),
            "recall@1": round(recall(1), 3), "recall@5": round(recall(5), 3), "recall@10": round(recall(10), 3),
            "mrr": round(sum(1 / r["first_gold_rank"] for r in rs if r["first_gold_rank"]) / len(rs), 3),
            "retrieval_ms_p50": round(statistics.median(r["ms"] for r in rs)),
        }
    return out


def run_retrieval(args):
    rag_pipeline, pipeline, wrapper = load_pipeline(args.system, cache=True)
    import llm_usage
    questions = load_questions()[:args.limit or None]
    rows = []
    for i, q in enumerate(questions):
        token = llm_usage.begin()
        t0 = time.perf_counter()
        if args.system == "baseline":
            context = baseline_context(pipeline, q)
        else:
            context = pipeline.retrieve_for_eval(q["question"], q.get("history") or [], ui_language(q), args.variant)
        ms = (time.perf_counter() - t0) * 1000
        usage = llm_usage.end(token)
        ranked = ranked_sections(context)[:10]
        gold = gold_pairs(q)
        first = next((i + 1 for i, key in enumerate(ranked) if key in gold), None)
        rows.append({"id": q["id"], "type": q["type"], "gold": sorted(gold), "first_gold_rank": first,
                     "ranked": ranked, "ms": round(ms), "top_score": context[0].get("score") if context else None, "llm_calls": usage["llm_calls"],
                     "tokens": usage["total_tokens"]})
        print(f"[{i + 1}/{len(questions)}] {q['id']:6} rank={first} ms={ms:.0f} calls={usage['llm_calls']}", flush=True)
        if args.retrieval_pause:   # stay under a hosted reranker's tokens-per-minute limit
            time.sleep(args.retrieval_pause)

    name = f"retrieval_{args.system}" + (f"_{args.variant}" if args.system != "baseline" else "") + args.tag
    summary = {"system": args.system, "variant": args.variant, "metrics": retrieval_metrics(rows),
               "llm_calls_per_query": round(sum(r["llm_calls"] for r in rows) / len(rows), 2),
               "tokens_per_query": round(sum(r["tokens"] for r in rows) / len(rows)),
               "rate_limit_waits": _rate_limiter(wrapper).waits,
               "rss_mb": _rss_mb(),
               "config": {k: os.environ.get(k) for k in
                          ("RETRIEVAL_MODE", "RERANKER_MODEL", "RERANK_TOP_N", "RERANK_MAX_CHARS",
                           "DISABLE_ACT_FILTER", "EMBEDDING_MODEL", "QUERY_EXPANSION", "EXPAND_MODEL",
                           "REWRITE_MODEL") if os.environ.get(k)}}
    RESULTS_DIR.mkdir(exist_ok=True)
    with open(RESULTS_DIR / f"{name}.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "rows": rows}, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, indent=1))


def answer_subset(questions, n):
    """Stratified, deterministic subset: every type represented in proportion."""
    by_type = defaultdict(list)
    for q in questions:
        by_type[q["type"]].append(q)
    picked = []
    total = len(questions)
    for t, qs in sorted(by_type.items()):
        k = max(2, round(n * len(qs) / total))
        step = max(1, len(qs) // k)
        picked.extend(qs[::step][:k])
    return picked


def run_answers(args):
    rag_pipeline, pipeline, wrapper = load_pipeline(args.system, cache=False)
    questions = answer_subset(load_questions(), args.subset)
    out_path = RESULTS_DIR / f"answer_{args.system}{args.tag}.jsonl"
    done = set()
    if out_path.exists():
        with open(out_path, encoding="utf-8") as f:
            done = {json.loads(l)["id"] for l in f if l.strip()}

    for i, q in enumerate(questions):
        if q["id"] in done:
            continue
        captured = {}
        # The baseline builds its prompt in format_context(); the new pipeline returns
        # its context in result["context_sources"] instead.
        original = getattr(pipeline, "format_context", None)

        def capture(sources, _orig=original):
            captured["context"] = list(sources)
            return _orig(sources)

        if original:
            pipeline.format_context = capture
        waited_before = _rate_limiter(wrapper).waited_s
        t0 = time.perf_counter()
        try:
            if args.system == "new":
                # the streaming path, as users get it, so time-to-first-token is measured
                result = None
                for event, payload in pipeline.stream(q["question"], q.get("history") or [], ui_language(q), ""):
                    if event == "done":
                        result = payload
            else:
                result = pipeline.query(q["question"], q.get("history") or [], ui_language(q), "")
            error = None
        except Exception as e:
            result, error = {"answer": None, "sources": [], "usage": {}}, str(e)[:200]
        finally:
            if original:
                pipeline.format_context = original
        rl_wait_ms = (_rate_limiter(wrapper).waited_s - waited_before) * 1000
        ms = (time.perf_counter() - t0) * 1000 - rl_wait_ms
        context = result.get("context_sources") or captured.get("context", [])
        rec = {
            "id": q["id"], "type": q["type"], "lang": q["lang"], "question": q["question"],
            "gold": sorted(gold_pairs(q)), "answer": result.get("answer"), "error": error,
            "answer_language": result.get("language"),
            "shown_sources": [{"act": s.get("act_name"), "section": s.get("section"),
                               "source_file": s.get("source_file", ""), "score": s.get("similarity", s.get("score"))}
                              for s in result.get("sources", [])],
            "context": [{"key": list(source_key(c["metadata"])), "text": c.get("text", "")[:1500]} for c in context],
            "latency_ms": round(ms), "ttft_ms": result.get("ttft_ms"), "rate_limit_wait_ms": round(rl_wait_ms),
            "usage": result.get("usage", {}),
        }
        with open(out_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"[{i + 1}/{len(questions)}] {q['id']:6} {ms / 1000:.1f}s calls={rec['usage'].get('llm_calls')} "
              f"tokens={rec['usage'].get('total_tokens')} err={error}", flush=True)
        time.sleep(args.pause)


JUDGE_PROMPT = """You check answers from an Indian legal assistant for unsupported claims.
You get the CONTEXT (the only legal text the assistant was given) and the ANSWER.

A claim is UNSUPPORTED if the answer states a specific legal fact - a section/article number, a punishment, a fine, a time limit, a condition, or what a law says - that the CONTEXT does not contain or contradicts. General advice ("consult a lawyer", "keep records") and disclaimers are not claims.

Also say whether the answer ABSTAINED: it clearly says it could not find the answer in the available laws/documents instead of answering.

Reply with JSON only:
{"unsupported_claims": ["short quote", ...], "abstained": true/false}"""


def run_judge(args):
    import groq_tools
    from dotenv import load_dotenv
    from groq import Groq
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    client = groq_tools.Cached(groq_tools.RateLimited(Groq(api_key=os.environ["GROQ_API_KEY"]).chat.completions))
    path = RESULTS_DIR / args.run if not os.path.isabs(args.run) else args.run
    with open(path, encoding="utf-8") as f:
        recs = [json.loads(l) for l in f if l.strip()]

    for rec in recs:
        if not rec.get("answer"):
            rec["judge"] = None
            continue
        context = "\n\n".join(f"[{c['key'][0]} s.{c['key'][1]}]\n{c['text']}" for c in rec["context"]) or "(no context)"
        resp = client.create(
            model=args.judge_model,
            messages=[{"role": "system", "content": JUDGE_PROMPT},
                      {"role": "user", "content": f"CONTEXT:\n{context[:8000]}\n\nANSWER:\n{rec['answer']}"}],
            temperature=0, max_tokens=1500, response_format={"type": "json_object"},
            **({"reasoning_effort": "low"} if args.judge_model.startswith("openai/gpt-oss") else {}))
        try:
            rec["judge"] = json.loads(resp.choices[0].message.content)
        except Exception:
            rec["judge"] = {"error": "unparseable"}
    report = answer_report(recs)
    out = str(path).replace(".jsonl", "_report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"summary": report, "records": recs}, f, ensure_ascii=False, indent=1)
    print(json.dumps(report, indent=1))


def _act_name_stems():
    """Act display name (lower case) -> file stem, from old and current chunk files."""
    from common import DATA_DIR
    names = {}
    for folder in ("chunks_v1", "chunks"):
        for path in (DATA_DIR / folder).glob("*_chunks.jsonl"):
            with open(path, encoding="utf-8") as f:
                meta = json.loads(f.readline())["metadata"]
            names.setdefault(meta["act_name"].lower(), meta["source_file"].rsplit(".txt", 1)[0])
    return names


def answer_report(recs):
    answered = [r for r in recs if r.get("answer")]
    lat = sorted(r["latency_ms"] for r in answered)
    ttft = sorted(r["ttft_ms"] for r in answered if r.get("ttft_ms"))

    def pct(xs, p):
        return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))] if xs else None

    act_stems = _act_name_stems()

    def stem_of(s):
        # the baseline's citation cards carry only the act's display name
        return s["source_file"].rsplit(".txt", 1)[0] or act_stems.get((s["act"] or "").lower(), s["act"])

    shown = [(stem_of(s), s["section"]) for r in answered for s in r["shown_sources"]]
    shown_gold = sum(1 for r in answered for s in r["shown_sources"]
                     if [stem_of(s), str(s["section"])] in r["gold"])
    cites = unsupported = 0
    for r in answered:
        ctx_secs = {c["key"][1] for c in r["context"]}
        ctx_text = " ".join(c["text"] for c in r["context"])
        for num in set(CITE_RE.findall(r["answer"])):
            cites += 1
            if num not in ctx_secs and not re.search(rf"\b{re.escape(num)}\b", ctx_text):
                unsupported += 1
    judged = [r for r in answered if r.get("judge") and "unsupported_claims" in r["judge"] and r["type"] != "ooc"]
    langs = [r for r in answered if r["lang"] in LANG_SCRIPTS]
    right_lang = sum(1 for r in langs if _in_script(r["answer"], r["lang"]))
    ooc = [r for r in answered if r["type"] == "ooc"]
    return {
        "answered": len(answered), "failed": len(recs) - len(answered),
        "latency_ms_p50": pct(lat, 0.5), "latency_ms_p95": pct(lat, 0.95),
        "ttft_ms_p50": pct(ttft, 0.5), "ttft_ms_p95": pct(ttft, 0.95),
        "llm_calls_per_query": round(statistics.mean(r["usage"].get("llm_calls", 0) for r in answered), 2) if answered else None,
        "tokens_per_query": round(statistics.mean(r["usage"].get("total_tokens", 0) for r in answered)) if answered else None,
        "citation_cards_per_answer": round(len(shown) / len(answered), 2) if answered else None,
        "citation_precision": round(shown_gold / len(shown), 3) if shown else None,
        "cited_sections_in_answers": cites,
        "unsupported_citation_rate": round(unsupported / cites, 3) if cites else None,
        "judged": len(judged),
        "hallucination_rate": round(sum(1 for r in judged if r["judge"]["unsupported_claims"]) / len(judged), 3) if judged else None,
        "right_language_rate": round(right_lang / len(langs), 3) if langs else None,
        "ooc_abstention_rate": round(sum(1 for r in ooc if (r.get("judge") or {}).get("abstained")) / len(ooc), 3) if ooc else None,
    }


def _in_script(text, lang):
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    hits = sum(1 for ch in letters if re.match(LANG_SCRIPTS[lang], ch))
    if lang == "as":   # Assamese and Bengali share a block; Assamese uses ৰ / ৱ
        return hits / len(letters) > 0.5 and ("ৰ" in text or "ৱ" in text)
    if lang == "bn":
        return hits / len(letters) > 0.5 and "ৰ" not in text
    return hits / len(letters) > 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["retrieval", "answer", "judge"])
    ap.add_argument("--system", default="baseline", choices=["baseline", "new"])
    ap.add_argument("--variant", default="hybrid_rerank")
    ap.add_argument("--subset", type=int, default=30)
    ap.add_argument("--tag", default="")
    ap.add_argument("--pause", type=float, default=2.0)
    ap.add_argument("--retrieval-pause", type=float, default=0.0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--run")
    ap.add_argument("--judge-model", default="qwen/qwen3.8-27b")
    args = ap.parse_args()
    {"retrieval": run_retrieval, "answer": run_answers, "judge": run_judge}[args.stage](args)


if __name__ == "__main__":
    main()
