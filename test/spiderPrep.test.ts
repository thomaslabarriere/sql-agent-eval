import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "../src/spider/nodeSqlite.js";
import { findLeaks, cleanTrain } from "../src/spider/leak.js";
import { buildMessages, extractSql, serializeSchema, SYSTEM_PROMPT } from "../src/spider/prompt.js";
import { isOrdered, loadSplit, SPIDER_ROOT, type SpiderItem } from "../src/spider/data.js";

function item(id: string, split: SpiderItem["split"], dbId: string, question: string, goldSql: string): SpiderItem {
  return { id, split, dbId, question, goldSql };
}

describe("findLeaks", () => {
  const train = [
    item("t0", "train", "club_1", "How many clubs are there?", "SELECT count(*) FROM club"),
    item("t1", "train", "club_1", "List club names.", "SELECT name FROM club"),
    item("t2", "train", "shop", "Total sales?", "SELECT sum(x) FROM s"),
  ];

  it("finds a database shared between train and eval", () => {
    const r = findLeaks(train, [item("e0", "test", "shop", "Something new", "SELECT 1")]);
    expect(r.sharedDbs).toEqual(["shop"]);
  });

  it("finds a duplicated question across different databases, case and spaces normalized", () => {
    const r = findLeaks(train, [item("e0", "test", "soccer_3", "how many  clubs are there?", "SELECT 2")]);
    expect(r.sharedDbs).toEqual([]);
    expect(r.trainIdsToDrop).toEqual(["t0"]);
    expect(r.evalItemsTouched).toBe(1);
  });

  it("finds a duplicated SQL even when the question differs", () => {
    const r = findLeaks(train, [item("e0", "test", "soccer_3", "Club name list", "select name from club")]);
    expect(r.trainIdsToDrop).toEqual(["t1"]);
  });

  it("cleanTrain removes exactly the leaking training items", () => {
    const evals = [item("e0", "test", "soccer_3", "How many clubs are there?", "SELECT 2")];
    const kept = cleanTrain(train, evals);
    expect(kept.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(findLeaks(kept, evals).trainIdsToDrop).toEqual([]);
  });
});

describe("prompt", () => {
  let dir: string;
  let path: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "spider-prompt-"));
    path = join(dir, "s.sqlite");
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE club (Club_ID INTEGER PRIMARY KEY, Name TEXT);
             CREATE TABLE player ("Player Name" TEXT, Club_ID INT, FOREIGN KEY (Club_ID) REFERENCES club(Club_ID));`);
    db.close();
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("serializes tables, types, primary and foreign keys, quoting odd identifiers", () => {
    expect(serializeSchema(path)).toBe(
      [
        "CREATE TABLE club (Club_ID INTEGER, Name TEXT, PRIMARY KEY (Club_ID));",
        'CREATE TABLE player ("Player Name" TEXT, Club_ID INT, FOREIGN KEY (Club_ID) REFERENCES club(Club_ID));',
      ].join("\n"),
    );
  });

  it("builds system + user messages", () => {
    const m = buildMessages("CREATE TABLE a (x INT);", "How many?");
    expect(m).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Schema:\nCREATE TABLE a (x INT);\n\nQuestion: How many?" },
    ]);
  });
});

describe("extractSql", () => {
  it("returns a bare query unchanged", () => {
    expect(extractSql("SELECT count(*) FROM club")).toBe("SELECT count(*) FROM club");
  });
  it("takes the first fenced block", () => {
    expect(extractSql("Here:\n```sql\nSELECT 1\n```\nthen ```sql\nSELECT 2\n```")).toBe("SELECT 1");
  });
  it("keeps only the first statement, ignoring a semicolon inside a string", () => {
    expect(extractSql("SELECT * FROM t WHERE a = 'x;y'; SELECT 2")).toBe("SELECT * FROM t WHERE a = 'x;y'");
  });
  it("drops a leading SQL: label", () => {
    expect(extractSql("SQL: SELECT 1")).toBe("SELECT 1");
  });
  it("returns null on an empty reply", () => {
    expect(extractSql("  ")).toBeNull();
    expect(extractSql("```sql\n```")).toBeNull();
  });
});

describe("isOrdered", () => {
  it("is true only when the gold sorts", () => {
    expect(isOrdered("SELECT a FROM t ORDER  BY a")).toBe(true);
    expect(isOrdered("SELECT a FROM t")).toBe(false);
    expect(isOrdered("SELECT border_by FROM t")).toBe(false);
  });
});

// Runs only when the Spider data is present (never in CI). Pins the measured facts
// reported in DECISIONS.md D12 so a data or code change cannot move them silently.
describe.skipIf(!existsSync(join(SPIDER_ROOT, "test.json")))("real Spider data", () => {
  it("has the published split sizes", () => {
    expect(loadSplit("train").length).toBe(8659);
    expect(loadSplit("dev").length).toBe(1034);
    expect(loadSplit("test").length).toBe(2147);
  });

  it("shares no database between train and eval, and the cleaned train has no textual leak", () => {
    const train = loadSplit("train");
    const evals = [...loadSplit("dev"), ...loadSplit("test")];
    const r = findLeaks(train, evals);
    expect(r.sharedDbs).toEqual([]);
    expect(r.trainIdsToDrop.length).toBe(69);
    const clean = findLeaks(cleanTrain(train, evals), evals);
    expect(clean.sharedDbs).toEqual([]);
    expect(clean.trainIdsToDrop).toEqual([]);
    expect(clean.evalItemsTouched).toBe(0);
  });
});
