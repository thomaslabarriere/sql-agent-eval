import { Db } from "./db.js";
import { createDataset } from "./schema/generate.js";
import { BENCH, offlineDirectives } from "./scenarios/gold.js";
import { ScriptedAgent } from "./agent/scripted.js";
import { LlmSqlAgent, type Probe } from "./agent/llmAgent.js";
import { buildReport, renderReport } from "./scorecard.js";
import { compareStrategies, renderComparison } from "./strategies.js";

async function reportOffline(): Promise<void> {
  const db = await Db.open();
  await createDataset(db);
  const r = await buildReport(db, BENCH, new ScriptedAgent(offlineDirectives()));
  process.stdout.write(renderReport(r) + "\n");
}

async function reportLive(apiKey: string, model: string): Promise<void> {
  const db = await Db.open();
  await createDataset(db);

  const probe: Probe = async (sql) => {
    try {
      await db.query(sql);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const agents = [
    new LlmSqlAgent({ apiKey, model, strategy: "baseline" }),
    new LlmSqlAgent({ apiKey, model, strategy: "schema" }),
    new LlmSqlAgent({ apiKey, model, strategy: "agentic", probe }),
  ];

  const rows = await compareStrategies(db, BENCH, agents);
  process.stdout.write(renderComparison(rows) + "\n\n");

  // Full detail for the schema-aware strategy plus the mutation kill rate.
  const detail = await buildReport(db, BENCH, new LlmSqlAgent({ apiKey, model, strategy: "schema" }));
  process.stdout.write(renderReport(detail) + "\n");
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "report";

  if (cmd === "report") {
    await reportOffline();
    return;
  }

  if (cmd === "live") {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      process.stderr.write("live: set OPENAI_API_KEY to run the LLM strategies.\n");
      process.exit(1);
    }
    await reportLive(apiKey, process.env["MODEL"] ?? "gpt-4o-mini");
    return;
  }

  process.stderr.write(`unknown command: ${cmd}. Use "report" or "live".\n`);
  process.exit(1);
}

void main();
