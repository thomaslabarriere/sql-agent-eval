import type { Db } from "./db.js";
import { CATEGORIES } from "./types.js";
import type { BenchItem } from "./scenarios/gold.js";
import type { SqlAgent } from "./agent/agent.js";
import { evaluate } from "./evaluate.js";
import { score, type Scorecard } from "./metrics/score.js";

export interface StrategyRow {
  name: string;
  score: Scorecard;
}

/**
 * Run several agent strategies over the same benchmark and score each. The point
 * is to measure which strategy wins, not to decide in advance: prototype,
 * experiment, keep or discard on evidence.
 */
export async function compareStrategies(db: Db, bench: readonly BenchItem[], agents: readonly SqlAgent[]): Promise<StrategyRow[]> {
  const rows: StrategyRow[] = [];
  for (const agent of agents) {
    const verdicts = await evaluate(db, bench, agent);
    const sc = score(bench, verdicts);
    sc.agent = agent.name;
    rows.push({ name: agent.name, score: sc });
  }
  return rows;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function renderComparison(rows: readonly StrategyRow[]): string {
  const lines: string[] = [];
  lines.push("Strategy comparison (same benchmark, same data):");
  const head = ["strategy", "acc", "correct", "wrong_res", "sql_err", "schema", "ambig", "err@hi"];
  lines.push("  " + head.map((h) => h.padEnd(10)).join(""));
  for (const r of rows) {
    const s = r.score;
    const cells = [
      r.name.replace(/^llm:[^:]+:/, ""),
      pct(s.accuracy),
      String(s.byCategory.correct),
      String(s.byCategory.wrong_result),
      String(s.byCategory.sql_error),
      String(s.byCategory.schema_hallucination),
      String(s.byCategory.ambiguous_question),
      pct(s.errorsHighConfidenceShare),
    ];
    lines.push("  " + cells.map((c) => c.padEnd(10)).join(""));
  }
  lines.push("");
  lines.push("  (correct includes correctly abstaining on ambiguous questions; err@hi = share of wrong answers held at high confidence)");
  // Sanity: categories should sum to n for each row.
  for (const r of rows) {
    const sum = CATEGORIES.reduce((acc, c) => acc + r.score.byCategory[c], 0);
    if (sum !== r.score.n) lines.push(`  warning: ${r.name} category counts (${sum}) do not sum to n (${r.score.n})`);
  }
  return lines.join("\n");
}
