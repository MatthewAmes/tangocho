#!/usr/bin/env bash
# Runs when a Claude Code session starts. Pulls the other machines' work automatically and
# tells Claude what state the checkout is in.
#
# This project is edited from three computers and Claude Code conversations do not sync
# between them, so the checkout is the only thing carrying context. Building on a stale
# one is the expensive failure here — it has already produced a divergence that needed a
# hand merge. Pulling automatically removes the step a human has to remember.
#
# --ff-only on purpose: a fast-forward is always safe, and anything that is not one is a
# real decision (a genuine divergence) that should be made deliberately rather than by a
# hook. Never exits non-zero; a failed pull must not stop a session from starting.
set -u
say() { printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$1"; exit 0; }
# Correct JSON string escaping, including embedded newlines. node is already a hard
# dependency of this repo, and hand-rolled sed escaping got it wrong.
json() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
git fetch --quiet origin 2>/dev/null

if ! git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  say "$(json "git: on ${BRANCH}, which has no upstream. Nothing pulled.")"
fi

BEHIND=$(git rev-list --count '@..@{u}' 2>/dev/null || echo 0)
AHEAD=$(git rev-list --count '@{u}..@' 2>/dev/null || echo 0)
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [ "$BEHIND" = "0" ] && [ "$AHEAD" = "0" ]; then
  [ "$DIRTY" != "0" ] && say "$(json "git: ${BRANCH} up to date with origin. ${DIRTY} uncommitted file(s) in the working tree.")"
  say "$(json "git: ${BRANCH} up to date with origin, working tree clean.")"
fi

if [ "$BEHIND" != "0" ] && [ "$AHEAD" != "0" ]; then
  say "$(json "git: ${BRANCH} has DIVERGED from origin — ${AHEAD} local commit(s) and ${BEHIND} remote commit(s). Nothing was pulled. Another machine pushed while this one had unpushed work. Merge deliberately (git pull --no-rebase), rebuild index.html rather than merging it textually, and do not force-push.")"
fi

if [ "$BEHIND" != "0" ]; then
  if [ "$DIRTY" != "0" ]; then
    say "$(json "git: ${BEHIND} commit(s) waiting on origin/${BRANCH} but the working tree has ${DIRTY} uncommitted file(s), so nothing was pulled. Deal with those first.")"
  fi
  if git pull --ff-only --quiet 2>/dev/null; then
    LOG=$(git log --oneline -5 "HEAD@{1}..HEAD" 2>/dev/null | sed 's/^/  /')
    say "$(json "git: pulled ${BEHIND} commit(s) from another machine into ${BRANCH}:
${LOG}
Run npm install if package.json changed.")"
  fi
  say "$(json "git: ${BEHIND} commit(s) behind origin/${BRANCH} and the fast-forward pull failed. Investigate before editing.")"
fi

say "$(json "git: ${BRANCH} is ${AHEAD} commit(s) ahead of origin — unpushed work from a previous session on this machine.")"
