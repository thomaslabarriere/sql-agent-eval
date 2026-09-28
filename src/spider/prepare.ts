import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dbPath, loadSplit, type SpiderItem } from "./data.js";
import { cleanTrain, findLeaks } from "./leak.js";
import { buildMessages, serializeSchema, type ChatMessage } from "./prompt.js";

/**
 * Writes the mlx-lm training files with the SAME prompt builder the evaluation
 * uses (DECISIONS.md D8). train.jsonl is Spider train minus every textual
 * duplicate of dev or test (D12). valid.jsonl is a fixed slice of dev used only
 * for the validation loss during training; test is never read here except to
 * remove leaks from train.
 */

export interface TrainingExample {
  messages: ChatMessage[];
}

/** The training target: the gold SQL with only its trailing semicolon removed. */
export function targetSql(goldSql: string): string {
  return goldSql.trim().replace(/;\s*$/, "").trim();
}

export function toExample(item: SpiderItem, schema: string): TrainingExample {
  return { messages: [...buildMessages(schema, item.question), { role: "assistant", content: targetSql(item.goldSql) }] };
}

/** Deterministic shuffle (mulberry32) so the validation slice is reproducible. */
export function seededShuffle<T>(xs: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export const VALID_SIZE = 200;
export const VALID_SEED = 20260928;

/** Dev ids used for the training validation loss. */
export function validIds(): Set<string> {
  return new Set(seededShuffle(loadSplit("dev"), VALID_SEED).slice(0, VALID_SIZE).map((d) => d.id));
}

export function prepare(outDir: string): { train: number; valid: number; dropped: number } {
  const train = loadSplit("train");
  const dev = loadSplit("dev");
  const test = loadSplit("test");
  const evals = [...dev, ...test];
  const clean = cleanTrain(train, evals);
  const leaks = findLeaks(clean, evals);
  if (leaks.sharedDbs.length > 0 || leaks.trainIdsToDrop.length > 0) {
    throw new Error("leak check failed after cleaning; refusing to write training data");
  }
  const ids = validIds();
  const valid = dev.filter((d) => ids.has(d.id));

  const schemas = new Map<string, string>();
  const schemaOf = (item: SpiderItem): string => {
    const p = dbPath(item);
    let s = schemas.get(p);
    if (s === undefined) {
      s = serializeSchema(p);
      schemas.set(p, s);
    }
    return s;
  };

  mkdirSync(outDir, { recursive: true });
  const lines = (xs: SpiderItem[]) => xs.map((x) => JSON.stringify(toExample(x, schemaOf(x)))).join("\n") + "\n";
  // Shuffle train deterministically so batches mix databases.
  writeFileSync(join(outDir, "train.jsonl"), lines(seededShuffle(clean, VALID_SEED)));
  writeFileSync(join(outDir, "valid.jsonl"), lines(valid));
  return { train: clean.length, valid: valid.length, dropped: train.length - clean.length };
}
