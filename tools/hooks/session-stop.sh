#!/usr/bin/env bash
# Runs when Claude finishes a turn. Says so if there is work that would not survive walking
# away from this machine.
#
# Unpushed work is invisible: the checkout looks fine, the site looks fine, and the next
# machine simply does not see it. That is the failure this catches. Silent when there is
# nothing to say, so it does not become noise to scroll past.
set -u
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
AHEAD=0
git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 && AHEAD=$(git rev-list --count '@{u}..@' 2>/dev/null || echo 0)
[ "$DIRTY" = "0" ] && [ "$AHEAD" = "0" ] && exit 0

MSG=""
[ "$AHEAD" != "0" ] && MSG="${AHEAD} commit(s) not pushed"
if [ "$DIRTY" != "0" ]; then
  [ -n "$MSG" ] && MSG="${MSG}, "
  MSG="${MSG}${DIRTY} uncommitted file(s)"
fi
node -e 'process.stdout.write(JSON.stringify({systemMessage:"⚠ "+process.argv[1]+" — another machine will not see this until it is committed and pushed."}))' "$MSG"
exit 0
