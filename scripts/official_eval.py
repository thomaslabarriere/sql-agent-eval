"""Cross-check our execution accuracy with the official Spider evaluator.

Reads one of our result files (results/spider/<label>.<split>.jsonl), writes the
gold and prediction files in the official format, and runs
taoyds/test-suite-sql-eval (Apache 2.0, commit e97acc5) in execution mode on the
plain Spider databases. Its rules differ from ours (DECISIONS.md D6): it drops
DISTINCT on both sides unless --keep_distinct, and accepts permuted columns.
Both numbers are published; neither replaces the other.

Usage: data/evalenv/bin/python scripts/official_eval.py <label> <split> [--keep_distinct]
"""
import json
import os
import subprocess
import sys

label, split = sys.argv[1], sys.argv[2]
extra = sys.argv[3:]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
res = os.path.join(root, "results", "spider", f"{label}.{split}.jsonl")
work = os.path.join(root, "data", "official", f"{label}.{split}")
os.makedirs(work, exist_ok=True)
rows = [json.loads(l) for l in open(res) if l.strip()]
rows.sort(key=lambda r: int(r["id"].split("_")[1]))

one_line = lambda s: " ".join(s.split())
with open(os.path.join(work, "gold.txt"), "w") as g, open(os.path.join(work, "pred.txt"), "w") as p:
    for r in rows:
        g.write(f"{one_line(r['goldSql'])}\t{r['dbId']}\n")
        # No extracted SQL: an empty line would desynchronize the files, so a
        # query that cannot run stands in; it is scored wrong, as in our harness.
        p.write(one_line(r["predSql"]) + "\n" if r["predSql"] else "SELECT\n")

spider = os.path.join(root, "data", "spider_data")
db = os.path.join(spider, "test_database" if split == "test" else "database")
tables = os.path.join(spider, "test_tables.json" if split == "test" else "tables.json")
ev = os.path.join(root, "data", "test-suite-sql-eval")
cmd = [sys.executable, "evaluation.py", "--gold", os.path.join(work, "gold.txt"), "--pred", os.path.join(work, "pred.txt"),
       "--db", db, "--table", tables, "--etype", "exec", *extra]
print(f"# {len(rows)} items from {res}\n# {' '.join(cmd)}", flush=True)
subprocess.run(cmd, cwd=ev, check=True)

# Per-item verdicts with the evaluator's own functions, so the report can list
# where the two evaluators disagree and break accuracy down by official hardness.
# The mean of these verdicts must equal the aggregate printed above.
sys.path.insert(0, ev)
os.chdir(ev)
from evaluation import Evaluator  # noqa: E402
from exec_eval import eval_exec_match  # noqa: E402
from process_sql import Schema, get_schema, get_sql  # noqa: E402

keep_distinct = "--keep_distinct" in extra
evaluator = Evaluator()
schemas = {}
out = os.path.join(root, "results", "spider", f"official{'-keepdistinct' if keep_distinct else ''}.{label}.{split}.jsonl")
hits = 0
with open(out, "w") as f:
    for r in rows:
        path = os.path.join(db, r["dbId"], r["dbId"] + ".sqlite")
        if path not in schemas:
            schemas[path] = Schema(get_schema(path))
        g = one_line(r["goldSql"])
        hardness = evaluator.eval_hardness(get_sql(schemas[path], g))
        p = one_line(r["predSql"]) if r["predSql"] else "SELECT"
        ok = eval_exec_match(db=path, p_str=p, g_str=g, plug_value=False, keep_distinct=keep_distinct,
                             progress_bar_for_each_datapoint=False)
        hits += ok
        f.write(json.dumps({"id": r["id"], "hardness": hardness, "officialExec": bool(ok)}) + "\n")
print(f"# per-item: {hits}/{len(rows)} = {hits / len(rows):.3f} -> {out}")
