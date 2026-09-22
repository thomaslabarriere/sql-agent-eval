# sql-agent-eval

A reliability harness for text-to-SQL agents. A generated query is not correct
because it runs. This executes the agent's SQL, compares its result to a gold
result on the same data, and measures whether the evaluation catches the
failures it is supposed to catch. The verdict is a deterministic comparison, not
an LLM's opinion.

```
question -> agent -> SQL -> execute -> result -> compare to gold -> deterministic verdict
```

The five outcomes name what went wrong, not just pass or fail:

```
correct               result matches the gold result
wrong_result          the SQL runs but returns the wrong answer   <- the dangerous one
sql_error             the SQL does not execute
schema_hallucination  it references a table or column that does not exist
ambiguous_question    it answered an underspecified question it should have flagged
```

## Why wrong_result is the point

An agent can write `SELECT AVG(amount) FROM orders WHERE status = 'paid'` when the
question asked for the median, or for `active_customers`. The query is valid,
DuckDB runs it, the number looks plausible, and it is wrong. Only comparing the
result to ground truth catches it. That is the failure this harness exists to
measure.

## The verifier is a real component

"Same result" is subtle, so the comparator (`src/verify.ts`) is deliberate:

- column COUNT must match; column aliases are ignored (a right answer with a
  different alias still matches); column POSITION is treated as semantic;
- rows compare as an unordered multiset, except when the question asks for a
  ranking, where order matters too;
- numbers compare within a documented float tolerance; BigInt counts and dates
  are normalized on both sides before comparison;
- differences are diagnosed: `column_count`, `row_count`, `empty_vs_nonempty`,
  `order`, `values`.

## The benchmark

Five levels, over a deterministic 100k+ row DuckDB dataset (users, apps, usage
events, orders). This is data-intensive local evaluation, not BigQuery-scale.

1. basic filters and aggregates
2. group-by analytics, ratios, top-k
3. joins (one-to-many, missing joins, duplicate amplification)
4. temporal (monthly counts, running totals, date boundaries)
5. business-logic traps: `COUNT` vs `COUNT(DISTINCT ...)`, the wrong side of a
   `LEFT JOIN`, a flipped status filter, a dropped filter, wrong denominators

Ambiguous questions are included: the correct behavior there is to abstain and
ask for clarification, not to guess.

## What it measures

- **accuracy**, and **accuracy by level** so you see where an agent breaks (the
  traps in level 5);
- **confidence x correctness**: the headline is not "87 percent accuracy" but
  what share of the wrong answers were held at high confidence, the quadrant that
  matters for a business user trusting a number;
- **gold-SQL mutation kill rate**: mutate a gold query (count vs count-distinct,
  wrong join, flipped status) and the verifier must catch that the result changed.
  A surviving mutant is reported as a coverage gap, not a pass. The report splits
  the kills into those caught by the result comparator (the thesis) and those
  caught by error classification (broken syntax, hallucinated column), so a 100
  percent rate is not read as all-comparator.

## What the real run shows

A gpt-4o-mini run (`docs/gpt4o-run.txt`) compares three strategies on the same
benchmark and data, and the numbers decide, rather than being assumed:

```
strategy   accuracy   schema_hallucination   note
baseline        45%                     10    guesses column names, invents schema
schema-aware    85%                      1    the schema is the big win (+40 points)
agentic         85%                      0    retry fixes execution, not correctness
```

Two findings worth the harness: schema access is what moves accuracy, while
agentic retry only turns a query that fails to run into one that runs and is
still wrong. And every wrong answer came back at high confidence (mean confidence
on wrong answers 0.97, above 0.96 on right ones), so the model's confidence gives
no warning. That last number, not the headline accuracy, is the one that matters
for anyone trusting a generated query.

## Run it

Offline, no API key, no network:

```bash
npm install
npm test          # 30 tests
npm run report    # deterministic scorecard + mutation kill rate
```

Live, with a real model:

```bash
OPENAI_API_KEY=sk-... MODEL=gpt-4o-mini npm run live
```

See `docs/offline-report.txt` for a committed run, `docs/gpt4o-run.txt` for a
real gpt-4o-mini run, `docs/DECISIONS.md` for the design rationale and honest
limits, and `docs/BUG-PATTERNS.md` for the traps and how they are caught.

## Honest limitations

The dataset is synthetic (deterministic, generated SQL-side), not production
data. The offline scorecard uses a scripted stand-in agent to exercise the
verifier across every category, so its accuracy is not an agent-quality claim;
the live run and the mutation kill rate are the real signals. The verifier
treats column order as semantic and row order as noise unless the question asks
for a ranking, which is a deliberate, documented choice.

## License

MIT
