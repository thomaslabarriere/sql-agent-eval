import { describe, it, expect } from "vitest";
import { MUTATIONS, mutationByName } from "../src/mutate.js";

describe("mutations", () => {
  it("rewrites COUNT(DISTINCT x) to COUNT(x)", () => {
    const m = mutationByName("count_distinct_to_count")!;
    expect(m.apply("SELECT COUNT(DISTINCT user_id) FROM t")).toBe("SELECT COUNT(user_id) FROM t");
  });

  it("rewrites LEFT JOIN to INNER JOIN", () => {
    const m = mutationByName("left_join_to_inner")!;
    expect(m.apply("SELECT * FROM a LEFT JOIN b ON a.x=b.x")).toContain("INNER JOIN");
  });

  it("returns null when a mutation does not apply", () => {
    const m = mutationByName("count_distinct_to_count")!;
    expect(m.apply("SELECT COUNT(*) FROM t")).toBeNull();
  });

  it("breaks syntax by corrupting SELECT", () => {
    const m = mutationByName("break_syntax")!;
    expect(m.apply("SELECT 1")).toBe("SELCT 1");
  });

  it("hallucinates a column by renaming user_id", () => {
    const m = mutationByName("hallucinate_column")!;
    expect(m.apply("SELECT user_id FROM t")).toBe("SELECT usr_id FROM t");
  });

  it("exposes a stable set of named mutations", () => {
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(MUTATIONS.map((m) => m.name)).size).toBe(MUTATIONS.length);
  });
});
