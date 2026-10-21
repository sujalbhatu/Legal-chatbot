#!/usr/bin/env bash
# End-to-end answer comparison on the same answer model (gpt-oss-20b) and the same
# 31-question stratified subset, then the same judge (qwen3.8-27b) for both.
# Run from backend/rag_model:  bash eval/run_answers.sh [--after 2026-10-22T16:45:00Z]
# --after waits for Groq's rolling 24h token window (200K/day/model on the free tier).
set -u
PY=${PY:-venv/Scripts/python.exe}
BASELINE_DIR=${BASELINE_DIR:-"C:\\Users\\Sujal Bhatu\\Desktop\\legel2\\baseline_bdababc\\backend\\rag_model"}
if [ "${1:-}" = "--after" ]; then
  target=$(date -u -d "$2" +%s)
  while [ "$(date -u +%s)" -lt "$target" ]; do sleep 300; done
fi
echo "start $(date -u +%FT%TZ)"
# baseline: only the questions not answered yet (6 hit today's quota)
EVAL_RAG_DIR="$BASELINE_DIR" "$PY" eval/run_eval.py answer --system baseline --subset 30 --pause 35 \
  >> eval/results/log_answer_baseline.txt 2>&1
"$PY" eval/run_eval.py answer --system new --subset 30 --pause 35 > eval/results/log_answer_new.txt 2>&1
"$PY" eval/run_eval.py judge --run answer_baseline.jsonl > eval/results/log_judge_baseline.txt 2>&1
"$PY" eval/run_eval.py judge --run answer_new.jsonl > eval/results/log_judge_new.txt 2>&1
echo "done $(date -u +%FT%TZ)"
