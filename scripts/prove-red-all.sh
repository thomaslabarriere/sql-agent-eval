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

L=src/spider/leak.ts; P=src/spider/prompt.ts; D=src/spider/data.ts; T=test/spiderPrep.test.ts
run $L 's#\.trim\(\)\.toLowerCase\(\)\.replace\(/\\s\+/g, " "\)##' $T "leak check without normalization"
run $L 's#evalQ\.has\(normalizeText\(t\.question\)\) \|\| ##' $T "leak check ignores duplicated questions"
run $L 's#filter\(\(d\) => trainDbs\.has\(d\)\)#filter(() => false)#' $T "leak check ignores shared databases"
run $P 's#if \(pk\.length > 0\)#if (false)#' $T "schema drops primary keys"
run $P 's#for \(const fk of fks\)#for (const fk of [] as FkInfo[])#' $T "schema drops foreign keys"
run $P 's#const semi = firstStatementEnd\(sql\);#const semi = sql.indexOf(";");#' $T "naive semicolon cut"
run $P 's#const fenced = #const fenced = null && #' $T "code fences not handled"
run $D 's#\\border\\s\+by\\b#order#' $T "ordered detection too loose"

exit $fail
