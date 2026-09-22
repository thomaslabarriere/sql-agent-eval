/**
 * Text-level mutations on a SQL query. They serve two purposes:
 *  1. they inject realistic bugs for the offline scripted agent, and
 *  2. they drive mutation testing: apply a mutation to a gold query and the
 *     verifier must catch that the result is no longer correct. A mutation that
 *     leaves the result unchanged (for example LEFT vs INNER join when there are
 *     no unmatched rows) survives, and a surviving mutant is reported as a
 *     coverage gap in the benchmark rather than a pass.
 *
 * Each mutation returns the transformed SQL, or null when its pattern does not
 * apply to the given query.
 */

export interface SqlMutation {
  name: string;
  apply(sql: string): string | null;
}

function replaceFirst(sql: string, re: RegExp, replacer: (m: string, ...g: string[]) => string): string | null {
  if (!re.test(sql)) return null;
  return sql.replace(re, replacer as (substring: string, ...args: unknown[]) => string);
}

export const MUTATIONS: SqlMutation[] = [
  {
    name: "count_distinct_to_count",
    apply: (sql) => replaceFirst(sql, /COUNT\s*\(\s*DISTINCT\s+([^)]+)\)/i, (_m, col) => `COUNT(${col})`),
  },
  {
    name: "left_join_to_inner",
    apply: (sql) => replaceFirst(sql, /LEFT\s+JOIN/i, () => "INNER JOIN"),
  },
  {
    name: "flip_status_paid",
    apply: (sql) => replaceFirst(sql, /'paid'/i, () => "'refunded'"),
  },
  {
    name: "drop_where",
    apply: (sql) => replaceFirst(sql, /\sWHERE\s+.*?(?=\s(GROUP|ORDER|LIMIT|HAVING)\s|\s*$)/is, () => " "),
  },
  {
    name: "hallucinate_column",
    apply: (sql) => replaceFirst(sql, /\buser_id\b/, () => "usr_id"),
  },
  {
    name: "break_syntax",
    apply: (sql) => replaceFirst(sql, /\bSELECT\b/i, () => "SELCT"),
  },
];

export function mutationByName(name: string): SqlMutation | undefined {
  return MUTATIONS.find((m) => m.name === name);
}
