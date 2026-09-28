import { DatabaseSync } from "./nodeSqlite.js";

/**
 * The ONE prompt format (DECISIONS.md D8). The evaluation agent and the training
 * data writer both call buildMessages, so the model is evaluated on exactly the
 * format it was trained on, before and after fine-tuning.
 */

export const SYSTEM_PROMPT =
  "You translate a question about a SQLite database into one SQLite query. Use only the tables and columns in the schema. Return only the SQL query, with no explanation.";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function ident(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

interface ColumnInfo {
  name: string;
  type: string;
  pk: number;
}
interface FkInfo {
  from: string;
  table: string;
  to: string | null;
}

/**
 * A compact, deterministic schema: one CREATE TABLE line per table, rebuilt from
 * PRAGMA metadata (columns, types, primary key, foreign keys) rather than copied
 * from the stored DDL, which in Spider varies in style and comments. No sample
 * values are included.
 */
export function serializeSchema(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .all() as { name: string }[];
    const lines: string[] = [];
    for (const { name } of tables) {
      const cols = db.prepare(`PRAGMA table_info(${ident(name)})`).all() as unknown as ColumnInfo[];
      const fks = db.prepare(`PRAGMA foreign_key_list(${ident(name)})`).all() as unknown as FkInfo[];
      const parts = cols.map((c) => (c.type ? `${ident(c.name)} ${c.type}` : ident(c.name)));
      const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
      if (pk.length > 0) parts.push(`PRIMARY KEY (${pk.map((c) => ident(c.name)).join(", ")})`);
      for (const fk of fks) {
        const target = fk.to ? `${ident(fk.table)}(${ident(fk.to)})` : ident(fk.table);
        parts.push(`FOREIGN KEY (${ident(fk.from)}) REFERENCES ${target}`);
      }
      lines.push(`CREATE TABLE ${ident(name)} (${parts.join(", ")});`);
    }
    return lines.join("\n");
  } finally {
    db.close();
  }
}

export function buildMessages(schema: string, question: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Schema:\n${schema}\n\nQuestion: ${question}` },
  ];
}

/**
 * The single SQL extraction rule, identical before and after fine-tuning: take the
 * first fenced code block if there is one, else the whole reply; drop a leading
 * "SQL:" label; keep the first statement. Returns null when nothing is left, which
 * is counted as an extraction failure, never silently repaired.
 */
export function extractSql(reply: string): string | null {
  const fenced = /```(?:sql|sqlite)?\s*\n?([\s\S]*?)```/i.exec(reply);
  let sql = (fenced?.[1] ?? reply).trim();
  sql = sql.replace(/^sql:\s*/i, "");
  const semi = firstStatementEnd(sql);
  if (semi >= 0) sql = sql.slice(0, semi);
  sql = sql.trim();
  return sql.length > 0 ? sql : null;
}

/** Index of the first `;` outside a quoted string or identifier, or -1. */
function firstStatementEnd(sql: string): number {
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === ";") {
      return i;
    }
  }
  return -1;
}
