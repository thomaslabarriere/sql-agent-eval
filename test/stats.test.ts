import { describe, it, expect } from "vitest";
import { mcnemarExact, percentile, wilson } from "../src/spider/stats.js";

describe("wilson", () => {
  it("matches a textbook value (Wilson 95%, 81/263)", () => {
    // Reference: Newcombe (1998), example 81/263 -> 0.2553 to 0.3662.
    const ci = wilson(81, 263);
    expect(ci.low).toBeCloseTo(0.2553, 3);
    expect(ci.high).toBeCloseTo(0.3662, 3);
  });
  it("stays inside [0, 1] at the edges", () => {
    expect(wilson(0, 10).low).toBe(0);
    expect(wilson(10, 10).high).toBe(1);
    expect(wilson(10, 10).low).toBeLessThan(1);
  });
});

describe("mcnemarExact", () => {
  it("is 1 with no discordant pairs, and symmetric in b and c", () => {
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(3, 12)).toBeCloseTo(mcnemarExact(12, 3), 12);
  });
  it("matches the exact binomial value", () => {
    // b=1, c=9: 2 * (C(10,0) + C(10,1)) / 2^10 = 22 / 1024.
    expect(mcnemarExact(1, 9)).toBeCloseTo(22 / 1024, 12);
    // b=5, c=5: fully balanced, capped at 1.
    expect(mcnemarExact(5, 5)).toBe(1);
  });
  it("stays finite for large counts", () => {
    const p = mcnemarExact(100, 160);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const v = [5, 1, 4, 2, 3];
    expect(percentile(v, 50)).toBe(3);
    expect(percentile(v, 95)).toBe(5);
    expect(percentile(v, 0)).toBe(1);
  });
});
