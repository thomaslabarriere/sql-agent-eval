#!/usr/bin/env bash
# Train a LoRA adapter on Spider train (cleaned, see DECISIONS.md D12).
# Usage: finetune/train.sh <config.yaml> <adapter-dir>
# Prerequisites: npm run spider -- prepare  (writes finetune/data/{train,valid}.jsonl)
set -euo pipefail
cd "$(dirname "$0")"
config="$1"; out="$2"
model="$(.venv/bin/python -c 'from huggingface_hub import snapshot_download; print(snapshot_download("Qwen/Qwen2.5-Coder-1.5B-Instruct", revision="2e1fd397ee46e1388853d2af2c993145b0f1098a"))')"
mkdir -p "$out" logs
log="logs/$(basename "$out").log"
echo "model: $model" | tee "$log"
/usr/bin/time -l .venv/bin/mlx_lm.lora -c "$config" --model "$model" --train --data data --adapter-path "$out" 2>&1 | tee -a "$log"
