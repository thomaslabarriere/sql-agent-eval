#!/usr/bin/env bash
# The single test-set pass for the base model and the final fine-tuned model
# (DECISIONS.md D5, D20). Each model is served alone, checked (check-served, D19)
# and evaluated with nothing else running, so the latencies are comparable.
# Resumable: rerunning skips items already in the result files.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=finetune/.venv/bin
serve() {
  pkill -f mlx_lm.server || true; sleep 2
  "$PY/mlx_lm.server" --model "$1" --port 8080 --log-level WARNING > "data/server-$2.log" 2>&1 &
  until curl -s -o /dev/null http://127.0.0.1:8080/v1/models; do sleep 2; done
}
serve finetune/fused/lora-a-1000 lora-a-1000
npm run -s spider -- check-served --expect finetuned
npm run -s spider -- run --split test --label lora-a-1000
serve Qwen/Qwen2.5-Coder-1.5B-Instruct base
npm run -s spider -- check-served --expect base
npm run -s spider -- run --split test --label base
pkill -f mlx_lm.server || true
echo "final test runs done"
