import type { SqlExecutor } from "./exec.js";
import { SqlRunError } from "./db.js";
import type { CanonicalValue, DiffKind, Question, ResultSet, SqlAttempt, Verdict } from "./types.js";

/**
 * The deterministic verifier: the heart of the harness. It never asks a model
 * whether the agent's SQL is right. It executes the agent's SQL and the gold
 * SQL on the same data, normalizes both result sets, and compares them. The
 * comparison is a real component, not an equality check, because "same result"
 * is subtle: BigInt counts, float rounding, empty vs wrong, column aliases that
 * differ, and row order that is semantic only when the question asks for a
 * ranking.
 *
 * Documented comparison rules:
 *  - Column COUNT must match. Column NAMES/aliases are ignored (a correct answer
 *    with a different alias still matches); column POSITION is treated as
 *    semantic (the projection order the question asked for).
 *  - Rows are compared as an UNORDERED multiset, except when the question is
 *    `ordered` (a ranking / top-k), where row order must match too.
 *  - Numbers compare within a relative tolerance (floats); everything else is
 *    exact after normalization.
 */

const FLOAT_TOLERANCE = 1e-6;

function withinSafeInt(v: bigint): boolean {
  return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER);
}

/** Collapse a raw DuckDB value to a canonical scalar so both sides compare fairly. */
export function canon(v: unknown): CanonicalValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return withinSafeInt(v) ? Number(v) : v.toString();
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  return String(v); // dates, timestamps, decimals returned as objects
}

export function normalize(raw: { columns: string[]; rows: unknown[][] }): ResultSet {
  return { columns: raw.columns, rows: raw.rows.map((r) => r.map(canon)) };
}

function valuesEqual(a: CanonicalValue, b: CanonicalValue): boolean {
  if (typeof a === "number" && typeof b === "number") {
    // NaN is never equal to itself under ===, so decide it explicitly rather
    // than letting a NaN silently read as a value difference.
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
    if (a === b) return true;
    return Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a === b;
}

function rowsEqual(a: readonly CanonicalValue[], b: readonly CanonicalValue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!valuesEqual(a[i] as CanonicalValue, b[i] as CanonicalValue)) return false;
  }
  return true;
}

export interface Comparison {
  equal: boolean;
  diffKind?: DiffKind;
}

export function compareResultSets(gold: ResultSet, agent: ResultSet, ordered: boolean): Comparison {
  if (gold.columns.length !== agent.columns.length) {
    return { equal: false, diffKind: "column_count" };
  }
  if (gold.rows.length !== agent.rows.length) {
    const oneEmpty = gold.rows.length === 0 || agent.rows.length === 0;
    return { equal: false, diffKind: oneEmpty ? "empty_vs_nonempty" : "row_count" };
  }

  if (ordered) {
    const sequential = gold.rows.every((r, i) => rowsEqual(r, agent.rows[i] as CanonicalValue[]));
    if (sequential) return { equal: true };
    // Same rows, wrong order, versus genuinely different values.
    const sameMultiset = multisetEqual(gold, agent);
    return { equal: false, diffKind: sameMultiset ? "order" : "values" };
  }

  return multisetEqual(gold, agent) ? { equal: true } : { equal: false, diffKind: "values" };
}

/**
 * Multiset equality by greedy matching under the same relative float tolerance
 * as valuesEqual. Each gold row is matched to an as-yet-unused agent row that
 * equals it. This avoids tying correctness to a rounded sort key (whose grid
 * could disagree with the comparison tolerance), at O(n^2) for the small result
 * sets a benchmark produces.
 */
function multisetEqual(gold: ResultSet, agent: ResultSet): boolean {
  const used = new Array<boolean>(agent.rows.length).fill(false);
  for (const gRow of gold.rows) {
    let matched = -1;
    for (let j = 0; j < agent.rows.length; j += 1) {
      if (!used[j] && rowsEqual(gRow, agent.rows[j] as CanonicalValue[])) {
        matched = j;
        break;
      }
    }
    if (matched === -1) return false;
    used[matched] = true;
  }
  return true;
}

/**
 * Classify one agent attempt against a question. The verdict is fully
 * determined by execution and comparison; no LLM is involved.
 */
export async function verify(db: SqlExecutor, question: Question, attempt: SqlAttempt): Promise<Verdict> {
  const base = { questionId: question.id, confidence: attempt.confidence };

  if (attempt.abstained || attempt.sql === null) {
    if (question.ambiguous) {
      return { ...base, category: "correct", matched: true, rationale: "correctly declined an underspecified question" };
    }
    return { ...base, category: "wrong_result", matched: false, rationale: "declined a question that had a well-defined answer" };
  }

  if (question.ambiguous) {
    return { ...base, category: "ambiguous_question", matched: false, rationale: "answered a question that was underspecified and should have been flagged" };
  }

  let agentResult: ResultSet;
  try {
    agentResult = normalize(await db.query(attempt.sql));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (err instanceof SqlRunError && err.kind === "schema") {
      return { ...base, category: "schema_hallucination", matched: false, rationale: "referenced a table or column that does not exist", error };
    }
    return { ...base, category: "sql_error", matched: false, rationale: "the SQL failed to execute", error };
  }

  const gold = normalize(await db.query(question.goldSql));
  const cmp = compareResultSets(gold, agentResult, question.ordered);
  if (cmp.equal) {
    return { ...base, category: "correct", matched: true, rationale: "result matches the gold result" };
  }
  const v: Verdict = { ...base, category: "wrong_result", matched: false, rationale: `result differs from gold (${cmp.diffKind})` };
  if (cmp.diffKind !== undefined) v.diffKind = cmp.diffKind;
  return v;
}
