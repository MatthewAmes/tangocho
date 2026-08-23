# tangocho — TODO Backlog Index (22 Aug 2026 review)

This index lists every work item produced by the 22 August 2026 code review. Each item lives in its own file under [`todo/`](todo/) and is written so that a less capable model (e.g. Claude Opus) — or a human — can implement it in a fresh session with no memory of the review: verified current code with `file:line`, the intended end state, numbered implementation steps with code sketches, data-migration notes, tests, acceptance criteria, and pitfalls.

**87 items** · Priority: 9 × P0, 42 × P1, 34 × P2, 2 × P3 · Effort: 7 × XS, 42 × S, 35 × M, 3 × L

Three numbered ranges:

| Range | Theme | Count | Source reports |
|---|---|---|---|
| `TODO-001…019` | **A — Fix what's broken or unsafe**: security, sync/data integrity, correctness, dead/unsafe paths | 19 | 01, 04, 06 (+05) |
| `TODO-100…128` | **B — Make the learning engine do what it's meant to do**: FSRS wiring, grading, session composition, Input (入力) engine, content depth, day-log, `/api/ai` | 29 | 02, 05, 01 |
| `TODO-200…238` | **C — Presentation, platform, maintainability**: UI/UX/a11y fixes, PWA, build/CI, importable modules, tests, modularization, docs, runbook | 39 | 03, 06, 05 |

## How to hand an item to an implementer

Paste this into a fresh Claude Code session opened at the repo root (adjust the item id):

> Implement `docs/8-22-2026-code-review/todo/TODO-002-401-recovery-and-sign-out.md` exactly as written. Read the whole file first, then open every cited `file:line` and confirm the "Current behaviour (verified)" section still matches the source before changing anything — if it doesn't, stop and tell me what moved. Follow the implementation steps in order; do not expand scope. Run the tests and the build as described in "Testing & verification" (`cd tools && npm install && node build.mjs` — `index.html` is a committed build artifact and must be rebuilt and committed with the change). Tick every acceptance criterion and report which ones you could not verify. Do not deploy (`wrangler deploy`) unless I say so.

Rules of thumb for sequencing:
- Respect the **Depends on** column; items inside a theme are already roughly in priority order.
- Ship **Phase 0 as one deploy** (see below): rotating the secret (TODO-001) without 401 recovery (TODO-002) strands every signed-in device.
- `index.html` is the deployed artifact. Every code change ends with `node tools/build.mjs` and a commit of the rebuilt file; CI (TODO-213) will eventually enforce this.
- After Theme C's modularization (TODO-221…227) lands, line numbers in older items will be stale — search for the quoted code instead.

## Phased plan

### Phase 0 — today, one deploy (≈ 1 day)
| Order | Item | Why now |
|---|---|---|
| 1 | TODO-002 401 recovery + sign-out | Prerequisite for rotating the secret without stranding devices |
| 2 | TODO-004 stop syncing session/email/video cache | Removes the token from KV and shrinks the snapshot 400 KB → ~60 KB |
| 3 | TODO-001 rotate `SESSION_SECRET`, delete `netlify/functions/` | The one Critical finding |
| 4 | TODO-003 remove sync-code path (client + Worker) | Closes the unauthenticated KV write path |
| 5 | TODO-016 remove browser-direct `callClaude` (stub behind `AI_ENABLED`) | Removes the temptation to paste a key client-side; TODO-126 later replaces it properly |

### Phase 1 — this week: correctness & visible bugs (≈ 3–4 days)
TODO-005 (sync body cap/validation) · TODO-006 (pagehide flush) · TODO-008 (per-record merge for secondary keys) · TODO-009 + TODO-124 (seed-merge key + duplicate cleanup + deck repair) · TODO-010 (local day keys) · TODO-011 (ISO-8601 regex) · TODO-012 (security headers) · TODO-018 (cache invalidation after pull) · TODO-200, TODO-201 (two shipping layout bugs + CSS collisions) · TODO-210 (build stamp) · TODO-211 (root package.json, pins) · TODO-213 (CI with artifact-drift check).

