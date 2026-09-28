# Fine-tuning a small local model for text-to-SQL: before and after, on Spider

A LoRA fine-tune of Qwen2.5-Coder-1.5B-Instruct, trained and served on a laptop
(Apple M4 Pro, 48 GB, MLX), evaluated before and after with the same
execution-based harness on the public Spider 1.0 test set.

Every number below comes from a committed result file and can be regenerated
with the commands at the end. Anything not measured is written "not measured".

## Result (Spider test, 2147 questions, one pass per model)

| | base model | fine-tuned (LoRA) | gpt-4o-mini (reference) |
|---|---|---|---|
| execution accuracy, this harness | 59.2% (1272/2147), CI [57.2, 61.3] | **66.5%** (1427/2147), CI [64.4, 68.4] | 73.0% (1568/2147), CI [71.1, 74.9] |
| execution accuracy, official Spider evaluator | 63.2% | 71.7% | 77.6% |
| official evaluator, `--keep_distinct` | 62.8% | 70.6% | 77.9% |
| invented table or column (`schema_hallucination`) | 325 | 214 | 6 |
| runs but wrong result (`wrong_result`) | 538 | 499 | 572 |
| SQL error | 12 | 7 | 1 |
| latency mean / p50 / p95 | 612 / 539 / 1223 ms | 604 / 477 / 1275 ms | 986 / 945 / 1502 ms (network included) |
| API cost for the 2147 questions | $0 (local; electricity not measured) | $0 (local; electricity not measured) | $0.129 (measured from billed tokens) |

CI = 95% Wilson interval. Latencies: sequential requests, nothing else running on
the machine for the two local models; the API latency includes the network and is
not comparable.

Paired, question by question (base vs fine-tuned, this harness):

| right before and after | wrong before and after | **regressions** (right before, wrong after) | fixes (wrong before, right after) | net | exact McNemar p |
|---|---|---|---|---|---|
| 1164 | 612 | **108** | 263 | +7.2 points | 4.8e-16 |

The official evaluator agrees on the direction and size: 104 regressions and 270
fixes with `--keep_distinct`, 93 and 275 with its defaults.

**Reading.** The fine-tune gains 7.2 points of execution accuracy on databases it
never saw, at unchanged latency and no API cost. It closes about half of the gap
to gpt-4o-mini (59.2 to 66.5, against 73.0), not all of it. It also breaks 108
questions the base model answered correctly: the gain is net, not free.

## By difficulty (official Spider hardness buckets)

| hardness | n | base | fine-tuned | gpt-4o-mini | regressions | fixes |
|---|---|---|---|---|---|---|
| easy | 470 | 82.6% | 85.3% | 87.2% | 18 | 31 |
| medium | 857 | 59.6% | 67.3% | 72.8% | 40 | 106 |
| hard | 463 | 48.6% | 60.9% | 68.0% | 21 | 78 |
| extra | 357 | 41.5% | 46.8% | 61.3% | 29 | 48 |

Accuracy with this harness; hardness computed by the official evaluator's own
function. The largest gain is on "hard" (+12.3 points). "Extra" gains least
(+5.3) and has the worst regression-to-fix ratio (29 to 48).

## What changed, and what broke

Fixes (263), by what the base model did wrong: 144 wrong results, 116 invented
tables or columns, 3 SQL errors. Most of the schema gain is the model learning to
stay inside the given schema.

Regressions (108), by what the fine-tuned model now does wrong:

| category after | count |
|---|---|
| invented table or column | 38 |
| wrong values | 31 |
| wrong row count | 19 |
| empty result where the gold is not | 11 |
| wrong column count | 8 |
| SQL error | 1 |

11 of the 108 are accepted by the official evaluator (permuted columns); the
other 97 are wrong under both. The full list, with the SQL the model wrote, is in
`docs/finetune-test-report.md`. One regression is degenerate: the fine-tuned
model looped on a nested subquery until the 512-token limit (`test_828`), the
only truncated reply across all runs.

The model's own token probability is no warning signal, before or after: 99.2%
(base) and 99.7% (fine-tuned) of the wrong answers have a mean token probability
of 0.75 or more. gpt-4o-mini: 100%.

## Protocol

**Data.** Spider 1.0 (Yu et al., 2018), CC BY-SA 4.0, checked on the official page
on 2026-09-28. Archive `spider_data.zip`, 205,800,266 bytes, sha256
`00636695dabed6b5f4b8328a16b13e069a2f16591d5efcce57660669c85b121b`. Splits:
train 8659 (train_spider 7000 + train_others 1659), dev 1034, test 2147.

