#!/usr/bin/env bash
# Prove a test can fail: apply a deliberate sabotage to a source file, run the
# test, REQUIRE it to fail, then restore the file. Usage:
#   scripts/prove-red.sh <source-file> <perl-substitution> <test-file> "<what is sabotaged>"
# Exits non-zero if the sabotage did not apply or if the test stayed green.
set -uo pipefail
src="$1"; sub="$2"; test="$3"; label="$4"
backup="$(mktemp)"
cp "$src" "$backup"
trap 'cp "$backup" "$src"; rm -f "$backup"' EXIT
perl -0pi -e "$sub" "$src"
if cmp -s "$src" "$backup"; then echo "SABOTAGE DID NOT APPLY: $label"; exit 2; fi
if npx vitest run "$test" --testTimeout=5000 >/dev/null 2>&1; then
  echo "STILL GREEN (test is not proven): $label"; exit 1
fi
echo "RED as expected: $label"
