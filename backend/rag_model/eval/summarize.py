"""
Print the retrieval ablation and answer-quality tables from eval/results as Markdown.
Usage: python eval/summarize.py
"""

import json

from common import RESULTS_DIR

ROWS = [
    ("retrieval_baseline.json", "Baseline (old chunks, dense + LLM act booster)"),
    ("retrieval_new_dense.json", "Dense only (new section chunks)"),
    ("retrieval_new_bm25.json", "BM25 only"),
    ("retrieval_new_hybrid.json", "Hybrid (dense + BM25, RRF)"),
    ("retrieval_new_hybrid_rerank.json", "Hybrid + MiniLM cross-encoder (top 20, 800 chars)"),
    ("retrieval_new_hybrid_rerank_deep.json", "Hybrid + MiniLM cross-encoder (top 30, 1500 chars)"),
    ("retrieval_new_hybrid_rerank_int8.json", "Hybrid + MiniLM cross-encoder, int8 weights"),
    ("retrieval_new_hybrid_rerank_bge.json", "Hybrid + bge-reranker-base"),
    ("retrieval_new_hybrid_rerank_noact.json", "Hybrid + MiniLM rerank, no act filter / section lookup"),
]
TYPES = ["section", "acronym", "scenario", "multilingual", "multiturn"]


def main():
    print("| Configuration | R@1 | R@5 | R@10 | MRR | p50 retrieval ms | LLM calls/q | RSS MB |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    loaded = {}
    for fname, label in ROWS:
        path = RESULTS_DIR / fname
        if not path.exists():
            continue
        s = json.load(open(path, encoding="utf-8"))["summary"]
        loaded[label] = s
        m = s["metrics"]["all"]
        print(f"| {label} | {m['recall@1']:.3f} | {m['recall@5']:.3f} | {m['recall@10']:.3f} | {m['mrr']:.3f} | "
              f"{m['retrieval_ms_p50']} | {s['llm_calls_per_query']} | {s.get('rss_mb') or '-'} |")

    print("\nRecall@5 by question type\n")
    print("| Configuration | " + " | ".join(f"{t} (n={next(iter(loaded.values()))['metrics'][t]['n']})" for t in TYPES) + " |")
    print("|---|" + "---:|" * len(TYPES))
    for label, s in loaded.items():
        print(f"| {label} | " + " | ".join(f"{s['metrics'][t]['recall@5']:.3f}" for t in TYPES) + " |")

    for name in ("answer_baseline_report.json", "answer_new_report.json"):
        path = RESULTS_DIR / name
        if path.exists():
            print(f"\n{name}:")
            print(json.dumps(json.load(open(path, encoding="utf-8"))["summary"], indent=1))


if __name__ == "__main__":
    main()
