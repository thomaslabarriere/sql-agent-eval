import type { Db } from "./db.js";
import type { Verdict } from "./types.js";
import type { BenchItem } from "./scenarios/gold.js";
import type { SqlAgent } from "./agent/agent.js";
import { verify } from "./verify.js";
import { schemaDescription } from "./schema/generate.js";

/** Run an agent over the benchmark and verify each answer. */
export async function evaluate(db: Db, bench: readonly BenchItem[], agent: SqlAgent): Promise<Verdict[]> {
  const schema = schemaDescription();
  const verdicts: Verdict[] = [];
  for (const { question } of bench) {
    const attempt = await agent.answer(question, schema);
    verdicts.push(await verify(db, question, attempt));
  }
  return verdicts;
}
