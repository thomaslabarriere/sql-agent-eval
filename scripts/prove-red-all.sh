#!/usr/bin/env bash
# Every test added for the Spider work is proven able to fail: each line below
# sabotages the code under test and requires the test to go red.
# Run: scripts/prove-red-all.sh  (restores every file it touches)
set -u
R=scripts/prove-red.sh; fail=0
run() { "$R" "$@" || fail=1; }

S=src/spider/sqliteExec.ts; T=test/sqliteExec.test.ts
run $S 's/stmt\.setReturnArrays\(true\);//' $T "rows read as objects (duplicate column lost)"
run $S 's/readOnly: true/readOnly: false/' $T "database opened read-write"
run $S 's/void worker\.terminate\(\);\n\s*reject\(new SqlRunError\(`timeout/void 0;\n        (() => {})(`timeout/' $T "timeout never fires a rejection"
run $S 's/if \(rows\.length > workerData\.maxRows\)/if (false)/' $T "row cap removed"
run $S 's/no such column\|no such table/no such index/' $T "schema errors not classified"

exit $fail
