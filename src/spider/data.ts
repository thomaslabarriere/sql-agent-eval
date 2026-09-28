import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Question } from "../types.js";

/**
 * Spider 1.0 loader (Yu et al., 2018, CC BY-SA 4.0). The data is not in git: see
 * scripts/fetch-spider.sh. Train and dev databases live in `database/`, test
 * databases in `test_database/` (which also contains the train and dev ones).
 */

export const SPIDER_ROOT = process.env["SPIDER_ROOT"] ?? "data/spider_data";

export type Split = "train" | "dev" | "test";

export interface SpiderItem {
  /** Stable id: `${split}_${index in the official file}`. */
  id: string;
  split: Split;
  dbId: string;
  question: string;
  goldSql: string;
}

interface RawItem {
  db_id: string;
  question: string;
  query: string;
}

function readJson(root: string, file: string): RawItem[] {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as RawItem[];
}

/** The official training set is train_spider.json + train_others.json. */
export function loadSplit(split: Split, root: string = SPIDER_ROOT): SpiderItem[] {
  const raw =
    split === "train"
      ? [...readJson(root, "train_spider.json"), ...readJson(root, "train_others.json")]
      : readJson(root, split === "dev" ? "dev.json" : "test.json");
  return raw.map((r, i) => ({ id: `${split}_${i}`, split, dbId: r.db_id, question: r.question, goldSql: r.query }));
}

export function dbPath(item: Pick<SpiderItem, "split" | "dbId">, root: string = SPIDER_ROOT): string {
  const dir = item.split === "test" ? "test_database" : "database";
  return join(root, dir, item.dbId, `${item.dbId}.sqlite`);
}

/**
 * Row order is semantic when the gold query sorts, the same rule as the official
 * Spider execution evaluator.
 */
export function isOrdered(goldSql: string): boolean {
  return /\border\s+by\b/i.test(goldSql);
}

/**
 * A Spider item as a harness Question. Spider has no difficulty levels in the
 * sense of the synthetic benchmark (its hardness buckets come from the official
 * evaluator), and no item is labeled ambiguous (DECISIONS.md D7), so level is a
 * fixed placeholder that the Spider report never prints.
 */
export function toQuestion(item: SpiderItem): Question {
  return { id: item.id, nl: item.question, level: 1, ordered: isOrdered(item.goldSql), goldSql: item.goldSql };
}
