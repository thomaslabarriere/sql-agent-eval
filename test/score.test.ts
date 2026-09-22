import { describe, it, expect } from "vitest";
import { score } from "../src/metrics/score.js";
import type { Verdict } from "../src/types.js";
import type { BenchItem } from "../src/scenarios/gold.js";

function bench(id: string, level: 1 | 2 | 3 | 4 | 5): BenchItem {
  return { question: { id, nl: "n", level, ordered: false, goldSql: "SELECT 1" }, offline: "oracle", expected: "correct" };
}
function v(id: string, matched: boolean, confidence: number): Verdict {
  return { questionId: id, category: matched ? "correct" : "wrong_result", matched, confidence, rationale: "" };
}

describe("score", () => {
  const items = [bench("a", 1), bench("b", 1), bench("c", 5), bench("d", 5)];

  it("computes accuracy and the confidence x correctness quadrant", () => {
    const verdicts = [v("a", true, 0.9), v("b", false, 0.9), v("c", true, 0.4), v("d", false, 0.4)];
    const s = score(items, verdicts);
    expect(s.accuracy).toBeCloseTo(0.5);
    expect(s.quadrant.highConfCorrect).toBe(1);
    expect(s.quadrant.highConfWrong).toBe(1);
    expect(s.quadrant.lowConfCorrect).toBe(1);
    expect(s.quadrant.lowConfWrong).toBe(1);
  });

  it("reports the share of errors held at high confidence", () => {
    const verdicts = [v("a", false, 0.9), v("b", false, 0.4), v("c", true, 0.9), v("d", true, 0.9)];
    const s = score(items, verdicts);
    // 2 wrong, 1 of them high-confidence.
    expect(s.errorsHighConfidenceShare).toBeCloseTo(0.5);
  });

  it("breaks accuracy down by level", () => {
    const verdicts = [v("a", true, 0.9), v("b", true, 0.9), v("c", false, 0.9), v("d", false, 0.9)];
    const s = score(items, verdicts);
    const l1 = s.byLevel.find((l) => l.level === 1);
    const l5 = s.byLevel.find((l) => l.level === 5);
    expect(l1?.accuracy).toBe(1);
    expect(l5?.accuracy).toBe(0);
  });
});
