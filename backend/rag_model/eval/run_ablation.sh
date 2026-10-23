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
}
run "" dense
run "" bm25
run "" hybrid
run "" hybrid_rerank
run _int8 hybrid_rerank RERANKER_INT8=1
run _noact hybrid_rerank DISABLE_ACT_FILTER=1
if [ "${FULL:-0}" = "1" ]; then
  run _bge hybrid_rerank RERANKER_MODEL=BAAI/bge-reranker-base
  run _deep hybrid_rerank RERANK_TOP_N=30 RERANK_MAX_CHARS=1500 RERANK_MAX_TOKENS=512
fi