### Phase 2 — the learning engine (≈ 1–2 weeks)
TODO-100, TODO-101, TODO-102 (FSRS wiring: dueness/retention/relearning, grade thresholds, Write → `rfsrs`) → TODO-103, TODO-104, TODO-107, TODO-108 · TODO-105 (review log) · TODO-111 (day log from all modalities) · TODO-112, TODO-113, TODO-114, TODO-115, TODO-116, TODO-117 (Input engine) · TODO-121 (て-form) · TODO-125 + TODO-126 (`/api/ai` + client rewiring; revives ✨ hook, debrief, annotation) · TODO-013, TODO-014 (TTS quota, key scoping).

### Phase 3 — phone experience & platform (≈ 1–2 weeks)
TODO-202, TODO-203, TODO-204, TODO-205, TODO-206, TODO-208 (ergonomics, tab bar, Quit/guard, a11y, contrast) · TODO-212 (importable JSX — unlocks real tests) · TODO-214, TODO-215 (PWA) · TODO-229, TODO-230, TODO-231, TODO-232 (tests) · TODO-234, TODO-236, TODO-237 (README, CONTRIBUTING/CLAUDE.md, RUNBOOK + KV backup) · TODO-015 (KV backup script — shared with TODO-237).

### Phase 4 — deeper work (ongoing)
TODO-007 (delta sync) · TODO-106 (FSRS optimiser) · TODO-109, TODO-110 (leeches, new-card limit/catch-up) · TODO-118, TODO-119, TODO-120 (per-video unknown words, "watch with the deck", measured minutes) · TODO-122, TODO-123, TODO-127, TODO-128 (card depth, particle drills, Sentences, listening cards) · TODO-207, TODO-209, TODO-216, TODO-217, TODO-218, TODO-219, TODO-220 (feedback layer, idioms, undo, motion, empty states, IA) · TODO-221…228 (modularization + tidiness) · TODO-233 (Playwright) · TODO-235, TODO-238 (ARCHITECTURE/DATA-SCHEMA, health/observability) · TODO-017, TODO-019.

## Overlaps and reconciliation notes

The three synthesis agents worked in parallel; a few items intentionally touch the same ground. Resolve as follows:

- **KV backup** — TODO-015 (Theme A) specifies `tools/kv-backup.mjs` + restore; TODO-237 (Theme C) adds the nightly cron and the RUNBOOK section. Implement TODO-015's script once; TODO-237 wraps it.
- **Browser-direct Anthropic call** — TODO-016 (Theme A) removes it now behind an `AI_ENABLED=false` stub; TODO-125/126 (Theme B) build the Worker endpoint and rewire the client. TODO-126 supersedes TODO-016's stub. Do TODO-016 first (Phase 0), TODO-125/126 later.
- **Worker observability** — TODO-013 adds minimal logging around TTS quotas; TODO-238 adds `/api/health` and `[observability]`. Compatible; TODO-238 is the complete version.
- **Day keys** — TODO-010 (Theme A) introduces `localDayKey()` and migrates existing keys; TODO-111 (Theme B) must use it, not add a second helper.
- **Seed merge** — TODO-009 (Theme A) changes the merge key and repairs decks; TODO-124 (Theme B) decides each duplicate pair and adds the build check; TODO-122 appends new fields to `SEED_FIELDS`. Order: 009 → 124 → 122.
- **Un-hide / "Not for me"** — TODO-116 (Theme B) needs the generic un-hide list TODO-216 (Theme C) builds; either can ship first with a minimal list.
- **Dead code** — TODO-228 (Theme C) is the tidiness sweep; it is explicitly sequenced after Theme A's deletions (netlify/, sync-code) and Theme B's Sentences/Add decision (TODO-127 mounts Sentences; `Add` remains a delete-or-route decision noted in TODO-218).
- **Security headers** — TODO-012 assumes TODO-016 has removed the only cross-origin `fetch` so `connect-src 'self' https://accounts.google.com …` is sufficient; if TODO-125 later adds calls, they go through the Worker (same origin), so the CSP does not need to change.

## Full item list

