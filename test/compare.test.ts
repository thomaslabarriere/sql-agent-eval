import { describe, it, expect } from "vitest";
import { canon, compareResultSets } from "../src/verify.js";
import type { ResultSet } from "../src/types.js";

function rs(columns: string[], rows: (string | number | boolean | null)[][]): ResultSet {
  return { columns, rows };
}

describe("canon", () => {
  it("collapses bigint, number, string, null, and objects", () => {
    expect(canon(5n)).toBe(5);
    expect(canon(3.14)).toBe(3.14);
    expect(canon("x")).toBe("x");
    expect(canon(null)).toBe(null);
    expect(canon(undefined)).toBe(null);
    expect(typeof canon(new Date(0))).toBe("string");
  });

  it("keeps a huge bigint as a string rather than a lossy number", () => {
    const big = 9007199254740993n; // beyond MAX_SAFE_INTEGER
    expect(typeof canon(big)).toBe("string");
  });
});

describe("compareResultSets", () => {
  it("matches identical result sets regardless of column alias (position-based)", () => {
    const gold = rs(["country", "n"], [["FR", 2], ["US", 1]]);
    const agent = rs(["country", "cnt"], [["US", 1], ["FR", 2]]);
    expect(compareResultSets(gold, agent, false).equal).toBe(true);
  });

  it("flags a different column count", () => {
    const c = compareResultSets(rs(["a"], [[1]]), rs(["a", "b"], [[1, 2]]), false);
    expect(c.equal).toBe(false);
    expect(c.diffKind).toBe("column_count");
  });

  it("flags empty vs non-empty distinctly", () => {
    const c = compareResultSets(rs(["a"], [[1]]), rs(["a"], []), false);
    expect(c.diffKind).toBe("empty_vs_nonempty");
  });

  it("flags a row-count difference", () => {
    const c = compareResultSets(rs(["a"], [[1], [2]]), rs(["a"], [[1], [2], [3]]), false);
    expect(c.diffKind).toBe("row_count");
  });

  it("flags a value difference", () => {
    const c = compareResultSets(rs(["a"], [[1]]), rs(["a"], [[2]]), false);
    expect(c.diffKind).toBe("values");
  });

  it("treats row order as noise when the question is unordered", () => {
    const gold = rs(["a"], [[1], [2], [3]]);
    const agent = rs(["a"], [[3], [1], [2]]);
    expect(compareResultSets(gold, agent, false).equal).toBe(true);
  });

  it("treats row order as semantic when the question is ordered, and names it", () => {
    const gold = rs(["a"], [[1], [2], [3]]);
    const agent = rs(["a"], [[3], [1], [2]]);
    const c = compareResultSets(gold, agent, true);
    expect(c.equal).toBe(false);
    expect(c.diffKind).toBe("order");
  });

  it("accepts floats within tolerance", () => {
    const c = compareResultSets(rs(["a"], [[1.0000001]]), rs(["a"], [[1.0]]), false);
    expect(c.equal).toBe(true);
  });

  it("treats column POSITION as semantic: swapped-position values are wrong", () => {
    // Same names, but the values are in swapped column positions.
    const gold = rs(["x", "y"], [[1, 2]]);
    const agent = rs(["y", "x"], [[2, 1]]);
    const c = compareResultSets(gold, agent, false);
    expect(c.equal).toBe(false);
    expect(c.diffKind).toBe("values");
  });

  it("treats two empty result sets as equal", () => {
    expect(compareResultSets(rs(["a"], []), rs(["a"], []), false).equal).toBe(true);
  });

  it("matches an unordered multiset of large floats within tolerance despite interleaving", () => {
    // Relative tolerance 1e-6 gives ~1.0 absolute slack at 1e6. Rows are shuffled
    // and each is within tolerance of its partner; greedy matching must pair them.
    const gold = rs(["v"], [[1_000_000], [2_000_000]]);
    const agent = rs(["v"], [[2_000_000.5], [1_000_000.3]]);
    expect(compareResultSets(gold, agent, false).equal).toBe(true);
  });
});
