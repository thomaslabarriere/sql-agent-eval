import type { Category, Level, Verdict } from "../types.js";
import { CATEGORIES } from "../types.js";
import type { BenchItem } from "../scenarios/gold.js";

export interface LevelScore {
  level: Level;
  n: number;
  correct: number;
  accuracy: number;
}

export interface Quadrant {
  highConfCorrect: number;
  highConfWrong: number;
  lowConfCorrect: number;
  lowConfWrong: number;
}

export interface Scorecard {
  agent: string;
  n: number;
  correct: number;
  accuracy: number;
  byCategory: Record<Category, number>;
  byLevel: LevelScore[];
  confidenceThreshold: number;
  quadrant: Quadrant;
  /** Of all wrong answers, the share held at high confidence. The key number. */
  errorsHighConfidenceShare: number;
  meanConfidenceCorrect: number;
  meanConfidenceWrong: number;
}

function emptyByCategory(): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = 0;
  return out;
}

export function score(
  bench: readonly BenchItem[],
  verdicts: readonly Verdict[],
  opts: { confidenceThreshold?: number } = {},
): Scorecard {
  const threshold = opts.confidenceThreshold ?? 0.75;
  const levelOf = new Map(bench.map((b) => [b.question.id, b.question.level]));
  const byCategory = emptyByCategory();
  const levelAgg = new Map<Level, { n: number; correct: number }>();

  let correct = 0;
  const quadrant: Quadrant = { highConfCorrect: 0, highConfWrong: 0, lowConfCorrect: 0, lowConfWrong: 0 };
  let sumConfCorrect = 0;
  let sumConfWrong = 0;
  let nCorrect = 0;
  let nWrong = 0;

  for (const v of verdicts) {
    byCategory[v.category] += 1;
    const isCorrect = v.matched;
    const high = v.confidence >= threshold;
    if (isCorrect) {
      correct += 1;
      nCorrect += 1;
      sumConfCorrect += v.confidence;
      if (high) quadrant.highConfCorrect += 1;
      else quadrant.lowConfCorrect += 1;
    } else {
      nWrong += 1;
      sumConfWrong += v.confidence;
      if (high) quadrant.highConfWrong += 1;
      else quadrant.lowConfWrong += 1;
    }

    const level = levelOf.get(v.questionId);
    if (level !== undefined) {
      const agg = levelAgg.get(level) ?? { n: 0, correct: 0 };
      agg.n += 1;
      if (isCorrect) agg.correct += 1;
      levelAgg.set(level, agg);
    }
  }

  const byLevel: LevelScore[] = [...levelAgg.entries()]
    .map(([level, agg]) => ({ level, n: agg.n, correct: agg.correct, accuracy: agg.n === 0 ? 0 : agg.correct / agg.n }))
    .sort((a, b) => a.level - b.level);

  const n = verdicts.length;
  return {
    agent: "",
    n,
    correct,
    accuracy: n === 0 ? 0 : correct / n,
    byCategory,
    byLevel,
    confidenceThreshold: threshold,
    quadrant,
    errorsHighConfidenceShare: nWrong === 0 ? 0 : quadrant.highConfWrong / nWrong,
    meanConfidenceCorrect: nCorrect === 0 ? 0 : sumConfCorrect / nCorrect,
    meanConfidenceWrong: nWrong === 0 ? 0 : sumConfWrong / nWrong,
  };
}