### Theme A — Fix what's broken or unsafe (TODO-001…019)
| ID | Title | Priority | Effort | Depends on |
|---|---|---|---|---|
| TODO-001 | [Rotate the committed SESSION_SECRET and delete the Netlify function bundles](todo/TODO-001-rotate-session-secret-delete-netlify-functions.md) | P0 | S | TODO-002 |
| TODO-002 | [Recover from 401 / expired sessions and add a working Sign out](todo/TODO-002-401-recovery-and-sign-out.md) | P0 | M | — |
| TODO-003 | [Remove the unauthenticated sync-code path (client and Worker)](todo/TODO-003-remove-sync-code-path.md) | P0 | S | TODO-002 |
| TODO-004 | [Stop syncing the session token, email, video-index cache and sync bookkeeping keys](todo/TODO-004-sync-skip-keys-and-pending-flag.md) | P1 | S | TODO-003 |
| TODO-005 | [Worker: size cap, shape validation and server-stamped `updatedAt` on `POST /api/sync`; `handleTts` secret guard](todo/TODO-005-worker-sync-body-validation.md) | P1 | S | TODO-003, TODO-004 |
| TODO-006 | [Make the "flush before the page goes away" actually send: hidden-tab push, size-guarded keepalive, dirty tracking](todo/TODO-006-pagehide-flush-strategy.md) | P1 | S | TODO-004 |
| TODO-007 | [Delta (partial) pushes: tiny per-card patches for the page-unload flush, merged server-side](todo/TODO-007-partial-delta-sync.md) | P2 | M | TODO-005, TODO-006, TODO-008 |
| TODO-008 | [Per-record merge for kana / conj / freq / hooks (no more "newest snapshot wins"), prototype guard, testable merge module](todo/TODO-008-per-key-merge-secondary-keys.md) | P1 | M | TODO-004, TODO-005 |
| TODO-009 | [Seed re-merge keyed by `term\|lesson\|sec` (not `term`), repair decks corrupted by the old merge, de-collide 方](todo/TODO-009-seed-remerge-by-card-key.md) | P1 | M | TODO-008 |
| TODO-010 | [Key days by local date, not UTC (streak, "today", 10k quota, Input log)](todo/TODO-010-local-day-keys.md) | P1 | S | — |
| TODO-011 | [Fix the Worker's `iso8601ToSeconds` regex (`(d+)` → `(\d+)`), make `T` optional, add a test](todo/TODO-011-worker-iso8601-regex.md) | P2 | XS | TODO-005 |
| TODO-012 | [Security headers from the Worker: CSP (GIS-compatible), frame-ancestors, nosniff, Referrer-Policy, HSTS](todo/TODO-012-security-headers-csp.md) | P1 | S | TODO-016 |
| TODO-013 | [Per-user daily quota and burst limit on billable TTS cache-misses (+ Worker observability)](todo/TODO-013-tts-rate-limit-quota.md) | P2 | S | TODO-003 |
| TODO-014 | [Scope the Google API key(s): API restrictions, quota caps, split TTS vs YouTube, confirm the old key is dead](todo/TODO-014-google-api-key-scoping.md) | P2 | XS | — |
| TODO-015 | [KV backup: `tools/kv-backup.mjs` (export every sync record) + restore procedure](todo/TODO-015-kv-backup-script.md) | P2 | S | TODO-003 |
| TODO-016 | [Remove the browser-direct Anthropic call; gate the AI affordances behind `AI_ENABLED`; build guard](todo/TODO-016-remove-browser-direct-callclaude.md) | P1 | S | — |
| TODO-017 | [Do not reseed (and then push) when the local deck fails to parse](todo/TODO-017-unparsable-deck-guard.md) | P2 | S | TODO-009 |
| TODO-018 | [Invalidate module-level caches (`_days`, `retentionTarget`) after a cloud pull](todo/TODO-018-invalidate-caches-after-pull.md) | P2 | XS | — |
| TODO-019 | [Shorter sessions, `iat` in the token, per-user revocation ("sign out everywhere"), and a cloud-data delete](todo/TODO-019-session-lifetime-revocation.md) | P3 | S | TODO-002, TODO-003, TODO-005 |

### Theme B — Learning engine (TODO-100…128)
| ID | Title | Priority | Effort | Depends on |
|---|---|---|---|---|
| TODO-100 | [Make `dueness()` schedule from FSRS `due`, the retention target and the relearning step](todo/TODO-100-dueness-honours-fsrs-due.md) | P0 | S | — |
| TODO-101 | [Re-balance latency→grade so *Easy* is not the modal grade; add an explicit "too easy / slow" override](todo/TODO-101-rebalance-latency-grading.md) | P0 | S | — |
| TODO-102 | [Route the Write tab into the production (`rfsrs`) track, with a writing-appropriate latency scale](todo/TODO-102-write-tab-production-state.md) | P0 | XS | TODO-101 |
| TODO-103 | [Feed only the first grade of a card per session into FSRS; treat in-session requeues as relearning steps](todo/TODO-103-first-grade-only-per-session.md) | P1 | S | TODO-100 |
| TODO-104 | [Session composition: honour smartPool's production picks, fix slot accounting, make "Go again" draw the next due cards, and prefer the active scene for new words](todo/TODO-104-session-composition-fixes.md) | P1 | M | TODO-100 |
| TODO-105 | [Append-only review log (`jpn101:revlog`) with union merge, local cap, and CSV export](todo/TODO-105-append-only-review-log.md) | P1 | M | — |
| TODO-106 | [FSRS parameter optimisation: `tools/fsrs-optimize.mjs` over the exported review log + `jpn101:fsrsParams` plumbing](todo/TODO-106-fsrs-parameter-optimisation.md) | P2 | L | TODO-101, TODO-105 |
| TODO-107 | [Show "next in ~Nd" on the card back, per-section fading/mastery via `recallChance`, the week forecast, and derive "words solid" from stability](todo/TODO-107-card-back-forecast-and-section-mastery.md) | P1 | S | TODO-100 |
| TODO-108 | [Freq (10k) "next reviews in ~" from FSRS `due`, not the retired SM-2 ladder](todo/TODO-108-freq-nextin-via-fsrs.md) | P2 | XS | TODO-100 |
| TODO-109 | [Leech handling: suspend / reset from Browse, auto-offer a hook, surface confusable siblings](todo/TODO-109-leech-handling.md) | P2 | S | TODO-105, TODO-126 |
| TODO-110 | [Visible daily new-card limit, catch-up mode when review debt is high, and a session-length chip](todo/TODO-110-daily-new-limit-catch-up-session-length.md) | P1 | M | TODO-100, TODO-104 |
| TODO-111 | [Log every study modality to the day log (Kana, Drill, Scripts, Input minutes) and keep the streak consistent with the day key](todo/TODO-111-logday-all-modalities.md) | P1 | S | TODO-010 |
| TODO-112 | [Input level: fuse deck mastery into the level continuously and floor the learning rate](todo/TODO-112-input-level-fuse-deck-continuously.md) | P1 | S | — |
| TODO-113 | [Input verdict weights: make "Just right" ≈ 0 so the steady state is comprehension, not one-third "Hard"](todo/TODO-113-input-verdict-weights-equilibrium.md) | P1 | XS | TODO-112 |
| TODO-114 | [Propagate per-video ratings to channel priors (hierarchical shrinkage) and let channel ratings inform their indexed videos](todo/TODO-114-input-channel-priors.md) | P1 | M | TODO-112 |
| TODO-115 | [Fix `coverageAgainstDeck`'s kana-run-after-known-word hole and use a better segmenter (particle/copula stoplist + dictionary longest-match)](todo/TODO-115-coverage-tokenizer.md) | P1 | M | — |
| TODO-116 | [Input content preferences: "no kids content" toggle, channel-level "Not for me", un-hide list, prefer JP captions, dedupe channel entries against indexed videos](todo/TODO-116-input-content-preferences.md) | P1 | S | TODO-114, TODO-216 |
| TODO-117 | ["Background" (passive) mode: vary picks by seed instead of always returning the same three longest videos](todo/TODO-117-input-background-mode-reroll.md) | P2 | XS | — |
| TODO-118 | [Ship per-video top-unknown-words from the index pipeline (`tools/yt-index.mjs` → `yt-pack.mjs` → `data/videos.json` → `unpackVideos`)](todo/TODO-118-per-video-unknown-words.md) | P2 | M | TODO-115 |
| TODO-119 | ["Watch with the deck": pre-teach the words you'll meet, post-quiz "which did you catch?", add unknowns to the deck](todo/TODO-119-watch-with-the-deck.md) | P2 | M | TODO-115, TODO-118, TODO-126, TODO-218 |
| TODO-120 | [Input: record measured (not planned) minutes and weight evidence by them](todo/TODO-120-input-measured-minutes.md) | P2 | S | — |
| TODO-121 | [Add て-form (and たい) to `conjugate()`, a drill form for it, an explicit `null` for unknown irregulars, and a table test](todo/TODO-121-te-form-in-conjugate.md) | P1 | S | — |
| TODO-122 | [Card schema depth: `pos` and `ex` (example sentences) fields, a data-driven `SEED_FIELDS` list so new fields reach existing decks, and a seed-time example generator from SCRIPT_SEED](todo/TODO-122-card-schema-pos-examples-seed-fields.md) | P2 | M | TODO-009, TODO-124 |
| TODO-123 | [Particle-fill drills generated from SCRIPT_SEED (no LLM): blank は/が/を/に/で/と/へ/も/の, grade by exact match, schedule with `statReview`](todo/TODO-123-particle-fill-drills.md) | P2 | M | TODO-115 |
| TODO-124 | [Clean up the 17 duplicate terms in SEED (decide per pair), add a build-time duplicate-key check, and ship the one-off repair for decks corrupted by the term-keyed merge](todo/TODO-124-seed-duplicate-cleanup.md) | P1 | S | TODO-009 |
| TODO-125 | [`POST /api/ai` Worker endpoint: session-gated, task allowlist, prompt-hash KV cache, per-user daily cap, Anthropic Messages API with structured JSON output](todo/TODO-125-api-ai-worker-endpoint.md) | P1 | M | TODO-001, TODO-002, TODO-016 |
| TODO-126 | [Client: replace `callClaude` with `callAI(task, input)` → `/api/ai`; rewire ✨ hook, session debrief, and Scripts annotation; remove the browser-direct Anthropic call](todo/TODO-126-client-callai-rewiring.md) | P1 | S | TODO-016, TODO-125 |
| TODO-127 | [Mount the `Sentences` component (fill-in-the-blank / translate) on `/api/ai` with the local fallback; record results into the deck](todo/TODO-127-mount-sentences-via-callai.md) | P2 | S | TODO-125, TODO-126 |
| TODO-128 | [Audio-first (listening) cards interleaved into Study, with their own `lfsrs` track](todo/TODO-128-audio-first-listening-cards.md) | P3 | S | TODO-100, TODO-104 |

### Theme C — Presentation, platform, maintainability (TODO-200…238)
| ID | Title | Priority | Effort | Depends on |
|---|---|---|---|---|
| TODO-200 | [Fix the broken 10k (Freq) "session complete" screen](todo/TODO-200-fix-10k-session-complete-layout.md) | P1 | S | — |
| TODO-201 | [Fix stale-CSS collisions: Browse readings hidden on phones, Input tab stray box, duplicate `.tc-seg`/`.tc-input`](todo/TODO-201-fix-stale-css-collisions.md) | P1 | S | — |
| TODO-202 | [Phone ergonomics: safe-area insets, no iOS zoom on inputs, keyboard avoidance, hover gating, desktop-only tips](todo/TODO-202-phone-ergonomics-safe-area-keyboard-hover.md) | P1 | S | — |
| TODO-203 | [Tab bar as one scrollable row (≥44px tabs) and a 44px tap-target floor everywhere](todo/TODO-203-tab-bar-single-row-and-tap-targets.md) | P1 | M | — |
| TODO-204 | [Add Quit to Study; guard against mid-session tab switches; keep session tabs mounted](todo/TODO-204-study-quit-and-mid-session-tab-guard.md) | P1 | M | — |
| TODO-205 | [Accessibility: fix `lang` (en UI / ja content), add labels and input types to every form control](todo/TODO-205-a11y-lang-attributes-and-form-labels.md) | P1 | M | — |
| TODO-206 | [Accessibility: honest tab semantics, flashcards as real buttons, visible focus, headings, confirm-dialog focus, decorative emoji](todo/TODO-206-a11y-tabs-aria-card-buttons-focus-headings.md) | P1 | M | TODO-203 |
| TODO-207 | [Feedback layer: toast slot, live-region announcements, speaker playing/failed states, header sync dot](todo/TODO-207-feedback-toast-live-region-speaker-states-sync-dot.md) | P2 | M | TODO-206 |
| TODO-208 | [Contrast fixes, minimum type sizes, `color-scheme` meta (and an optional light theme)](todo/TODO-208-contrast-type-floors-color-scheme.md) | P1 | S | — |
| TODO-209 | [One "selected" idiom, one "primary" idiom, consistent grade buttons and toggle labels, copy fixes](todo/TODO-209-one-selected-idiom-grade-buttons-copy.md) | P2 | M | — |
| TODO-210 | [Generate the build stamp at build time (`__BUILD__`), move it out of the `<h1>`, expose it in `<meta>`](todo/TODO-210-build-stamp-from-build.md) | P1 | S | — |
| TODO-211 | [Root `package.json` (build/test/check/dev/deploy scripts), `build.mjs --check`, pinned esbuild/wrangler, `.nvmrc`, `.gitattributes`](todo/TODO-211-root-package-json-build-check-pins.md) | P0 | S | — |
| TODO-212 | [Make the app importable in Node without side effects (guard module-level DOM access; side-effect-free exports)](todo/TODO-212-make-jsx-importable-without-side-effects.md) | P0 | M | TODO-211 |
| TODO-213 | [GitHub Actions CI: tests + build + committed-artifact drift check + bundle assertions + optional deploy](todo/TODO-213-github-actions-ci.md) | P0 | S | TODO-211 |
| TODO-214 | [PWA manifest, home-screen icons, favicon, apple-touch-icon served as real assets](todo/TODO-214-pwa-manifest-icons-favicon.md) | P2 | S | TODO-210 |
| TODO-215 | [Service worker: offline app shell, versioned by the build stamp, with an "update available" pill](todo/TODO-215-service-worker-offline-shell.md) | P2 | M | TODO-210, TODO-214 |
| TODO-216 | [Destructive actions: two-tap / undo for card and script deletes, un-hide for "Not for me"](todo/TODO-216-destructive-actions-confirm-undo-unhide.md) | P2 | M | TODO-207 |
| TODO-217 | [Motion & paint: static mascot under reduced-motion, drop per-chip backdrop-filter and the noise overlay on phones, `content-visibility` on Browse rows](todo/TODO-217-motion-and-paint-performance.md) | P2 | S | — |
| TODO-218 | [Loading skeleton, empty-deck CTA that goes somewhere, first-run sign-in nudge, backup nag on the home screen](todo/TODO-218-loading-skeleton-empty-deck-cta-signin-nudge-backup-nag.md) | P2 | M | — |
| TODO-219 | [Layout polish: Write prompt prominence, Scripts mode row wrap, Kana chip-bar density, canvas height clamp, tooltips into the UI](todo/TODO-219-layout-polish-write-scripts-kana-canvas-drill.md) | P2 | M | TODO-203 |
| TODO-220 | [Information architecture: a 5-item primary nav (Study · Kana · Grammar · Practice · More), student-facing names, Act-grouped section chips](todo/TODO-220-information-architecture-tab-set-and-sections.md) | P2 | L | TODO-203, TODO-204, TODO-206 |
| TODO-221 | [Modularization step 1: move the data blocks (SEED, SCRIPT_SEED, FREQ_SEED, CONJ_*, INPUT_CATALOG/FEED_SOURCES, kana tables, SECTION_MAP) into `src/data/*.js`](todo/TODO-221-modularization-step1-data-modules.md) | P1 | S | TODO-211, TODO-212 |
| TODO-222 | [Modularization step 2: pure libraries (`merge`, `conjugate`, `input-engine`, `kana`, `schedule`, `fsrs`) + port `test-input-engine.mjs` to real imports + `node --test`](todo/TODO-222-modularization-step2-pure-libs-and-import-tests.md) | P1 | M | TODO-221 |
| TODO-223 | [Modularization step 3: DOM-touching singletons become modules with explicit `install()` (`storage`, `sync`, `auth`, `tts`, `days`, `video-index`, `ui-bus`)](todo/TODO-223-modularization-step3-dom-singletons-install.md) | P1 | M | TODO-212, TODO-222 |
| TODO-224 | [Modularization step 4: `src/main.jsx` + `src/app/App.jsx` + `src/styles.css`, wrapped in an `ErrorBoundary` (+ StrictMode in dev)](todo/TODO-224-modularization-step4-main-app-styles-errorboundary.md) | P1 | S | TODO-223 |
| TODO-225 | [Modularization step 5: one file per tab (`src/tabs/*.jsx`) and shared components (`Mascot`, `SpeakBtn`, `Furigana`, `Bi`, `SubNav`)](todo/TODO-225-modularization-step5-tabs-and-components-to-files.md) | P2 | M | TODO-224 |
| TODO-226 | [Modularization step 6: de-duplicate — `useSession()` hook, `<WritingPad/>`, `collectBackup()`, `loadJSON()`, `<SessionSummary/>`, think-timer hook](todo/TODO-226-modularization-step6-dedupe-session-pad-backup-loadjson.md) | P2 | L | TODO-225, TODO-229 |
| TODO-227 | [Modularization steps 7+8: extract `applyReview()` from `recordResult` and `smartPool()` from Study; share the feed list between app and Worker](todo/TODO-227-modularization-step7-8-applyreview-smartpool-shared-feeds.md) | P2 | M | TODO-222, TODO-229 |
| TODO-228 | [Tidiness: delete verified-dead code, stale comments, unused CSS (with a reusable audit script), legacy `/.netlify/functions/*` client paths](todo/TODO-228-dead-code-stale-comments-css-audit-legacy-endpoints.md) | P2 | M | — |
| TODO-229 | [Tests (node:test): sync merges, seed merge, scheduling helpers, session composition, day/streak maths, input engine port](todo/TODO-229-tests-pure-domain-merge-seed-schedule-session-days.md) | P1 | M | TODO-222 |
| TODO-230 | [Tests (node:test): `conjugate()` table (the 33 negatives + euphonic pasts + irregulars) and kana helpers (`kanaToRomaji`, `canonR`, `fillMatch`, kana tables)](todo/TODO-230-tests-conjugate-and-kana-tables.md) | P2 | S | TODO-222 |
| TODO-231 | [Tests for the Cloudflare Worker: export the helpers, `node:test` with an in-memory KV stub (optionally `@cloudflare/vitest-pool-workers`)](todo/TODO-231-tests-worker-node-test-memkv.md) | P1 | M | TODO-211 |
| TODO-232 | [Build smoke test, bundle assertions and a `check-invariants.mjs` (storage-key registry, merge-rule coverage, SEED duplicate keys, SEED_VERSION bump)](todo/TODO-232-build-smoke-bundle-assertions-invariants.md) | P1 | S | TODO-211, TODO-221 |
| TODO-233 | [One Playwright happy path (load → Smart Review → grade → reload → progress persists; Browse backup downloads)](todo/TODO-233-playwright-happy-path.md) | P2 | M | TODO-211, TODO-213 |
| TODO-234 | [README.md (what/where/how) and a LICENSE decision](todo/TODO-234-readme-and-license.md) | P1 | S | TODO-211 |
| TODO-235 | [ARCHITECTURE.md and DATA-SCHEMA.md (promote the commit-log design journal into files)](todo/TODO-235-architecture-and-data-schema-docs.md) | P2 | M | TODO-221 |
| TODO-236 | [CONTRIBUTING.md (dev setup & conventions), `.env.example` + `cf/.dev.vars.example`, CLAUDE.md](todo/TODO-236-contributing-dev-setup-env-example-claude-md.md) | P1 | S | TODO-211 |
| TODO-237 | [RUNBOOK.md (deploy/rollback, secrets, quotas, incidents, logs) + nightly KV backup (cron + `tools/kv-backup.mjs`)](todo/TODO-237-runbook-and-kv-backup.md) | P1 | M | TODO-213 |
| TODO-238 | [`/api/health`, Worker observability (`[observability]` + warn on swallowed errors), client error beacon to `/api/log`](todo/TODO-238-api-health-worker-observability-client-error-beacon.md) | P2 | S | TODO-210, TODO-224, TODO-231 |

---

*Generated from the item headers in `todo/`; if you add or re-prioritise an item, edit its header and regenerate this table (each item's first line is `# TODO-NNN — Title`, followed by the `**Priority:** … **Effort:** …` and `**Depends on:** …` lines).*
