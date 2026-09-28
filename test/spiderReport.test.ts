import { describe, it, expect } from "vitest";
import { apiCostUsd, comparePaired, summarize } from "../src/spider/report.js";
import type { ItemResult } from "../src/spider/run.js";
import type { Category } from "../src/types.js";

function r(id: string, category: Category, extra: Partial<ItemResult> = {}): ItemResult {
  return {
    id,
    dbId: "db",
    question: "q",
    goldSql: "SELECT 1",
    reply: "SELECT 1",
    predSql: "SELECT 1",
    extractionFailed: false,
    category,
    tokenProb: 0.9,
    latencyMs: 100,
    promptTokens: 10,
    completionTokens: 5,
    finishReason: "stop",
    ...extra,
  };
}

describe("summarize", () => {
  it("scores only items whose gold ran, and counts gold failures apart", () => {
    const s = summarize([r("a", "correct"), r("b", "wrong_result"), r("c", "correct", { goldError: "boom" })]);
    expect(s.n).toBe(3);
    expect(s.scored).toBe(2);
    expect(s.goldErrors).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.accuracy).toBe(0.5);
  });

  it("reports accuracy on the non-empty-gold subset", () => {
    const s = summarize([r("a", "correct"), r("b", "correct"), r("c", "wrong_result")], new Set(["a"]));
    expect(s.nonEmpty).toEqual({ n: 2, correct: 1, accuracy: 0.5 });
  });

  it("counts extraction failures, truncations and timeouts", () => {
    const s = summarize([
      r("a", "sql_error", { extractionFailed: true, predSql: null }),
      r("b", "sql_error", { predError: "timeout: query exceeded 30000 ms" }),
      r("c", "wrong_result", { finishReason: "length" }),
    ]);
    expect(s.extractionFailures).toBe(1);
    expect(s.timeouts).toBe(1);
    expect(s.truncated).toBe(1);
  });

  it("says a token count is unmeasured rather than summing a partial one", () => {
    const s = summarize([r("a", "correct"), r("b", "correct", { completionTokens: null })]);
    expect(s.tokens.completion).toBeNull();
  });
});

describe("comparePaired", () => {
  it("lists regressions and fixes on paired items", () => {
    const before = [r("a", "correct"), r("b", "wrong_result"), r("c", "correct"), r("d", "sql_error")];
    const after = [r("a", "wrong_result"), r("b", "correct"), r("c", "correct"), r("d", "sql_error")];
    const c = comparePaired(before, after);
    expect(c.n).toBe(4);
    expect(c.regressions.map((x) => x.id)).toEqual(["a"]);
    expect(c.fixes.map((x) => x.id)).toEqual(["b"]);
    expect(c.bothCorrect).toBe(1);
    expect(c.bothWrong).toBe(1);
  });

  it("does not pair items missing or unscored on one side", () => {
    const c = comparePaired([r("a", "correct"), r("b", "correct")], [r("a", "correct"), r("b", "wrong_result", { goldError: "x" }), r("z", "correct")]);
    expect(c.n).toBe(1);
    expect(c.unpaired).toBe(2);
    expect(c.regressions).toEqual([]);
  });
});

describe("apiCostUsd", () => {
  it("prices measured tokens, and refuses to price unmeasured ones", () => {
    const s = summarize([r("a", "correct", { promptTokens: 1_000_000, completionTokens: 500_000 })]);
    expect(apiCostUsd(s, 0.15, 0.6)).toBeCloseTo(0.45, 10);
    expect(apiCostUsd(summarize([r("a", "correct", { promptTokens: null })]), 0.15, 0.6)).toBeNull();
  });
});
