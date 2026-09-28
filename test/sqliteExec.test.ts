import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseSync } from "../src/spider/nodeSqlite.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteExecutor, classifySqliteError } from "../src/spider/sqliteExec.js";
import { SqlRunError } from "../src/db.js";
import { verify } from "../src/verify.js";
import type { Question } from "../src/types.js";

let dir: string;
let exec: SqliteExecutor;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "sqlite-exec-"));
  const path = join(dir, "t.sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE a(name TEXT, n INTEGER); INSERT INTO a VALUES ('x', 1), ('y', 2);");
  db.close();
  exec = new SqliteExecutor(path, { timeoutMs: 1000, maxRows: 10 });
});

afterAll(async () => {
  await exec.close();
  rmSync(dir, { recursive: true, force: true });
});

const INFINITE = "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c";

describe("SqliteExecutor", () => {
  it("keeps duplicate column names as separate columns", async () => {
    const r = await exec.query("SELECT a.name, b.name FROM a, a AS b WHERE a.n = 1 AND b.n = 2");
    expect(r.columns).toEqual(["name", "name"]);
    expect(r.rows).toEqual([["x", "y"]]);
  });

  it("accepts double-quoted string literals, as Spider gold SQL uses them", async () => {
    const r = await exec.query('SELECT count(*) FROM a WHERE name = "x"');
    expect(r.rows).toEqual([[1]]);
  });

  it("is read-only", async () => {
    await expect(exec.query("DELETE FROM a")).rejects.toBeInstanceOf(SqlRunError);
    const r = await exec.query("SELECT count(*) FROM a");
    expect(r.rows).toEqual([[2]]);
  });

  it("stops a runaway query at the timeout, then keeps working", async () => {
    await expect(exec.query(INFINITE)).rejects.toThrow(/timeout/);
    const r = await exec.query("SELECT count(*) FROM a");
    expect(r.rows).toEqual([[2]]);
  });

  it("stops a result larger than maxRows", async () => {
    await expect(exec.query("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 50) SELECT x FROM c")).rejects.toThrow(/too large/);
  });

  it("classifies SQLite errors", () => {
    expect(classifySqliteError("no such column: nope")).toBe("schema");
    expect(classifySqliteError("no such table: nope")).toBe("schema");
    expect(classifySqliteError('near "selct": syntax error')).toBe("syntax");
    expect(classifySqliteError("incomplete input")).toBe("syntax");
    expect(classifySqliteError("ambiguous column name: name")).toBe("other");
  });
});

describe("verify on SQLite", () => {
  const q: Question = { id: "q", nl: "n", level: 1, ordered: false, goldSql: "SELECT sum(n) FROM a" };
  const attempt = (sql: string) => ({ questionId: "q", sql, confidence: 0, abstained: false });

  it("classifies correct, wrong, hallucinated and timed-out attempts", async () => {
    expect((await verify(exec, q, attempt("SELECT sum(n) FROM a"))).category).toBe("correct");
    expect((await verify(exec, q, attempt("SELECT avg(n) FROM a"))).category).toBe("wrong_result");
    expect((await verify(exec, q, attempt("SELECT sum(nope) FROM a"))).category).toBe("schema_hallucination");
    expect((await verify(exec, q, attempt(INFINITE))).category).toBe("sql_error");
  });
});
