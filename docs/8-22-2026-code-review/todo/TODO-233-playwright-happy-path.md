# TODO-233 — One Playwright happy path (load → Smart Review → grade → reload → progress persists; Browse backup downloads)

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 7.2 "UI — zero", § 7.4 E2E row; 03 § How I reviewed (the manual click-through this automates)
**Depends on:** TODO-211 (scripts), TODO-213 (CI)   **Blocks:** none

## Why
Every review did the same manual click-through (Study home → Smart Review → flip → grade → done; Browse backup). One Playwright test protects the core loop against the class of regression that blanks the page or breaks grading, and runs in CI on the built `index.html` with no backend (the app degrades gracefully when `/api/*` 404s — verified by the reviewers' local runs).

## Current behaviour (verified)
- No browser tests; `cf/public/` is the deployable static folder (`index.html`, `videos.json`).
- Stable selectors exist: `.tc-tab` buttons (labels "Study", …), `.tc-smart-btn` ("🧠 Smart Review · N cards"), `.tc-card`, "Reveal answer" / "Missed it" / "Got it" buttons (`.tc-btn-miss`, `.tc-btn-got`), `.tc-done` + `.tc-bignum`, Browse `.tc-summary` stat strip, `More ⌄` button, `💾 Backup` button, `.tc-prow` rows, `.tc-prow-num` ("seen 1 · ✓ 1 (100%)").
- Local serving: `python3 -m http.server 8765` from repo root or `npx wrangler dev`; `/api/*` 404 locally (sync banner shows pending — harmless).

## Intended behaviour
`e2e/study.spec.ts` (chromium only, mobile viewport 375×812 and one desktop run) against a static server on `cf/public` started by Playwright's `webServer`. Assertions use `getByRole` where TODO-206 made semantics honest, with class fallbacks.

## Implementation steps
1. `npm i -D @playwright/test` (pin exact) and `npx playwright install chromium` (CI: `npx playwright install --with-deps chromium`).
2. `playwright.config.ts`:
   ```ts
   import { defineConfig, devices } from "@playwright/test";
   export default defineConfig({
     testDir: "e2e", timeout: 30_000, retries: process.env.CI ? 1 : 0,
     webServer: { command: "npx serve -l 8765 cf/public --single", port: 8765, reuseExistingServer: true },   // or: python3 -m http.server 8765 --directory cf/public
     use: { baseURL: "http://localhost:8765", trace: "retain-on-failure" },
     projects: [{ name: "phone", use: { ...devices["iPhone 12"], browserName: "chromium" } }, { name: "desktop", use: { viewport: { width: 1280, height: 800 } } }],
   });
   ```
   (`--single` makes unknown paths serve `index.html` like the Worker; `/api/*` still 404.)
3. `e2e/study.spec.ts`:
   ```ts
   import { test, expect } from "@playwright/test";
   test("smart review loop persists progress across reload", async ({ page }) => {
     await page.goto("/");
     await expect(page.locator(".tc-wordmark")).toContainText("単語帳");
     const smart = page.locator(".tc-smart-btn");
     await expect(smart).toBeVisible();
     const n = Number((await smart.innerText()).match(/·\s*(\d+)\s*cards/)?.[1] ?? 0);
     expect(n).toBeGreaterThan(0);
     await smart.click();
     for (let i = 0; i < 3; i++) {
       await page.getByRole("button", { name: /Reveal answer/ }).click();
       await page.getByRole("button", { name: /Got it/ }).click();
     }
     await expect(page.locator(".tc-progtext")).toContainText("3 /");
     await page.reload();
     await page.getByRole("button", { name: "Browse" }).click();   // after TODO-220: "More" then "Deck"
     await page.getByRole("button", { name: /Weakest first|By lesson/ }).click();      // sort to surface studied cards
     await expect(page.locator(".tc-prow-num", { hasText: /seen 1/ }).first()).toBeVisible();
   });
   test("backup downloads a JSON file", async ({ page }) => {
     await page.goto("/");
     await page.getByRole("button", { name: "Browse" }).click();
     await page.getByRole("button", { name: /More/ }).click();
     const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Backup/ }).click()]);
     expect(dl.suggestedFilename()).toMatch(/^tangocho-backup-\d{4}-\d{2}-\d{2}\.json$/);
     const text = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
     expect(JSON.parse(text).app).toBe("tangocho");
   });
   test("no console errors on load", async ({ page }) => {
     const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
     await page.goto("/"); await page.waitForSelector(".tc-smart-btn, .tc-hero");
     expect(errors).toEqual([]);
   });
   ```
   Adjust names after TODO-206/209/220 land (labels change); prefer `getByRole` over classes once buttons have stable names.
4. `package.json`: `"e2e": "playwright test"`; CI (TODO-213): add a job `e2e` after `test-build` that downloads the `site` artifact into `cf/public` (or rebuilds) and runs `npx playwright install --with-deps chromium && npm run e2e`; upload `playwright-report` on failure.
5. `.gitignore`: `playwright-report/`, `test-results/`.

## Data migration / compatibility
none

## Testing & verification
- `npm run build && npm run e2e` locally → 3 tests × 2 projects pass in < 60 s.
- Break grading on purpose (e.g. make `grade()` a no-op) → rebuild → test 1 fails on the `3 /` assertion; revert.
- CI job green; trace uploaded on a forced failure.

## Acceptance criteria
- [ ] `e2e/study.spec.ts` + config committed; runs locally and in CI.
- [ ] Covers: load, Smart Review, 3 grades, persistence after reload, backup download, no page errors.
- [ ] Selectors use roles/names where available.

## Pitfalls / notes
- The first load seeds 821 cards and pushes to `/api/sync` (404 locally) — fine; allow the pending banner.
- `devices["iPhone 12"]` sets a WebKit UA but we force chromium — OK for layout; don't add WebKit to CI (flaky downloads).
- Keep the suite to a handful of tests; unit tests carry the logic.
