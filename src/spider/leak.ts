import type { SpiderItem } from "./data.js";

/**
 * Train/eval separation check (DECISIONS.md D5, D12). Spider splits by database,
 * so no database may appear on both sides. On top of that, a question or SQL that
 * is textually identical (case and whitespace normalized) on both sides counts as
 * a leak even across different databases, and the training copy is dropped.
 */

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface LeakReport {
  sharedDbs: string[];
  /** Eval items whose question or SQL also appears in train. */
  evalItemsTouched: number;
  /** Train items whose question or SQL also appears in an eval set. */
  trainIdsToDrop: string[];
}

export function findLeaks(train: readonly SpiderItem[], evals: readonly SpiderItem[]): LeakReport {
  const trainDbs = new Set(train.map((t) => t.dbId));
  const sharedDbs = [...new Set(evals.map((e) => e.dbId))].filter((d) => trainDbs.has(d)).sort();

  const evalQ = new Set(evals.map((e) => normalizeText(e.question)));
  const evalS = new Set(evals.map((e) => normalizeText(e.goldSql)));
  const trainQ = new Set(train.map((t) => normalizeText(t.question)));
  const trainS = new Set(train.map((t) => normalizeText(t.goldSql)));

  const trainIdsToDrop = train
    .filter((t) => evalQ.has(normalizeText(t.question)) || evalS.has(normalizeText(t.goldSql)))
    .map((t) => t.id);
  const evalItemsTouched = evals.filter((e) => trainQ.has(normalizeText(e.question)) || trainS.has(normalizeText(e.goldSql))).length;

  return { sharedDbs, evalItemsTouched, trainIdsToDrop };
}

/** The training set actually used: train minus every textual duplicate of dev or test. */
export function cleanTrain(train: readonly SpiderItem[], evals: readonly SpiderItem[]): SpiderItem[] {
  const drop = new Set(findLeaks(train, evals).trainIdsToDrop);
  return train.filter((t) => !drop.has(t.id));
}
