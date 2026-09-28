import { readFileSync } from "node:fs";
import OpenAI from "openai";
import type { TrainingExample } from "./prepare.js";
import { extractSql } from "./prompt.js";

/**
 * Proves which model a server actually serves (DECISIONS.md D19). mlx_lm.server
 * 0.31.3 silently ignored --adapter-path, so a "fine-tuned" run can be the base
 * model without any error. A fine-tuned model reproduces many training targets
 * character for character (Spider's spacing and casing included); the base model
 * almost never does. The first N examples of train.jsonl are the fixed probe set.
 */

export const CHECK_N = 20;
export const CHECK_THRESHOLDS = { finetunedMin: 0.3, baseMax: 0.1 };

export function exactHits(replies: readonly string[], targets: readonly string[]): number {
  let hits = 0;
  replies.forEach((reply, i) => {
    if (extractSql(reply) === targets[i]) hits += 1;
  });
  return hits;
}

export async function checkServed(baseUrl: string, model: string, trainPath = "finetune/data/train.jsonl"): Promise<{ n: number; hits: number; rate: number }> {
  const examples = readFileSync(trainPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, CHECK_N)
    .map((l) => JSON.parse(l) as TrainingExample);
  const client = new OpenAI({ baseURL: baseUrl, apiKey: "local" });
  const replies: string[] = [];
  for (const ex of examples) {
    const res = await client.chat.completions.create({ model, temperature: 0, max_tokens: 512, messages: ex.messages.slice(0, 2) });
    replies.push(res.choices[0]?.message.content ?? "");
  }
  const targets = examples.map((e) => e.messages[2]?.content ?? "");
  const hits = exactHits(replies, targets);
  return { n: examples.length, hits, rate: hits / examples.length };
}
