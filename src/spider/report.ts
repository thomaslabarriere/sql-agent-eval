import { readFileSync } from "node:fs";
import { CATEGORIES, type Category } from "../types.js";
import type { ItemResult } from "./run.js";
import { mcnemarExact, percentile, wilson } from "./stats.js";

/**
 * Turns per-question result files into numbers. Nothing is rounded in anyone's
 * favor: percentages carry one decimal, counts are always shown next to them, and
 * items that could not be scored (gold failure) are counted apart, never dropped
 * silently.
 */

export function readResults(path: string): ItemResult[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ItemResult);
}

export interface RunSummary {
  n: number;
  scored: number;
  goldErrors: number;
  correct: number;
  accuracy: number;
  ci: { low: number; high: number };
  byCategory: Record<Category, number>;
  extractionFailures: number;
  truncated: number;
  timeouts: number;
  /** Accuracy on items whose gold result is non-empty (D13); null without gold-check data. */
  nonEmpty: { n: number; correct: number; accuracy: number } | null;
  latency: { meanMs: number; p50Ms: number; p95Ms: number; totalS: number };
  tokens: { prompt: number | null; completion: number | null; completionPerS: number | null };
  tokenProb: { meanCorrect: number | null; meanWrong: number | null; wrongAbove075: number | null; nWithProb: number };
}