**Train / eval separation, checked, not assumed.**
- No database is shared between train, dev and test (Spider splits by database).
- 69 training examples had a question or SQL textually identical (case and spaces
  normalized) to a dev or test item, on another database (for example "How many
  clubs are there?"). They were removed from training: 8590 examples used. After
  removal, the check finds zero overlap. A test pins these numbers when the data
  is present (`test/spiderPrep.test.ts`).
- Only exact duplicates are removed. Paraphrases remain, a known property of
  Spider.
- Dev was split once: 200 fixed items for the training validation loss, 834 for
  choosing the configuration. The test set was run once per final model, after
  the model was chosen. No test number influenced any choice.

**Model.** Qwen2.5-Coder-1.5B-Instruct (Apache 2.0), Hugging Face revision
`2e1fd397ee46e1388853d2af2c993145b0f1098a`, bf16, no quantization. Chosen over the
3B variant, whose license is not Apache 2.0.

**Prompt.** One builder (`src/spider/prompt.ts`) produces both the training data
and the evaluation requests: a fixed system message, the schema rebuilt from the
SQLite metadata (tables, typed columns, primary and foreign keys, no sample
values), and the question. The model is asked for SQL only. One extraction rule
(first fenced block, else the whole reply; first statement) is applied before and
after.

**Training.** LoRA with mlx-lm 0.31.3 (mlx 0.32.2): rank 8, scale 20, dropout 0,
last 16 of 28 blocks, Adam, learning rate 1e-5, batch 4, loss on the SQL answer
only, max length 2048 (the longest example is 1929 tokens, nothing truncated),
seed 0 (`finetune/lora-a.yaml`). 5.28M trainable parameters (0.34%). One epoch
(2148 iterations) took 7305 s with a peak of 36.2 GB. The validation loss fell
from 1.143 to 0.232 in 200 iterations, reached 0.222 at 1200, then rose to 0.244
at the end of the epoch.

**Checkpoint choice.** Rule written before measuring: evaluate the end of epoch and
the saved checkpoint closest to the validation minimum (iteration 1000) on the
834-item dev set, keep the better, and the earlier one in a tie. Dev results: base
60.4%, end of epoch 67.5%, iteration 1000 68.8%. The difference between the two
checkpoints is not significant (p = 0.31), so this report does not claim early
stopping helped. The final model is the iteration-1000 checkpoint, reached 57 min
48 s after the start of training (file timestamps, validation passes included),
about 4000 examples, 0.47 epoch.

**Serving.** `mlx_lm.server` on the laptop, OpenAI-compatible API, greedy decoding,
max 512 tokens, one request at a time. The adapter is fused into the weights
(`mlx_lm.fuse`) before serving (see "Incidents").

**Verdict.** Both queries run in SQLite, read-only, in a worker with a 30 s timeout.
Results are compared by the harness comparator (`src/verify.ts`): column count
must match, column position is semantic, rows are a multiset unless the gold has
`ORDER BY`, numbers within a relative tolerance of 1e-6. The official Spider
evaluator (test-suite-sql-eval, Apache 2.0, commit e97acc5, exec mode) is run on
the same predictions as a cross-check, with a verdict per item.

**Why two evaluators disagree.** The official evaluator accepts permuted columns,
and by default removes `DISTINCT` on both sides. With `--keep_distinct` it is
never stricter than this harness on any item, in all five runs where both were
computed; on test it is more lenient on 77 (base), 88 (fine-tuned) and 104
(gpt-4o-mini) items, the column-order cases. The 3 to 30 items per run where its
default mode looked stricter were checked: identical results, but its `DISTINCT`
removal creates duplicate rows.

## Incidents found by checking, before any number was published

1. **A fifth of the gold would have failed.** Spider writes string literals in
   double quotes. Node's SQLite rejects them by default, Python's (used by the
   official evaluator) accepts them. The first gold check found 406 failing gold
   queries on test, against 0 with Python. Fixed by enabling double-quoted
   literals in the executor; a test requires it.
2. **The served "fine-tuned" model was the base model.** `mlx_lm.server` 0.31.3
   ignores `--adapter-path` without any error (its adapter lookup uses the model
   path after it has been remapped). The first fine-tuned run showed "no change",
   which contradicted the training curve. Direct generation with the adapter
   reproduced the training targets, the server did not. Fix: serve the fused
   model, and check before every run which model is actually served
   (`check-served`: exact reproduction of 20 fixed training targets; base 2/20,
   fine-tuned 9/20 and 11/20). Without this check the report would have said the
   fine-tune does nothing.

## Limitations

- **Base model contamination: likely, not proven.** On the dev set, 28 of 834 base
  model replies (3.4%) reproduce Spider's unusual spacing (`a ,  b`, `x  =  y`),
  5 of them character for character; gpt-4o-mini does it 0 times in 2147. This
  suggests Qwen saw Spider before. It affects the absolute level of both runs, and
  the base model is not more accurate on those replies (57.1% vs 60.5%), so it does
  not explain the gain. It cannot be ruled out. gpt-4o-mini has very likely seen
  Spider too.
- **Serving is not deterministic.** The same base model served twice on dev, same
  prompts, greedy decoding: 56 of 834 replies differ and 13 verdicts change. The
  test difference (371 discordant items) is far above that, but a gap of one or
  two points between two runs means little.
- **One configuration, one seed.** No hyperparameter search: mlx-lm defaults,
  one epoch, two checkpoints compared. Another rank, learning rate or number of
  epochs may do better; this was not measured.
- **The harness is stricter than the literature.** Its numbers are not comparable
  to the Spider leaderboard; the official evaluator's numbers are given for that,
  on plain Spider databases (not the distilled test suites).
- **54 test items have an empty gold result**, where any wrong query that also
  returns nothing is scored correct. Accuracy on the 2093 others: base 59.3%,
  fine-tuned 66.7%, gpt-4o-mini 73.5%.
- **Latency is this laptop's.** Memory used at inference: not measured. Energy: not
  measured. Training time was measured while an API evaluation shared the CPU for
  part of the run, so it is an upper bound.
- **Spider is a 2018 benchmark** of clean, small databases. The result says the
  fine-tune transfers across databases of that kind; it says nothing about a
  production warehouse.

## Reproduce

Requirements: Node 22, Python 3.11, uv, an Apple Silicon Mac for MLX. About 9 GB
of disk (Spider 1.9 GB, base model 3.1 GB, fused model 2.9 GB, environments).

```bash
npm install
# data (not in git): Spider 1.0, check the sha256 above
curl -L -o data/spider_data.zip "https://drive.usercontent.google.com/download?id=1403EGqzIDoHMdQF4c9Bkyl7dZLZ5Wt6J&export=download&confirm=t"
(cd data && unzip -q spider_data.zip)
# gold integrity, training data (leak check refuses to write if not clean)
npm run spider -- gold-check --split test
npm run spider -- prepare
# training environment and LoRA
uv venv --python 3.11 finetune/.venv && uv pip install --python finetune/.venv/bin/python -r finetune/requirements.txt
finetune/train.sh lora-a.yaml adapters/lora-a
mkdir -p finetune/adapters/lora-a-1000
cp finetune/adapters/lora-a/adapter_config.json finetune/adapters/lora-a-1000/
cp finetune/adapters/lora-a/0001000_adapters.safetensors finetune/adapters/lora-a-1000/adapters.safetensors
finetune/.venv/bin/mlx_lm.fuse --model <path of the Qwen snapshot at the revision above> \
  --adapter-path finetune/adapters/lora-a-1000 --save-path finetune/fused/lora-a-1000
# one test pass per model, each served alone and checked first
scripts/run-final-test.sh
# report
npm run spider -- report --split test --before base --after lora-a-1000
# official evaluator, pinned (DECISIONS.md D16)
git clone https://github.com/taoyds/test-suite-sql-eval.git data/test-suite-sql-eval
git -C data/test-suite-sql-eval checkout e97acc546ecbee8fa27fa8dbf025ef61493a876c
uv venv --python 3.11 data/evalenv
uv pip install --python data/evalenv/bin/python tqdm==4.67.1 sqlparse==0.5.3 nltk==3.9.1
data/evalenv/bin/python -c "import nltk; nltk.download('punkt_tab', download_dir='data/evalenv/nltk_data')"
data/evalenv/bin/python scripts/official_eval.py lora-a-1000 test --keep_distinct
```

The design decisions, the options rejected and why, are in `DECISIONS.md` (D1 to
D22). The tests prove they can fail: `scripts/prove-red-all.sh` sabotages the
code under each new test and requires it to go red (24 of 24).

## References

- Tao Yu et al. "Spider: A Large-Scale Human-Labeled Dataset for Complex and
  Cross-Domain Semantic Parsing and Text-to-SQL Task." EMNLP 2018. CC BY-SA 4.0.
- Ruiqi Zhong, Tao Yu, Dan Klein. "Semantic Evaluation for Text-to-SQL with
  Distilled Test Suites." EMNLP 2020. Code: github.com/taoyds/test-suite-sql-eval,
  Apache 2.0.
- Qwen2.5-Coder-1.5B-Instruct, Qwen team, Apache 2.0.
- MLX and mlx-lm, Apple, MIT.
