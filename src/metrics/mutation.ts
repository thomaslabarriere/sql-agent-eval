import type { Db } from "../db.js";
import type { Category } from "../types.js";
import type { BenchItem } from "../scenarios/gold.js";
import { MUTATIONS } from "../mutate.js";
import { verify } from "../verify.js";

/**
 * Mutation testing of the benchmark itself. For each answerable question we take
 * the gold SQL, apply each mutation that fits (count vs count-distinct, wrong
 * join, flipped status, dropped filter, hallucinated column, broken syntax),
 * and feed the mutated SQL to the verifier as if the agent had written it. A
 * mutation is "killed" when the verdict is no longer `correct`. A mutation that
 * survives (still verdicts as correct) means the gold query and this dataset do
 * not actually depend on what the mutation changed, so it is reported as a
 * coverage gap, not a pass. This proves the verifier catches real SQL errors
 * instead of trusting that a query which runs is right.
 */

export interface MutantResult {
  questionId: string;
  mutation: string;
  killed: boolean;
  category: Category;
}

export async function runMutations(db: Db, bench: readonly BenchItem[]): Promise<MutantResult[]> {
  const results: MutantResult[] = [];
  for (const { question } of bench) {
    if (question.ambiguous) continue; // no single correct SQL to mutate
    for (const mutation of MUTATIONS) {
      const mutated = mutation.apply(question.goldSql);
      if (mutated === null) continue;
      const verdict = await verify(db, question, {
        questionId: question.id,
        sql: mutated,
        confidence: 1,
        abstained: false,
      });
      results.push({
        questionId: question.id,
        mutation: mutation.name,
        killed: verdict.category !== "correct",
        category: verdict.category,
      });
    }
  }
  return results;
}

export function killRate(results: readonly MutantResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.killed).length / results.length;
}

export function survivors(results: readonly MutantResult[]): MutantResult[] {
  return results.filter((r) => !r.killed);
}

/**
 * How the kills break down. Not all mutants test the same thing: break_syntax
 * and hallucinate_column are killed by error classification (they never run),
 * while drop_where, flipped status, count-vs-distinct and wrong-join are killed
 * by the RESULT comparator, which is the thesis. Reporting the split keeps the
 * headline kill rate from being read as all-comparator.
 */
export interface KillBreakdown {
  total: number;
  killed: number;
  comparatorKills: number;
  errorKills: number;
}

export function killBreakdown(results: readonly MutantResult[]): KillBreakdown {
  const killed = results.filter((r) => r.killed);
  return {
    total: results.length,
    killed: killed.length,
    comparatorKills: killed.filter((r) => r.category === "wrong_result").length,
    errorKills: killed.filter((r) => r.category === "sql_error" || r.category === "schema_hallucination").length,
  };
}
