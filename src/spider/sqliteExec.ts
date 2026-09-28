import { Worker } from "node:worker_threads";
import type { RawResult } from "../db.js";
import { SqlRunError } from "../db.js";
import type { SqlExecutor } from "../exec.js";

/**
 * Read-only SQLite executor for the Spider databases. Spider's gold SQL is written
 * in SQLite's dialect, so it runs here rather than in DuckDB.
 *
 * node:sqlite is synchronous and cannot interrupt a running statement, and a
 * generated query can be a runaway cartesian product. So every query runs in a
 * worker thread; on timeout the worker is terminated (which kills the query) and
 * a fresh one is started for the next query. Rows are read as ARRAYS, never as
 * objects: object mode keys rows by column name, and `SELECT T1.name, T2.name`
 * would silently lose a column.
 */

export const DEFAULT_TIMEOUT_MS = 30_000;
/** A predicted query returning more rows than this is stopped and counted as an error. */
export const DEFAULT_MAX_ROWS = 200_000;

const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(workerData.path, { readOnly: true });
parentPort.on("message", ({ id, sql }) => {
  try {
    const stmt = db.prepare(sql);
    stmt.setReturnArrays(true);
    const columns = stmt.columns().map((c) => c.name);
    const rows = [];
    for (const row of stmt.iterate()) {
      rows.push(row);
      if (rows.length > workerData.maxRows) throw new Error("result too large: more than " + workerData.maxRows + " rows");
    }
    parentPort.postMessage({ id, ok: true, columns, rows });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, message: err && err.message ? err.message : String(err) });
  }
});
`;

type Reply = { id: number; ok: true; columns: string[]; rows: unknown[][] } | { id: number; ok: false; message: string };

export function classifySqliteError(message: string): "schema" | "syntax" | "other" {
  const m = message.toLowerCase();
  // Coupled to SQLite's error text, like the DuckDB classifier in db.ts.
  if (/no such column|no such table/.test(m)) return "schema";
  if (/syntax error|incomplete input|unrecognized token/.test(m)) return "syntax";
  return "other";
}

export class SqliteExecutor implements SqlExecutor {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly timeoutMs: number;
  private readonly maxRows: number;

  constructor(private readonly path: string, opts: { timeoutMs?: number; maxRows?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  }

  private spawn(): Worker {
    if (this.worker === null) {
      this.worker = new Worker(WORKER_SRC, {
        eval: true,
        workerData: { path: this.path, maxRows: this.maxRows },
        execArgv: ["--no-warnings"],
      });
      this.worker.unref();
    }
    return this.worker;
  }

  query(sql: string): Promise<RawResult> {
    const worker = this.spawn();
    const id = this.nextId++;
    return new Promise<RawResult>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
      };
      const onMessage = (reply: Reply): void => {
        if (reply.id !== id) return;
        cleanup();
        if (reply.ok) resolve({ columns: reply.columns, rows: reply.rows });
        else reject(new SqlRunError(reply.message, classifySqliteError(reply.message)));
      };
      const onError = (err: Error): void => {
        cleanup();
        this.worker = null;
        reject(new SqlRunError(err.message, "other"));
      };
      const timer = setTimeout(() => {
        cleanup();
        this.worker = null;
        void worker.terminate();
        reject(new SqlRunError(`timeout: query exceeded ${this.timeoutMs} ms`, "other"));
      }, this.timeoutMs);
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.postMessage({ id, sql });
    });
  }

  async close(): Promise<void> {
    if (this.worker !== null) {
      const w = this.worker;
      this.worker = null;
      await w.terminate();
    }
  }
}
