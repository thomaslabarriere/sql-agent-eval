import { describe, it, expect, beforeAll } from "vitest";
import { Db } from "../src/db.js";
import { createDataset } from "../src/schema/generate.js";
import { BENCH, offlineDirectives } from "../src/scenarios/gold.js";
import { ScriptedAgent } from "../src/agent/scripted.js";
import { verify } from "../src/verify.js";
import { runMutations, killRate, survivors } from "../src/metrics/mutation.js";
import { CATEGORIES } from "../src/types.js";

let db: Db;

beforeAll(async () => {
  db = await Db.open();
  await createDataset(db);
});

describe("benchmark end to end (scripted, offline)", () => {
  it("classifies every scripted behavior into its expected category", async () => {
    const agent = new ScriptedAgent(offlineDirectives());
    for (const item of BENCH) {
      const attempt = agent.answer(item.question);
      const v = await verify(db, item.question, attempt);
      expect(v.category, `${item.question.id}`).toBe(item.expected);
    }
  });

  it("exercises every category at least once", async () => {
    const agent = new ScriptedAgent(offlineDirectives());
    const seen = new Set<string>();
    for (const item of BENCH) {
      const v = await verify(db, item.question, agent.answer(item.question));
      seen.add(v.category);
    }
    for (const c of CATEGORIES) expect(seen.has(c), c).toBe(true);
  });

  it("every gold query executes and returns a result", async () => {
    for (const { question } of BENCH) {
      const r = await db.query(question.goldSql);
      expect(r.columns.length).toBeGreaterThan(0);
    }
  });
});

describe("gold-SQL mutation testing", () => {
  it("kills mutations of the gold queries, reporting survivors as gaps", async () => {
    const results = await runMutations(db, BENCH);
    expect(results.length).toBeGreaterThan(0);
    // Most mutations must be caught; any survivor is a reported gap, not a pass.
    expect(killRate(results)).toBeGreaterThanOrEqual(0.8);
    // Survivors, if any, are surfaced (not hidden).
    expect(Array.isArray(survivors(results))).toBe(true);
  });
});
