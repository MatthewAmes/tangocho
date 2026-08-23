# tangocho — Code Review, 22 August 2026

A full, multi-dimension review of the **tangocho (単語帳)** codebase at commit `7b9e110` (merge of PR #1, `main`), performed with six independent Claude Fable 5 review agents — one per dimension — followed by three synthesis agents that turned the findings into an implementation-ready backlog.

Everything in this folder is documentation only. **No source files were modified** as part of the review.

## How to read this folder

| File | What it is | Lines |
|---|---|---|
| `00-README.md` | This index: method, cross-cutting findings, how to use the backlog | — |
| `01-functionality-review.md` | Correctness: bugs, race conditions, sync/merge logic, FSRS wiring, Worker, build | 328 |
| `02-project-goals-and-pedagogy-review.md` | Does the app meet its goals? Learning-science critique; the "tailored input" engine; ranked gaps | 284 |
| `03-presentation-ui-ux-review.md` | Visual design, phone layout, interaction, IA, accessibility, PWA — with the app actually rendered at 375×812 / 320×568 / 1280×800 | 370 |
| `04-security-review.md` | Threat model, secrets, auth/session, data isolation, input validation, headers, privacy, supply chain | 382 |
| `05-expansion-and-improvement-opportunities.md` | Product/engineering roadmap: quick wins, core loop, input engine, content, platform, LLM features, things to remove | 507 |
| `06-architecture-maintainability-testing-review.md` | Architecture diagrams, metrics, dead code, data model, test strategy, CI design, modularization plan, docs/runbook outlines | 857 |
| `07-todo-index.md` | **The backlog index**: every TODO item with priority, effort, dependencies, and a suggested order of attack | — |
| `scripts/*.mjs` | Reproduction scripts behind the simulated numbers (FSRS interval runaway, Input-engine behaviour, SEED duplicates) — see `scripts/README.md` | 3 |
| `todo/TODO-NNN-*.md` | One file per work item, written so a less capable model (e.g. Claude Opus) can implement it in a fresh session: verified current code, intended behaviour, step-by-step implementation with code sketches, migration notes, tests, acceptance criteria, pitfalls | 87 files |

Each report has its own executive summary at the top and a severity-rated findings table at the bottom. Line numbers refer to the files as of commit `7b9e110`; if the source has moved on, search for the quoted code instead.

## Method

1. The repo was cloned and surveyed (structure, sizes, full `git log` — the 45 commit messages are unusually detailed and were treated as primary design documentation).
2. Six review agents ran in parallel, each with full read access to the repo, permission to run the existing tests and the build (on a scratch copy), and — for the UI review — an in-app browser to render the app at phone and desktop sizes. Each was required to cite `file:line` for every claim and to verify by tracing or executing code rather than pattern-matching. Several findings were reproduced with small Node scripts (FSRS interval simulation, coverage-tokenizer bug, ISO-8601 regex, seed-merge duplicate loss, keepalive payload size).
3. Three synthesis agents then read all six reports, re-verified every cited line against the source, and wrote the `todo/` items in three ranges: **001–099** security/sync/correctness fixes, **100–199** learning-engine work, **200–299** presentation/platform/maintainability.
4. The human-facing index (this file and `07-todo-index.md`) was assembled from those outputs.

## Independently verified facts worth knowing up front

- `index.html` (the committed build artifact) is **byte-identical** to a fresh `node tools/build.mjs` run. The source and the deployed artifact are in sync.
- Both existing test suites pass: `tools/test-fsrs.mjs` 32/32, `tools/test-input-engine.mjs` 36/36.
- The FSRS-4 formulas and default weights in `tools/fsrs.mjs` match the published algorithm. `conjugate()` was correct on every case tried. Kana tables are complete.
- The Google ID-token verification in the Worker is correct (RS256 pinned, `aud`/`iss`/`exp` checked, real JWKS signature verify, constant-time HMAC compare). No XSS sinks (`dangerouslySetInnerHTML`, `innerHTML`, `eval`) exist in the client.

## Cross-cutting findings (where several reports converge)

These were found independently by two or more agents, which is the strongest signal in the set.

| # | Finding | Reports | Severity |
|---|---|---|---|
| 1 | **The session-signing secret is committed to the repo** in the minified legacy bundles `netlify/functions/sync.mjs` and `tts.mjs` (and in git history since `230b7fc`). `cf/wrangler.toml` says the Worker's `SESSION_SECRET` "must match the existing one", so the live secret is very likely this value. Anyone can forge a 2-year session for any Google account. | 01, 02, 04, 06 | **Critical** |
| 2 | **No recovery from a 401.** When a session expires or the secret is rotated, pull fails silently, push goes to "pending" forever, and the sign-in button is never re-rendered. `signOutGoogle()` is never called. Rotating the secret (fix #1) without this traps every device. | 01, 06 | High |
| 3 | **Secondary keys merge by newest-whole-snapshot-wins** (`mergeSnapshots`), so kana / conjugation / 10k / retention progress from one device can be silently erased by another. Only deck, days, scripts and input have per-record merges. | 01, 06 | High |
| 4 | **The sync snapshot contains the session token itself**, the user's email, the `syncPending` flag and the ~145 KB video-index cache — because `SYNC_SKIP_KEYS` doesn't exclude them. This also makes the snapshot ≈400 KB, far above the 64 KiB `keepalive` limit, so the `pagehide` flush can never send. | 01, 04, 05, 06 | High |
| 5 | **The "removed" sync-code path is still live** on both client (`syncRequestOptions` falls back to `?code=`) and Worker. Every not-signed-in visitor writes orphan snapshots into KV under an unauthenticated, guessable key; the Worker accepts 4-char codes. | 01, 04, 05, 06 | Medium |
| 6 | **Every LLM feature is dead.** `callClaude()` POSTs from the browser to `api.anthropic.com` with no key. ✨ hook, the automatic session debrief, script annotation, and the (unmounted) Sentences tab all fail 100% of the time. Needs a session-gated Worker endpoint — or removal. | 01, 02, 05, 06 | High (product) |
| 7 | **FSRS is implemented faithfully but mis-wired**: `dueness()` hard-codes 0.9 and ignores the `due` FSRS computed (retention knob is cosmetic; 10-minute relearning step not honoured); latency < 3 s → *Easy* makes Easy the modal grade (simulated: 5.8 → 46 → 315-day intervals after three fast answers); the Write tab records production attempts into the recognition state. | 01, 02 | High (pedagogy) |
| 8 | **Seed re-merge keyed by `term` only** while 17 SEED terms are duplicated across lessons → pre-Act-4 decks end up ~16 cards short with wrong meanings (うち "house" → "our company"). | 01, 02, 06 | High |
| 9 | **UTC day keys** (`toISOString().slice(0,10)`) for streak, "today", and the 10k quota; streak logic uses local noon — so after ~5–6 pm US time the buddy reports "0 days in a row" right after studying. | 01, 02, 03 | Medium |
| 10 | **Worker `iso8601ToSeconds` regex uses `(d+)` not `(\d+)`** — every YouTube duration parses to 0; the "real video lengths" feature is silently dead. | 01, 02, 05, 06 | Medium |
| 11 | **Tailored-input engine is half-realized**: level seeded once from the deck and never re-informed; "Just right" is an unconditional +1; per-video ratings don't propagate to channels; coverage tokenizer counts any kana run after a known word as covered (`これはペンです` vs deck `[これ]` = 100%); ~⅓ of picks at the learner's level are kids' cartoons with no channel opt-out. | 02, 05 | High (goal) |
| 12 | **No security headers** (CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS), no body-size limit on `POST /api/sync`, no rate limit on the billable TTS miss path. | 04 | Medium |
| 13 | **Two real layout bugs**: the 10k "session complete" screen renders as a broken vertical strip (`.tc-sumgrid` undefined); Browse on phones hides every word's reading (`.tc-rowread{display:none}` media rule left over from the old table). Plus a stray bordered box around the Input tab (`.tc-input` defined twice). | 03 | High (UX) |
| 14 | **Testability blocker**: module-level side effects (`window.addEventListener`, `localStorage`, `speechSynthesis`, `createRoot`) run on import, so `test-input-engine.mjs` has to text-slice functions out of the JSX. No tests for sync merges, scheduling, `conjugate()`, or the Worker. No CI enforcing build/artifact sync. | 05, 06 | Medium |
| 15 | **Not a PWA**: no manifest/icons/service worker; `max-age=0` on a 549 KB HTML; no safe-area insets despite `viewport-fit=cover`. | 03, 05 | Medium |

## What the reviewers consistently praised

- Commit messages and *why*-comments that function as design docs; every change carries the data that motivated it.
- The build pipeline's hard-abort sanity checks and the `check-feeds.mjs` cross-file invariant.
- The sync layer's durability work: per-record merges for the deck, pending flag with backoff, visible save state, pre-migration snapshots.
- A coherent, attractive visual language (indigo/vermilion/washi palette, big kanji, pixel-nigiri buddy) that is well above typical student-project quality.
- Honest handling of estimation limits in the video index (`confidence` field, "known weakness" section) and a deliberate, allowlisted feed proxy.
- Correct, complete kana tables and conjugation rules; correct OAuth token verification.

## Suggested order of attack (summary — details in `07-todo-index.md`)

1. **Today:** rotate `SESSION_SECRET` + delete `netlify/functions/` + add 401 recovery/sign-out (so the rotation doesn't strand devices) + stop syncing the session token and video cache.
2. **This week:** kill the sync-code path (client + Worker), fix the two layout bugs, the ISO-8601 regex, UTC day keys, the seed-merge key, security headers, sync body limit.
3. **Next:** FSRS wiring (dueness/retention/relearning, grade thresholds, Write → `rfsrs`), review log, `/api/ai` Worker endpoint to revive the LLM features, Input-engine fixes.
4. **Then:** make the JSX importable without side effects → tests → CI → modularization → PWA → docs/runbook.

## Caveats

- The review is of a snapshot; anything merged after `7b9e110` is not reflected.
- Severity is calibrated to a single-learner hobby app. Items marked Critical/High are the ones that risk data loss, account compromise, or defeat a stated goal; most of the rest is hardening and polish.
- Reviewers could not observe the live Worker's secrets; the "secret likely matches" conclusion is inferred from the `wrangler.toml` comment and commit `11dee08`. Rotating it is cheap and removes the doubt.
