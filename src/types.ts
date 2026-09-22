/**
 * Core domain types for evaluating a text-to-SQL agent.
 *
 * The central idea: an agent's SQL is not correct because it runs. We execute
 * it, compare its result to the result of a gold query on the same data, and
 * classify the outcome. The verdict is a deterministic comparison, never an
 * LLM's opinion.
 */

export const CATEGORIES = [
  "correct",
  "wrong_result",
  "sql_error",
  "schema_hallucination",
  "ambiguous_question",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Difficulty tiers of the benchmark. Level 5 is the business-logic traps. */
export type Level = 1 | 2 | 3 | 4 | 5;

export interface Question {
  id: string;
  nl: string;
  level: Level;
  /** The reference SQL. The gold RESULT is derived by executing this. */
  goldSql: string;
  /**
   * True when the question imposes a ranking (top-k, "ordered by ..."), so row
   * order is semantic and must match. False when order carries no meaning.
   */
  ordered: boolean;
  /**
   * True when the question is underspecified and has no single correct SQL. The
   * correct agent behavior is to abstain and ask for clarification.
   */
  ambiguous?: boolean;
}

/** What the agent produced for one question. */
export interface SqlAttempt {
  questionId: string;
  /** The SQL the agent wrote, or null when it abstained. */
  sql: string | null;
  /** The agent's own confidence, 0..1. Tracked to find confident-but-wrong. */
  confidence: number;
  abstained: boolean;
}

/** A normalized result set: column names plus rows of canonical scalar values. */
export interface ResultSet {
  columns: string[];
  rows: CanonicalValue[][];
}

export type CanonicalValue = string | number | boolean | null;

export type DiffKind =
  | "row_count"
  | "column_count"
  | "values"
  | "order"
  | "empty_vs_nonempty";

export interface Verdict {
  questionId: string;
  category: Category;
  /** True only for the `correct` category. */
  matched: boolean;
  confidence: number;
  /** Present when category is wrong_result: what kind of difference was found. */
  diffKind?: DiffKind;
  rationale: string;
}

export interface LabeledQuestion {
  question: Question;
  /** The category the agent under test SHOULD reach on this question. */
  expected: Category;
}
