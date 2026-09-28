import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadSplit, type Split } from "./data.js";
import { goldCheck, type GoldCheck } from "./goldCheck.js";
import { prepare, validIds } from "./prepare.js";
import { comparePaired, readResults, renderPaired, renderSummary, summarize } from "./report.js";
import { runSpider } from "./run.js";

/**
 * Spider commands:
 *   gold-check --split test                     execute every gold query, write results/spider/gold-check.<split>.json
 *   prepare                                     write finetune/data/{train,valid}.jsonl
 *   run --split test --label base [--model M] [--base-url U] [--limit N] [--exclude-valid] [--only-valid]
 *   report --split test --before base --after lora   print the before/after markdown
 */

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    split: { type: "string", default: "test" },
    label: { type: "string" },
    model: { type: "string", default: "Qwen/Qwen2.5-Coder-1.5B-Instruct" },
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    limit: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
    "exclude-valid": { type: "boolean", default: false },
    "only-valid": { type: "boolean", default: false },
  },
});

const split = values.split as Split;
const resultPath = (label: string) => `results/spider/${label}.${split}.jsonl`;
const goldPath = `results/spider/gold-check.${split}.json`;

function readGold(): GoldCheck | undefined {
  try {
    return JSON.parse(readFileSync(goldPath, "utf8")) as GoldCheck;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const cmd = positionals[0];
  if (cmd === "gold-check") {
    const g = await goldCheck(split);
    mkdirSync("results/spider", { recursive: true });
    writeFileSync(goldPath, JSON.stringify(g, null, 2) + "\n");
    process.stdout.write(`${split}: ${g.n} gold queries, ${g.errors.length} errors, ${g.emptyIds.length} empty results, ${g.ordered} ordered -> ${goldPath}\n`);
    return;
  }
  if (cmd === "prepare") {
    const r = prepare("finetune/data");
    process.stdout.write(`train ${r.train} (dropped ${r.dropped} textual duplicates of dev/test), valid ${r.valid} -> finetune/data\n`);
    return;
  }
  if (cmd === "run") {
    if (!values.label) throw new Error("run needs --label");
    if (values["exclude-valid"] && values["only-valid"]) throw new Error("choose one of --exclude-valid / --only-valid");
    let ids: Set<string> | undefined;
    if (split === "dev" && (values["exclude-valid"] || values["only-valid"])) {
      const v = validIds();
      if (values["only-valid"]) ids = v;
      else ids = new Set(loadSplit("dev").map((d) => d.id).filter((id) => !v.has(id)));
    }
    await runSpider({
      split,
      out: resultPath(values.label),
      model: values.model as string,
      baseUrl: values["base-url"] as string,
      ...(values.limit !== undefined ? { limit: Number(values.limit) } : {}),
      ...(ids !== undefined ? { ids } : {}),
    });
    return;
  }
  if (cmd === "report") {
    const gold = readGold();
    const empty = gold ? new Set(gold.emptyIds) : undefined;
    const out: string[] = [];
    for (const label of [values.before, values.after]) {
      if (!label) continue;
      out.push(renderSummary(`${label} (${split})`, summarize(readResults(resultPath(label)), empty)), "");
    }
    if (values.before && values.after) {
      out.push(renderPaired(comparePaired(readResults(resultPath(values.before)), readResults(resultPath(values.after)))));
    }
    process.stdout.write(out.join("\n") + "\n");
    return;
  }
  process.stderr.write(`unknown command: ${cmd ?? "(none)"}. Use gold-check, prepare, run or report.\n`);
  process.exit(1);
}

void main();
