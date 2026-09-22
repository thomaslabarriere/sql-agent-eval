import type { Db } from "./db.js";
import { CATEGORIES } from "./types.js";
import type { BenchItem } from "./scenarios/gold.js";
import type { SqlAgent } from "./agent/agent.js";
import { evaluate } from "./evaluate.js";
import { score, type Scorecard } from "./metrics/score.js";
import { runMutations, killRate, survivors, killBreakdown, type MutantResult, type KillBreakdown } from "./metrics/mutation.js";

export interface FullReport {
  score: Scorecard;
  mutation: { killRate: number; survivors: MutantResult[]; total: number; breakdown: KillBreakdown };
}

export async function buildReport(db: Db, bench: readonly BenchItem[], agent: SqlAgent): Promise<FullReport> {
  const verdicts = await evaluate(db, bench, agent);
  const sc = score(bench, verdicts);
  sc.agent = agent.name;
  const mutants = await runMutations(db, bench);
  return {
    score: sc,
    mutation: { killRate: killRate(mutants), survivors: survivors(mutants), total: mutants.length, breakdown: killBreakdown(mutants) },
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function renderReport(r: FullReport): string {
  const s = r.score;
  const q = s.quadrant;
  const lines: string[] = [];
  lines.push(`Scorecard - agent: ${s.agent}`);
  lines.push(`  accuracy                     : ${pct(s.accuracy)}   (${s.correct}/${s.n})`);
  lines.push(`  errors held at high conf     : ${pct(s.errorsHighConfidenceShare)}   <-- of all wrong answers (conf >= ${pct(s.confidenceThreshold)})`);
  lines.push(`  mean confidence right/wrong  : ${s.meanConfidenceCorrect.toFixed(2)} / ${s.meanConfidenceWrong.toFixed(2)}`);
  const b = r.mutation.breakdown;
  lines.push(`  gold-SQL mutation kill rate  : ${pct(r.mutation.killRate)}   (${b.killed}/${b.total} killed: ${b.comparatorKills} by the result comparator, ${b.errorKills} by error classification)`);
  if (r.mutation.survivors.length > 0) {
    const list = r.mutation.survivors.map((m) => `${m.questionId}:${m.mutation}`).join(", ");
    lines.push(`  surviving mutants (gaps)     : ${list}`);
  }
  lines.push("");
  lines.push("  accuracy by level:");
  for (const l of s.byLevel) {
    lines.push(`    level ${l.level}  ${pct(l.accuracy).padStart(4)}   (${l.correct}/${l.n})`);
  }
  lines.push("");
  lines.push("  confidence x correctness:");
  lines.push(`                     correct   wrong`);
  lines.push(`    high confidence   ${String(q.highConfCorrect).padStart(5)}   ${String(q.highConfWrong).padStart(5)}   <-- high+wrong is the danger`);
  lines.push(`    low confidence    ${String(q.lowConfCorrect).padStart(5)}   ${String(q.lowConfWrong).padStart(5)}`);
  lines.push("");
  lines.push("  outcome by category:");
  for (const c of CATEGORIES) {
    if (s.byCategory[c] === 0) continue;
    lines.push(`    ${c.padEnd(22)} ${s.byCategory[c]}`);
  }
  return lines.join("\n");
}
