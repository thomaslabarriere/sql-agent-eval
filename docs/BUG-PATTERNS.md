# SQL traps and how they are caught

The Level 5 questions are the point of the benchmark: a query that runs can still
be wrong for a business reason. Each trap below is a real mistake a text-to-SQL
agent makes, the mutation that reproduces it, and how the verifier catches it.

## 1. COUNT vs COUNT(DISTINCT ...)
"How many distinct users are active" is not `COUNT(*)`; a user has many events.
Mutation `count_distinct_to_count` drops the DISTINCT. The result jumps from the
number of users to the number of events, and the verifier flags `wrong_result`.

## 2. Wrong side of a LEFT JOIN
"How many users have never placed an order" needs a LEFT JOIN and an IS NULL
check. Mutation `left_join_to_inner` turns it into an INNER JOIN, so the IS NULL
condition matches nothing and the count collapses to zero. Caught as
`wrong_result` (or `empty_vs_nonempty` when the shape changes).

## 3. Flipped status filter
"Total paid revenue" filters `status = 'paid'`. Mutation `flip_status_paid`
changes it to `'refunded'`, a completely different number that still runs. Caught
as `wrong_result`.

## 4. Dropped filter
"Users from France" or "orders in January" carry a WHERE clause. Mutation
`drop_where` removes it, so the query counts everything. The result is larger and
wrong, and the verifier catches it.

## 5. Hallucinated column
An agent can reference a column that does not exist (`usr_id` for `user_id`).
Mutation `hallucinate_column` reproduces it. DuckDB raises a binder error and the
harness classifies it as `schema_hallucination`, distinct from a plain syntax
error.

## 6. Broken syntax
Mutation `break_syntax` corrupts the query so it does not parse. Caught as
`sql_error`.

## Surviving mutants are gaps, not passes
If a mutation leaves the result unchanged (for example a LEFT JOIN that had no
unmatched rows to begin with), it survives. The harness reports surviving mutants
as coverage gaps for that question and dataset, rather than counting them as a
pass. That is the honest version of "our benchmark detects errors": we show which
ones it provably detects, and which it does not.
