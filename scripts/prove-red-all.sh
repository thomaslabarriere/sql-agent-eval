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
run $S 's#, enableDoubleQuotedStringLiterals: true##' $T "double-quoted string literals rejected"

L=src/spider/leak.ts; P=src/spider/prompt.ts; D=src/spider/data.ts; T=test/spiderPrep.test.ts
run $L 's#\.trim\(\)\.toLowerCase\(\)\.replace\(/\\s\+/g, " "\)##' $T "leak check without normalization"
run $L 's#evalQ\.has\(normalizeText\(t\.question\)\) \|\| ##' $T "leak check ignores duplicated questions"
run $L 's#filter\(\(d\) => trainDbs\.has\(d\)\)#filter(() => false)#' $T "leak check ignores shared databases"
run $P 's#if \(pk\.length > 0\)#if (false)#' $T "schema drops primary keys"
run $P 's#for \(const fk of fks\)#for (const fk of [] as FkInfo[])#' $T "schema drops foreign keys"
run $P 's#const semi = firstStatementEnd\(sql\);#const semi = sql.indexOf(";");#' $T "naive semicolon cut"
run $P 's#const fenced = #const fenced = null && #' $T "code fences not handled"
run $D 's#\\border\\s\+by\\b#order#' $T "ordered detection too loose"

X=src/spider/stats.ts; T=test/stats.test.ts
run $X 's#const z2 = z \* z;#const z2 = z;#' $T "wilson with a wrong z term"
run $X 's#return Math\.min\(1, 2 \* tail\);#return Math.min(1, tail);#' $T "mcnemar one-sided"
run $X 's#Math\.ceil\(\(p / 100\)#Math.floor((p / 100)#' $T "percentile off by one rank"

X=src/spider/report.ts; T=test/spiderReport.test.ts
run $X 's#const scored = results\.filter\(\(r\) => r\.goldError === undefined\);#const scored = [...results];#' $T "gold failures scored instead of excluded"
run $X 's#else if \(x && !y\) regressions\.push#else if (x \&\& !y) fixes.push#' $T "regressions counted as fixes"
run $X 's#if \(xs\.some\(\(x\) => x === null\)\) return null;##' $T "partial token count summed"
run $X 's#s\.tokens\.prompt \* usdPerMIn#s.tokens.prompt * usdPerMOut#' $T "input tokens priced at output rate"

X=src/spider/prepare.ts; T=test/spiderPrep.test.ts
run $X 's#\.replace\(/;\\s\*\$/, ""\)##' $T "trailing semicolon kept in target"
run $X 's#\.\.\.buildMessages\(schema, item\.question\)#{ role: "user" as const, content: item.question }#' $T "training prompt differs from eval prompt"

exit $fail
