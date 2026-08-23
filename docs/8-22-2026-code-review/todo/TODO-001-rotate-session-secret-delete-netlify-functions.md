# TODO-001 — Rotate the committed SESSION_SECRET and delete the Netlify function bundles

**Priority:** P0   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § CRITICAL-1, LOW-11, INFO-12; 01-functionality-review § 3.1 / Appendix B step 1; 06-architecture § 8.3, F-15
**Depends on:** TODO-002 (ship the 401-recovery fix first, or in the same deploy — otherwise every device is stuck after rotation)   **Blocks:** none

## Why
The HMAC key that signs every session token is committed to the public repo in plain text: `netlify/functions/sync.mjs` line 1 contains `X="d89497a76bf1f28ee83d78cd469d40ebc3cd2b4b0fa330d3e281c5bfda7329f0"` and `netlify/functions/tts.mjs` line 1 contains `ue="d89497…329f0"`. Commit `11dee08` ("SESSION_SECRET stays the same value, so the ~2-year sessions already…") states that the live Cloudflare Worker was given this same value. The Worker's `verifySession` (`cf/src/index.js:56-70`) checks only the HMAC and `exp`, so anyone with the repo can mint a token `{sub:<any Google sub>, email:null, exp:<far future>}` and read/overwrite that user's whole progress record (`g:<sub>`), harvest the email stored in the snapshot, and trigger billable Google TTS calls. Rotation is the only thing that actually closes this; deleting the dead bundles removes the carrier; history scrubbing is hygiene.

## Current behaviour (verified)
- `netlify/functions/sync.mjs:1` — minified bundle, contains `X="d89497a76bf1f28ee83d78cd469d40ebc3cd2b4b0fa330d3e281c5bfda7329f0"` (used as `createHmac("sha256", X)`).
- `netlify/functions/tts.mjs:1` — same value as `ue="…"`.
- `git log --all -S'd89497a7…329f0'` → commits `226197d`, `230b7fc` (the value entered history in July 2026 and is still in HEAD).
- `cf/wrangler.toml:26-28`:
  ```
  # Secrets are NOT here — they go in via `wrangler secret put`, so they never land in git.
  # Required: SESSION_SECRET (must match the existing one or every device is signed out),
  # GOOGLE_TTS_API_KEY, ADMIN_WARM_TOKEN.
  ```
- `netlify.toml` 301-redirects every path (`from = "/*"` → `https://tangocho.deskbuddies.workers.dev/:splat`, `force = true`), so the Netlify functions can never execute; they are dead artifacts.
- `cf/src/index.js:19` `const SESSION_DAYS = 730;` — forged tokens would be valid for two years.
- The client has no recovery path from a 401 today (see TODO-002): `pullAndMergeCloud` (`JpnFlashcards.jsx:1172`) returns `false` silently, `pushCloudNow` (`:1136-1149`) marks pending and retries forever, and `initGoogleAuth`/`renderGoogleButton` (`:1073`, `:1088`) short-circuit while any token exists in localStorage.

## Intended behaviour
- The Worker signs and verifies sessions with a fresh 256-bit random secret that has never been in git.
- Every previously issued token (legit or forged) is rejected with 401; devices recover via TODO-002 (sign-in button reappears with "session expired" message; local progress and the pending flag are kept and pushed after re-sign-in).
- `netlify/functions/` no longer exists in the tree. `netlify.toml` stays (it is the redirect that keeps old links safe).
- The `wrangler.toml` comment no longer tells the next maintainer that the secret "must match the existing one"; it documents how to generate one and what rotation does.
- Optionally, git history no longer contains the literal (after rotation the value is worthless, so this is hygiene only).

## Implementation steps
1. **Ship TODO-002 first** (or in the same deploy). Rotating without it leaves every device showing "⚠ Not saved yet" forever with no sign-in button.
2. **Generate a fresh secret and set it on the Worker** (interactive prompt — never put the value on the command line or in a file that is committed):
   ```bash
   # generate 32 random bytes as hex; copy the output
   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
   cd /Users/dan/Code/matthew-japanese/tangocho/cf
   npx wrangler secret put SESSION_SECRET      # paste the value at the prompt
   npx wrangler secret list                    # confirm SESSION_SECRET is listed
   ```
   Setting a secret creates a new Worker version immediately; no code deploy is required for the rotation itself, but you will deploy anyway for steps 3-4.
3. **Delete the dead bundles:**
   ```bash
   cd /Users/dan/Code/matthew-japanese/tangocho
   git rm -r netlify/functions
   ```
   Keep `netlify.toml`. Confirm nothing references the directory: `grep -rn "netlify/functions" --include="*.mjs" --include="*.js" --include="*.jsx" --include="*.toml" --include="*.md" .` — the only hits should be the *URL paths* `/.netlify/functions/sync|tts|feed` in `JpnFlashcards.jsx:906, 3352, 4181` and the Worker aliases in `cf/src/index.js:365-367` (those are request paths the Worker answers, not files; leave them — retiring the aliases is a Theme C item).