function mean(xs: readonly number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sumOrNull(xs: readonly (number | null)[]): number | null {
  if (xs.some((x) => x === null)) return null;
  return (xs as number[]).reduce((a, b) => a + b, 0);
}

export function summarize(results: readonly ItemResult[], emptyGoldIds?: ReadonlySet<string>): RunSummary {
  const scored = results.filter((r) => r.goldError === undefined);
  const byCategory = {} as Record<Category, number>;
  for (const c of CATEGORIES) byCategory[c] = 0;
  for (const r of scored) byCategory[r.category] += 1;
  const correct = byCategory.correct;

  let nonEmpty: RunSummary["nonEmpty"] = null;
  if (emptyGoldIds !== undefined) {
    const ne = scored.filter((r) => !emptyGoldIds.has(r.id));
    const k = ne.filter((r) => r.category === "correct").length;
    nonEmpty = { n: ne.length, correct: k, accuracy: ne.length === 0 ? 0 : k / ne.length };
  }

  const lat = results.map((r) => r.latencyMs);
  const totalMs = lat.reduce((a, b) => a + b, 0);
  const completion = sumOrNull(results.map((r) => r.completionTokens));

  const withProb = scored.filter((r) => r.tokenProb !== null);
  const probsCorrect = withProb.filter((r) => r.category === "correct").map((r) => r.tokenProb as number);
  const probsWrong = withProb.filter((r) => r.category !== "correct").map((r) => r.tokenProb as number);

  return {
    n: results.length,
    scored: scored.length,
    goldErrors: results.length - scored.length,
    correct,
    accuracy: scored.length === 0 ? 0 : correct / scored.length,
    ci: wilson(correct, scored.length),
    byCategory,
    extractionFailures: results.filter((r) => r.extractionFailed).length,
    truncated: results.filter((r) => r.finishReason === "length").length,
    timeouts: results.filter((r) => r.predError?.startsWith("timeout") === true).length,
    nonEmpty,
    latency: {
      meanMs: totalMs / Math.max(1, results.length),
      p50Ms: percentile(lat, 50),
      p95Ms: percentile(lat, 95),
      totalS: totalMs / 1000,
    },
    tokens: {
      prompt: sumOrNull(results.map((r) => r.promptTokens)),
      completion,
      completionPerS: completion === null || totalMs === 0 ? null : completion / (totalMs / 1000),
    },
    tokenProb: {
      meanCorrect: mean(probsCorrect),
      meanWrong: mean(probsWrong),
      wrongAbove075: probsWrong.length === 0 ? null : probsWrong.filter((p) => p >= 0.75).length / probsWrong.length,
      nWithProb: withProb.length,
    },
  };
}

export interface PairedComparison {
  n: number;
  bothCorrect: number;
  bothWrong: number;
  /** Right before, wrong after. */
  regressions: ItemResult[];
  /** Wrong before, right after (the after-side results). */
  fixes: ItemResult[];
  mcnemarP: number;
  /** Ids present on one side only: a paired comparison needs both. */
  unpaired: number;
}

/** Paired comparison on the items scored on both sides. */
export function comparePaired(before: readonly ItemResult[], after: readonly ItemResult[]): PairedComparison {
  const b = new Map(before.filter((r) => r.goldError === undefined).map((r) => [r.id, r]));
  const a = new Map(after.filter((r) => r.goldError === undefined).map((r) => [r.id, r]));
  const ids = [...b.keys()].filter((id) => a.has(id));
  let bothCorrect = 0;
  let bothWrong = 0;
  const regressions: ItemResult[] = [];
  const fixes: ItemResult[] = [];
  for (const id of ids) {
    const x = (b.get(id) as ItemResult).category === "correct";
    const y = (a.get(id) as ItemResult).category === "correct";
    if (x && y) bothCorrect += 1;
    else if (!x && !y) bothWrong += 1;
    else if (x && !y) regressions.push(a.get(id) as ItemResult);
    else fixes.push(a.get(id) as ItemResult);
  }
  const unpaired = new Set([...b.keys(), ...a.keys()]).size - ids.length;
  return { n: ids.length, bothCorrect, bothWrong, regressions, fixes, mcnemarP: mcnemarExact(regressions.length, fixes.length), unpaired };
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

function num(x: number | null, digits = 2): string {
  return x === null ? "non mesuré" : x.toFixed(digits);
}

export function renderSummary(label: string, s: RunSummary): string {
  const lines = [
    `### ${label}`,
    "",
    `| mesure | valeur |`,
    `|---|---|`,
    `| justesse d'exécution | ${pct(s.accuracy)} (${s.correct}/${s.scored}), IC 95 % Wilson [${pct(s.ci.low)} ; ${pct(s.ci.high)}] |`,
    `| justesse, gold non vide | ${s.nonEmpty === null ? "non mesuré" : `${pct(s.nonEmpty.accuracy)} (${s.nonEmpty.correct}/${s.nonEmpty.n})`} |`,
    `| items non notés (gold en erreur) | ${s.goldErrors} |`,
    ...CATEGORIES.filter((c) => c !== "correct").map((c) => `| ${c} | ${s.byCategory[c]} |`),
    `| dont SQL non extrait | ${s.extractionFailures} |`,
    `| dont timeout d'exécution | ${s.timeouts} |`,
    `| réponses tronquées (max_tokens) | ${s.truncated} |`,
    `| latence moyenne / p50 / p95 | ${s.latency.meanMs.toFixed(0)} / ${s.latency.p50Ms.toFixed(0)} / ${s.latency.p95Ms.toFixed(0)} ms |`,
    `| temps total de génération | ${s.latency.totalS.toFixed(0)} s |`,
    `| tokens prompt / complétion | ${s.tokens.prompt ?? "non mesuré"} / ${s.tokens.completion ?? "non mesuré"} |`,
    `| débit de complétion (tokens/s, latence incluse) | ${num(s.tokens.completionPerS, 1)} |`,
    `| probabilité moyenne par token, juste / faux | ${num(s.tokenProb.meanCorrect)} / ${num(s.tokenProb.meanWrong)} |`,
    `| part des erreurs à probabilité >= 0,75 | ${s.tokenProb.wrongAbove075 === null ? "non mesuré" : pct(s.tokenProb.wrongAbove075)} |`,
  ];
  return lines.join("\n");
}

export function renderPaired(c: PairedComparison, maxList = Infinity): string {
  const delta = (c.fixes.length - c.regressions.length) / Math.max(1, c.n);
  const lines = [
    `| comparaison appariée (${c.n} items notés des deux côtés) | valeur |`,
    `|---|---|`,
    `| juste avant et après | ${c.bothCorrect} |`,
    `| faux avant et après | ${c.bothWrong} |`,
    `| **régressions** (juste avant, faux après) | ${c.regressions.length} |`,
    `| corrections (faux avant, juste après) | ${c.fixes.length} |`,
    `| écart net | ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} points |`,
    `| McNemar exact, p bilatéral | ${c.mcnemarP < 0.0001 ? c.mcnemarP.toExponential(2) : c.mcnemarP.toFixed(4)} |`,
    `| items non appariés | ${c.unpaired} |`,
  ];
  if (c.regressions.length > 0) {
    lines.push("", `#### Régressions (${c.regressions.length})`, "", "| id | base | question | SQL après | catégorie après |", "|---|---|---|---|---|");
    for (const r of c.regressions.slice(0, maxList)) {
      const cell = (s: string | null) => (s ?? "(aucun)").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${r.id} | ${r.dbId} | ${cell(r.question)} | \`${cell(r.predSql)}\` | ${r.category}${r.diffKind ? ` (${r.diffKind})` : ""} |`);
    }
    if (c.regressions.length > maxList) lines.push(`| ... | | ${c.regressions.length - maxList} de plus dans le fichier de résultats | | |`);
  }
  return lines.join("\n");
}
