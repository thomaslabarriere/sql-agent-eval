# Design decisions

Short record of the choices behind the harness, and the honest limits.

## The verdict is execution, never a model
The whole thesis is that a text-to-SQL agent is not correct because its query
runs. So correctness is decided by executing the agent's SQL and the gold SQL on
the same data and comparing results. No LLM is in the verdict. The optional LLM
only ever plays the role of the agent under test, never the judge.

## "Same result" is a real problem, so the comparator is a real component
A naive equality check would be wrong in both directions. Two correct queries can
differ by column alias or row order; two different queries can look equal under a
sloppy comparison. `src/verify.ts` therefore:
- ignores column aliases (compares by position) but treats column position as
  semantic, because the projection order is part of what the question asked;
- compares rows as an unordered multiset, except when the question imposes a
  ranking, where order is semantic and a right-rows-wrong-order answer is flagged
  as `order`, distinct from a `values` difference;
- normalizes BigInt counts, dates, and decimals on both sides, and compares
  numbers within a documented float tolerance;
- distinguishes `empty_vs_nonempty` from a general `row_count` difference,
  because an empty result is a common and meaningful failure.

## Attribution, not pass/fail
When an agent is wrong, the category says who has to act: `wrong_result` (the
query logic), `sql_error` (it did not run), `schema_hallucination` (it invented a
column), `ambiguous_question` (the question was underspecified and it should have
declined). `wrong_result` is the valuable, hard case: a query that runs and looks
right but is not.

## Abstention is a correct behavior
On an underspecified question ("show me the best apps", "how many active users"),
the right move is to abstain and ask for clarification. The verifier scores
abstention as `correct` on ambiguous questions, and answering an ambiguous
question as `ambiguous_question`. A good agent does not always answer.

## Confidence is separated from correctness
The headline is not accuracy. A text-to-SQL agent that returns a wrong number to
a business user while sure of itself is the failure that costs money. So the
scorecard reports a confidence-by-correctness quadrant and, above all, the share
of wrong answers held at high confidence. Accuracy without that number hides the
risk.

## Mutation testing of the gold queries
`src/metrics/mutation.ts` mutates each gold query (count vs count-distinct, wrong
join side, flipped status, dropped filter, hallucinated column, broken syntax),
feeds the mutant to the verifier, and requires the verdict to stop being
`correct`. A mutation that survives means the gold query and the dataset do not
actually depend on what it changed, so it is reported as a coverage gap, not a
pass. This proves the benchmark catches real SQL errors rather than trusting that
a query which runs is right.

## Deterministic data, generated SQL-side
The dataset is built with `range()` and `hash()` inside DuckDB, so it is fully
reproducible with no RNG state in TypeScript, and 100k+ rows generate in
milliseconds. Gold answers are derived by executing the gold SQL on this data, so
they can never drift from it.

## The offline agent is a stand-in
Running with no API key uses a scripted agent: it emits the gold SQL, a mutated
gold SQL, or an abstention per question, purely to exercise the verifier across
every category reproducibly. Its accuracy in the offline report is not a claim
about any agent's quality. The real accuracy, the by-level breakdown, and the
confident-but-wrong numbers come from the live model run in docs/gpt4o-run.txt.

## Honest limitations
- The dataset is synthetic. The schema and the traps are realistic; the numbers
  are on generated data, not production traffic. This is data-intensive local
  evaluation, not a scale benchmark.
- The comparator's choices (column order semantic, row order noise unless ranked,
  a fixed float tolerance) are deliberate and documented, but they are choices; a
  different task might want different rules.
- The LLM agent sees only the schema and the question. The question is fenced as
  untrusted data and the model is told to ignore instructions inside it, but a
  crafted question could still steer the SQL. The verifier catches a wrong result
  regardless, which is the mitigation.
- Because the harness executes model-generated SQL, the DuckDB connection is
  locked down at open time (`enable_external_access = false`, then
  `lock_configuration = true`), so a generated query cannot read or write local
  files or load extensions. Only in-memory queries over the synthetic data run.
