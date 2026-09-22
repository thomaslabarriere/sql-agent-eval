import { describe, it, expect, beforeAll } from "vitest";
import { Db } from "../src/db.js";
import { verify } from "../src/verify.js";
import type { Question, SqlAttempt } from "../src/types.js";

let db: Db;

beforeAll(async () => {
  db = await Db.open();
  await db.run("CREATE TABLE t(id INTEGER, val INTEGER)");
  await db.run("INSERT INTO t VALUES (1,10),(2,20),(3,30)");
});

function q(partial: Partial<Question> & { goldSql: string }): Question {
  return { id: "q", nl: "n", level: 1, ordered: false, ...partial };
}
function attempt(sql: string | null, abstained = false): SqlAttempt {
  return { questionId: "q", sql, confidence: 0.9, abstained };
}

describe("verify", () => {
  it("marks a matching result correct", async () => {
    const v = await verify(db, q({ goldSql: "SELECT SUM(val) FROM t" }), attempt("SELECT SUM(val) FROM t"));
    expect(v.category).toBe("correct");
  });

  it("marks a running-but-wrong result as wrong_result", async () => {
    const v = await verify(db, q({ goldSql: "SELECT SUM(val) FROM t" }), attempt("SELECT AVG(val) FROM t"));
    expect(v.category).toBe("wrong_result");
  });

  it("marks a syntax error as sql_error", async () => {
    const v = await verify(db, q({ goldSql: "SELECT SUM(val) FROM t" }), attempt("SELCT SUM(val) FROM t"));
    expect(v.category).toBe("sql_error");
  });

  it("marks an unknown column as schema_hallucination", async () => {
    const v = await verify(db, q({ goldSql: "SELECT SUM(val) FROM t" }), attempt("SELECT SUM(nope) FROM t"));
    expect(v.category).toBe("schema_hallucination");
  });

  it("counts abstaining on an ambiguous question as correct", async () => {
    const v = await verify(db, q({ ambiguous: true, goldSql: "SELECT SUM(val) FROM t" }), attempt(null, true));
    expect(v.category).toBe("correct");
  });

  it("counts answering an ambiguous question as ambiguous_question", async () => {
    const v = await verify(db, q({ ambiguous: true, goldSql: "SELECT SUM(val) FROM t" }), attempt("SELECT SUM(val) FROM t"));
    expect(v.category).toBe("ambiguous_question");
  });

  it("counts abstaining on an answerable question as wrong_result", async () => {
    const v = await verify(db, q({ goldSql: "SELECT SUM(val) FROM t" }), attempt(null, true));
    expect(v.category).toBe("wrong_result");
  });
});
