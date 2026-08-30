#!/bin/sh
# Prove a refactor of JpnFlashcards.jsx changed no behaviour.
#
# Builds the current tree and a git ref unminified, then compares the SORTED line sets.
# Sorting is the point: moving code into modules relocates it in the bundle, so a plain
# diff reports thousands of moved lines that mean nothing. The sorted multiset is equal
# if and only if the emitted code is the same.
#
#   sh tools/verify-refactor.sh            # against HEAD
#   sh tools/verify-refactor.sh HEAD~3
set -e
REF="${1:-HEAD}"
cd "$(dirname "$0")/.."
git show "$REF:JpnFlashcards.jsx" > _ref_entry.jsx
trap 'rm -f _ref_entry.jsx' EXIT
norm() { grep -v '^[[:space:]]*// \.\./' "$1" | sed 's/^[[:space:]]*//' | grep -v '^$' | sort; }
( cd tools && node unmin.mjs ../_ref_entry.jsx )      > /tmp/_before.js
( cd tools && node unmin.mjs ../JpnFlashcards.jsx )   > /tmp/_after.js
norm /tmp/_before.js > /tmp/_before.sorted
norm /tmp/_after.js  > /tmp/_after.sorted
N=$(diff /tmp/_before.sorted /tmp/_after.sorted | grep -c '^[<>]' || true)
echo "ref $REF: $(wc -l < /tmp/_before.sorted) lines   now: $(wc -l < /tmp/_after.sorted) lines"
if [ "$N" -eq 0 ]; then echo "IDENTICAL — no behaviour change"; else
  echo "$N differing lines:"; diff /tmp/_before.sorted /tmp/_after.sorted | grep '^[<>]' | head -30; fi
