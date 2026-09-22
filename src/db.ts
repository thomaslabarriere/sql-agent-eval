import { DuckDBInstance } from "@duckdb/node-api";

/**
 * Thin async wrapper over an in-process DuckDB. It exposes just what the harness
 * needs: run DDL, and run a query returning raw column names and rows. Value
 * normalization (BigInt, dates, floats) is the comparator's job, not the db's,
 * so this layer stays honest about what DuckDB actually returned.
 */

export interface RawResult {
  columns: string[];
  rows: unknown[][];
}

/** An error running a query, tagged so the harness can tell apart the causes. */
export class SqlRunError extends Error {
  readonly kind: "schema" | "syntax" | "other";
  constructor(message: string, kind: "schema" | "syntax" | "other") {
    super(message);
    this.name = "SqlRunError";
    this.kind = kind;
  }
}

function classifyError(message: string): "schema" | "syntax" | "other" {
  const m = message.toLowerCase();
  // This couples to DuckDB's error message text: a version that rewords binder
  // or parser errors could reclassify schema_hallucination vs sql_error. The
  // patterns are pinned to the DuckDB in package.json; revisit them on upgrade.
  if (/does not have a column|referenced column|table with name|catalog error|not found in from clause|binder error/.test(m)) {
    return "schema";
  }
  if (/parser error|syntax error/.test(m)) return "syntax";
  return "other";
}

export class Db {
  private constructor(private readonly conn: Awaited<ReturnType<Awaited<ReturnType<typeof DuckDBInstance.create>>["connect"]>>) {}

  static async open(): Promise<Db> {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    // The harness executes model-generated SQL. Lock the database down so a
    // generated or injection-steered query cannot read or write local files or
    // load extensions (read_csv, COPY ... TO, INSTALL/LOAD). In-memory queries
    // keep working; only external access is removed. Order matters: disable
    // first, then lock the configuration so it cannot be turned back on.
    await conn.run("SET enable_external_access = false");
    await conn.run("SET lock_configuration = true");
    return new Db(conn);
  }

  /** Run a statement with no result (DDL, inserts). */
  async run(sql: string): Promise<void> {
    await this.conn.run(sql);
  }

  /** Run a query and return raw columns and rows, or throw a tagged SqlRunError. */
  async query(sql: string): Promise<RawResult> {
    try {
      const reader = await this.conn.runAndReadAll(sql);
      return { columns: reader.columnNames(), rows: reader.getRows() as unknown[][] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SqlRunError(message, classifyError(message));
    }
  }
}
