import { dbPath, isOrdered, loadSplit, type Split } from "./data.js";
import { SqliteExecutor } from "./sqliteExec.js";

/**
 * Executes every gold query of a split with the harness executor, before any
 * model is involved (plan step 8). Nothing is fixed: gold failures and empty gold
 * results are counted and published. An empty gold matters because any wrong
 * query that also returns nothing is scored correct on that item (DECISIONS.md D13).
 */

export interface GoldCheck {
  split: Split;
  n: number;
  ordered: number;
  errors: { id: string; error: string }[];
  emptyIds: string[];
}

export async function goldCheck(split: Split): Promise<GoldCheck> {
  const items = loadSplit(split);
  const executors = new Map<string, SqliteExecutor>();
  const out: GoldCheck = { split, n: items.length, ordered: 0, errors: [], emptyIds: [] };
  try {
    for (const item of items) {
      const path = dbPath(item);
      let exec = executors.get(path);
      if (exec === undefined) {
        exec = new SqliteExecutor(path);
        executors.set(path, exec);
      }
      if (isOrdered(item.goldSql)) out.ordered += 1;
      try {
        const r = await exec.query(item.goldSql);
        if (r.rows.length === 0) out.emptyIds.push(item.id);
      } catch (err) {
        out.errors.push({ id: item.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await Promise.all([...executors.values()].map((e) => e.close()));
  }
  return out;
}
