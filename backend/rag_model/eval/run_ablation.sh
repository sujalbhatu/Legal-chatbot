#!/usr/bin/env bash
# Retrieval ablation: one process per configuration, so the memory each one reports
# (rss_mb) is only what that configuration loads.
# Run from backend/rag_model:  bash eval/run_ablation.sh
set -u
PY=${PY:-venv/Scripts/python.exe}
run() {  # run <tag> <variant> [ENV=VALUE ...]
  local tag=$1 variant=$2; shift 2
  echo "=== $variant$tag $*"
  env RETRIEVAL_MODE="$variant" "$@" "$PY" eval/run_eval.py retrieval --system new --variant "$variant" --tag "$tag" \
    > "eval/results/log_retrieval_${variant}${tag}.txt" 2>&1
  tail -n 40 "eval/results/log_retrieval_${variant}${tag}.txt" | grep -E '"recall@5"|"mrr"|rss_mb' | head -3
}
run "" dense
run "" bm25
run "" hybrid
run "" hybrid_rerank
run _bge hybrid_rerank RERANKER_MODEL=BAAI/bge-reranker-base
run _noact hybrid_rerank DISABLE_ACT_FILTER=1
run _deep hybrid_rerank RERANK_TOP_N=30 RERANK_MAX_CHARS=1500 RERANK_MAX_TOKENS=512
