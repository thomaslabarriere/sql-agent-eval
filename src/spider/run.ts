import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import OpenAI from "openai";
import type { Category, DiffKind } from "../types.js";
import { SqlRunError } from "../db.js";
import { verify } from "../verify.js";
import { dbPath, loadSplit, toQuestion, type SpiderItem, type Split } from "./data.js";
import { buildMessages, extractSql, serializeSchema } from "./prompt.js";
import { SqliteExecutor } from "./sqliteExec.js";

/**
 * Runs a model served behind an OpenAI-compatible endpoint (mlx_lm.server) over a
 * Spider split and writes one JSON line per question. The verdict comes from the
 * harness verifier: the predicted and gold SQL are executed on the same SQLite
 * database and compared. The file is append-only and resumable: an id already in
 * the file is skipped, so a long run can be interrupted and restarted.
 */

export interface ItemResult {
  id: string;
  dbId: string;
  question: string;
  goldSql: string;
  /** Raw model reply, kept so extraction can be audited. */
  reply: string;
  predSql: string | null;
  extractionFailed: boolean;
  category: Category;
  diffKind?: DiffKind;
  /** The gold SQL failed to run: the item cannot be scored and is reported apart. */
  goldError?: string;
  /** Error message when the predicted SQL failed. */
  predError?: string;
  /** exp(mean token logprob) of the reply; null when the server gave none. */
  tokenProb: number | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
}

export interface RunOptions {
  split: Split;
  out: string;
  model: string;
  baseUrl: string;
  limit?: number;
  maxTokens?: number;
  /** Only run these ids (e.g. a fixed dev subset). */
  ids?: ReadonlySet<string>;
}

function doneIds(out: string): Set<string> {
  if (!existsSync(out)) return new Set();
  const ids = new Set<string>();
  for (const line of readFileSync(out, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    ids.add((JSON.parse(line) as ItemResult).id);
  }
  return ids;
}

function tokenProb(logprobs: { logprob: number }[] | null | undefined): number | null {
  if (!logprobs || logprobs.length === 0) return null;
  const mean = logprobs.reduce((s, t) => s + t.logprob, 0) / logprobs.length;
  return Math.exp(mean);
}

export async function runSpider(opts: RunOptions): Promise<void> {
  mkdirSync(dirname(opts.out), { recursive: true });
  // A local server needs no key. A remote API key is read from the environment
  // (loaded from the gitignored .env), never from the command line.
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(opts.baseUrl);
  const apiKey = local ? "local" : process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error(`no OPENAI_API_KEY in the environment for ${opts.baseUrl}`);
  const client = new OpenAI({ baseURL: opts.baseUrl, apiKey });
  let items: SpiderItem[] = loadSplit(opts.split);
  if (opts.ids) items = items.filter((i) => opts.ids?.has(i.id));
  if (opts.limit !== undefined) items = items.slice(0, opts.limit);
  const done = doneIds(opts.out);
  const todo = items.filter((i) => !done.has(i.id));
  process.stderr.write(`${opts.split}: ${items.length} items, ${done.size} already done, ${todo.length} to run -> ${opts.out}\n`);

  const schemas = new Map<string, string>();
  const executors = new Map<string, SqliteExecutor>();
  try {
    let n = 0;
    for (const item of todo) {
      const path = dbPath(item);
      let schema = schemas.get(path);
      if (schema === undefined) {
        schema = serializeSchema(path);
        schemas.set(path, schema);
      }
      let exec = executors.get(path);
      if (exec === undefined) {
        exec = new SqliteExecutor(path);
        executors.set(path, exec);
      }

      const t0 = performance.now();
      const res = await client.chat.completions.create({
        model: opts.model,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 512,
        logprobs: true,
        top_logprobs: 1,
        messages: buildMessages(schema, item.question),
      });
      const latencyMs = performance.now() - t0;
      const choice = res.choices[0];
      const reply = choice?.message.content ?? "";
      const predSql = extractSql(reply);

      const result: ItemResult = {
        id: item.id,
        dbId: item.dbId,
        question: item.question,
        goldSql: item.goldSql,
        reply,
        predSql,
        extractionFailed: predSql === null,
        category: "sql_error",
        tokenProb: tokenProb(choice?.logprobs?.content),
        latencyMs: Math.round(latencyMs),
        promptTokens: res.usage?.prompt_tokens ?? null,
        completionTokens: res.usage?.completion_tokens ?? null,
        finishReason: choice?.finish_reason ?? null,
      };

      if (predSql === null) {
        // Nothing to execute. Counted as a failure to produce SQL, not as an
        // abstention (the model did not decline, it produced no usable query).
        result.predError = "no SQL extracted";
      } else {
        try {
          const verdict = await verify(exec, toQuestion(item), {
            questionId: item.id,
            sql: predSql,
            confidence: result.tokenProb ?? 0,
            abstained: false,
          });
          result.category = verdict.category;
          if (verdict.diffKind !== undefined) result.diffKind = verdict.diffKind;
          if (verdict.error !== undefined) result.predError = verdict.error;
        } catch (err) {
          // verify() runs the gold SQL only after the prediction ran; a throw
          // here is a gold failure, recorded apart rather than scored.
          result.goldError = err instanceof SqlRunError ? err.message : String(err);
        }
      }

      appendFileSync(opts.out, JSON.stringify(result) + "\n");
      n += 1;
      if (n % 50 === 0) process.stderr.write(`  ${n}/${todo.length}\n`);
    }
  } finally {
    await Promise.all([...executors.values()].map((e) => e.close()));
  }
}