4. **Fix the misleading comment** in `cf/wrangler.toml:26-28`:
   ```toml
   # Secrets are NOT here — they go in via `wrangler secret put`, so they never land in git.
   # Required: SESSION_SECRET, GOOGLE_TTS_API_KEY, ADMIN_WARM_TOKEN.
   #   SESSION_SECRET: any 32+ random bytes, e.g.
   #     node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
   #   Rotating it signs every device out once; the app shows the sign-in button again and
   #   re-pushes local progress after sign-in (see pullAndMergeCloud/pushCloudNow 401 handling).
   #   Rotate immediately if the value ever appears in a commit, log, or screenshot.
   ```
5. **Also check the other two secrets** while you are in the console (they are not known to be leaked, but `ADMIN_WARM_TOKEN` bypasses the session gate on billable TTS): if there is any doubt, `npx wrangler secret put ADMIN_WARM_TOKEN` with a new random value. The Google key is covered by TODO-014.
6. **Rebuild, commit, deploy:**
   ```bash
   cd tools && npm install && node build.mjs && cd ../cf && npx wrangler deploy
   ```
   (The build is unaffected by this change, but the deploy must include TODO-002's client code.)
7. **Optional history scrub** (do this only if you are comfortable force-pushing; coordinate with anyone who has a clone — the repo is Matthew's, with one `dev` branch):
   ```bash
   pip install git-filter-repo   # or brew install git-filter-repo
   cd /Users/dan/Code/matthew-japanese/tangocho
   printf 'd89497a76bf1f28ee83d78cd469d40ebc3cd2b4b0fa330d3e281c5bfda7329f0==>REDACTED_SESSION_SECRET\n' > /tmp/replacements.txt
   git filter-repo --replace-text /tmp/replacements.txt
   # then re-add the remote and force-push main and dev; every other clone must re-clone
   ```
   The old Google API key in `226197d` can be added to the same replacements file (it is revoked per `75c7254`, so this is cosmetic).

## Data migration / compatibility
- Every stored `jpn101:session` token becomes invalid. With TODO-002 in place, the app detects the 401 on the first pull/push, clears the token, re-renders the Google button, and keeps local data plus the `jpn101:syncPending` flag so the post-sign-in chain (`initGoogleAuth(loadCardsAndSync)` at `JpnFlashcards.jsx:1353-1355`) pushes everything. No KV data is touched.
- Cached TTS clips are keyed by text, not by user — unaffected.

## Testing & verification
- Before rotating, in a browser with a valid session: Browse tab shows "Signed in as …". After rotating and reloading: the Browse tab shows the Google sign-in button with the "session expired" message from TODO-002; study a card; sign in; Browse shows "All changes saved to your account"; reload another device and confirm the card's new `seen` count arrived.
- Forged-token check: with the *old* secret, a token built as `base64url(JSON{sub,email,exp}) + "." + base64url(HMAC-SHA256(oldSecret, body))` sent as `Authorization: Bearer …` to `GET https://tangocho.deskbuddies.workers.dev/api/sync` must now return `401 {"error":"invalid or expired session"}`. (Node snippet: `crypto.createHmac("sha256", old).update(body).digest("base64url")`.)
- `git ls-files | grep netlify` → only `netlify.toml`.
- `npx wrangler secret list` shows the three secrets.

## Acceptance criteria
- [ ] `SESSION_SECRET` on the live Worker is a value that has never been committed.
- [ ] A token signed with the leaked value is rejected with 401.
- [ ] `netlify/functions/` is gone from the tree; `netlify.toml` remains.
- [ ] `cf/wrangler.toml` comment explains generation + rotation consequences and no longer says "must match the existing one".
- [ ] Devices recover by re-signing in (TODO-002) and local progress is preserved.

## Pitfalls / notes
- Do NOT rotate before TODO-002 is deployed: today's client never re-renders the sign-in button while a (dead) token is in localStorage; the only way out would be clearing site data.
- Never paste the new secret into a commit message, issue, wrangler.toml, `.dev.vars` that is tracked, or a chat transcript. For local dev, put a throwaway value in `cf/.dev.vars` (gitignored via `.env*`? — no: add `cf/.dev.vars` to `.gitignore` explicitly; the current `.gitignore` covers `.env` and `.env.local` only).
- `netlify/functions/*.mjs` also carry the *revoked* old Google key string; deleting them removes that too.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed with the client change from TODO-002.
