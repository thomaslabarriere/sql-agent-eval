import { describe, it, expect, beforeAll } from "vitest";
import { Db } from "../src/db.js";
import { runMutations, survivors } from "../src/metrics/mutation.js";
import type { BenchItem } from "../src/scenarios/gold.js";

let db: Db;

beforeAll(async () => {
  db = await Db.open();
  // Every row of a has a match in b, so a LEFT JOIN and an INNER JOIN return the
  // same rows: the left_join_to_inner mutation cannot change the result here.
  await db.run("CREATE TABLE a(id INTEGER)");
  await db.run("CREATE TABLE b(id INTEGER)");
  await db.run("INSERT INTO a VALUES (1),(2),(3)");
  await db.run("INSERT INTO b VALUES (1),(2),(3)");
});

describe("mutation survivor reporting", () => {
  it("reports a mutation that does not change the result as a survivor, not a pass", async () => {
    const bench: BenchItem[] = [
      {
        question: { id: "join_all_match", nl: "ids of a joined to b", level: 3, ordered: false, goldSql: "SELECT a.id FROM a LEFT JOIN b ON a.id = b.id" },
        offline: "oracle",
        expected: "correct",
      },
    ];
    const results = await runMutations(db, bench);
    const surv = survivors(results);
    // The left-join mutation should survive on this dataset and be surfaced.
    expect(surv.some((s) => s.mutation === "left_join_to_inner")).toBe(true);
  });
});
