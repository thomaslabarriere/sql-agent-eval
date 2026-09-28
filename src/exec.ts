import type { RawResult } from "./db.js";

/**
 * What the verifier needs from a database: run a query, return raw columns and
 * rows, or throw a tagged SqlRunError. The synthetic benchmark runs on DuckDB
 * (`Db`), Spider runs on SQLite (`SqliteExecutor`), because each gold SQL must
 * execute in the dialect it was written for.
 */
export interface SqlExecutor {
  query(sql: string): Promise<RawResult>;
}
