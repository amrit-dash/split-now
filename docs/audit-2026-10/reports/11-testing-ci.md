# 11 — Testing, CI and developer tooling

Repo: `/home/user/split-it` @ `7be583c` (branch `claude/codebase-audit-optimization-k2uyfs`). Container: Node 22.22.0, npm 10.9.4, OpenJDK 21.0.12.1, TypeScript 7.0.2 (native), Vite 8.3.3, Vitest 5.0.3, firebase-tools 15.32.1.

## 1. Summary

I ran every check the repo defines (typecheck, unit tests, functions typecheck, Firestore + Storage rules tests under the emulator), audited dependencies, and read `ci.yml`, both tsconfigs, the three Vitest configs, `firestore.rules`/`storage.rules` against `tests/`, `functions/`, `scripts/`, `package.json` and the docs. **Everything that exists is green: 574 unit tests (33 files, 3.7 s), 151 rules tests (11 files, 52 s), 0 type errors in the two project tsconfigs, a single React copy, no peer conflicts.** The problems are what is *missing* and what is *invisible*: the CI workflow has never executed (it is not on the remote default branch; GitHub reports 0 workflows, 0 runs, 0 PRs for 48 commits of work); 14 type errors sit in test/config files that no tsconfig includes, so `npm run typecheck` cannot see them; there is no linter or formatter at all, and TypeScript 7 (no JS compiler API) rules out `typescript-eslint`, so the fix has to be Biome/oxlint rather than ESLint; there are no component or end-to-end tests despite 78 `data-testid` hooks already in the UI; the `engines` field (`>=20`) is wrong for Vitest 5 (needs 22.12+); the Storage `receipts/` rules have zero tests; and the hand-rolled QR encoder that produces UPI payment codes has no tests. Verdict: solid test substrate, no safety net around it. Every finding below comes with a drop-in config or diff.

## 2. Measured results

| Check | Command | Result |
|---|---|---|
| App + shared typecheck | `npx tsc -b` | **pass**, 0 errors, 1.9 s wall (TS 7 native). Writes `tsconfig.tsbuildinfo` (gitignored) even with `noEmit`. |
| Unit tests | `npx vitest run` | **33 files / 574 tests passed**, 3.69 s (transform 49 %, tests 25 %). Vitest prints: "transforming modules took 2.26 s … persist transforms across runs with `fsModuleCache: true`". Vite prints two `configLoader: 'native'` warnings for `vite.config.ts` (`__dirname` at 12:41; extension-less import at 8:33). |
| Functions typecheck | `cd functions && npx tsc --noEmit -p .` | **pass**, 0 errors, 1.0 s. |
| Rules tests | `npx firebase emulators:exec --only firestore,storage --project demo-splitit "npx vitest run --config vitest.rules.config.ts"` | **11 files / 151 tests passed**, 52.2 s test time, 1 m 07 s wall including first-time download of `cloud-firestore-emulator-v1.22.0.jar` (137 MB) and `cloud-storage-rules-runtime-v1.1.3.jar` (53 MB) into `~/.cache/firebase/emulators` (181 MB). Warnings: 5× "Port … available on 127.0.0.1 but not ::1" (no `host` in `firebase.json`), and one spurious "Unexpected rules runtime error: Picked up JAVA_TOOL_OPTIONS…" (the storage runtime echoing stderr; harmless). Wrote `firestore-debug.log` into the repo root (gitignored; I removed the one my run created). |
| Functions emulator tests | `npm run test:functions` | **not run** (writes `functions/lib/`; nested double `emulators:exec`). 7 tests in `functions/test/capture.emulator.test.ts`. |
| Java | `java -version` | OpenJDK 21.0.12.1 available. firebase-tools hard-codes `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21` (`node_modules/firebase-tools/lib/emulator/…`). |
| `npm outdated` (root) | | only `firebase 12.19.0 → 13.0.0` (major). |
| `npm outdated` (functions) | | only `@types/node 22.20.5 → 26.6.4` (root already has 26; runtime is Node 22, see L7). |
| `npm audit --omit=dev` (root) | | **4 high**, all one chain: `firebase@12.19.0 → @firebase/firestore@4.17.2 → @grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4). See M6: not in the browser bundle, and firebase 13.0.0 still pins `~1.9.0`. |
| `npm audit` (root, incl. dev) | | 17 (5 moderate, 12 high), the rest all under `firebase-tools` (uuid/gaxios etc.). Not shipped. |
| `npm audit --omit=dev` (functions) | | 2 moderate: `uuid <11.1.1` via `gaxios 6.4.0–6.7.1` (GHSA-w5hq-g745-h8pq). `npm audit fix` resolves it. |
| `npm ls` | | one `react@19.3.0`, one `react-dom@19.3.0`; no invalid/missing peers. Two "extraneous" entries are sharp's optional WASM fallback. |
| Playwright | | `@playwright/test` **not installed**. `/opt/pw-browsers` holds `chromium-1194` (Chromium 141.0.7390.37) which is the revision bundled by **`@playwright/test@1.56.1`** (checked `browsers.json` in playwright-core 1.54–1.64; 1.57+ wants r1200+). |
| Hidden type errors | `tsc` over files no tsconfig includes | **14 errors** in 3 files (H2). |
| Stricter flags (CLI override on `tsconfig.json`) | | `verbatimModuleSyntax` 0 · `noImplicitOverride` 0 · `noPropertyAccessFromIndexSignature` 91 · `exactOptionalPropertyTypes` 125 · `noUncheckedIndexedAccess` 399. |

## 3. Findings

### HIGH

#### H1. The CI workflow has never run — 48 commits of work are unverified by GitHub [Certain]

- `.github/workflows/ci.yml` exists locally (added in `73270aa`, touched in `641f70c`) but `origin/main` is a single "Initial commit" (`f706765`). `git rev-list --count HEAD...origin/main` = 48 ahead / 0 behind.
- `gh api repos/amrit-dash/split-it/actions/workflows` → `total_count: 0`; `…/actions/runs` → `0`; `…/pulls?state=all` → `[]`; `…/contents/.github?ref=main` → 404.
- `on.push.branches: [main]` means pushes to feature branches never trigger it, and no PR has ever been opened, so `pull_request` never fired either. GitHub only lists/registers workflows from the default branch.

Why it matters: every green result in this report was obtained by me, in a container. Nothing has ever gated a merge; the deploy path (`npm run deploy` from a laptop) has no check in front of it.

Fix:
1. Open a PR from this branch (or `claude/splitwise-replica-planning-v7w2hw`, same SHA) into `main`; the `pull_request` trigger will register and run the workflow on that PR.
2. After merge, enable branch protection on `main`: require status check `check` (and `emulator-tests`, `e2e` once added per M1/H4), require PR, no force-push.
3. Adopt the rewritten workflow in M1 (`concurrency`, `permissions`, `timeout-minutes`, caching, lint, artefact, preview).

#### H2. 14 type errors are invisible to `npm run typecheck` because test/config files are in no tsconfig [Certain]

Root `tsconfig.json` has `"include": ["src", "shared"]`; `functions/tsconfig.json` has `"exclude": ["**/*.test.ts"]`. So none of `tests/**`, `functions/test/**`, `functions/src/**/*.test.ts`, `vite.config.ts`, `vitest.functions.config.ts`, `vitest.rules.config.ts`, `scripts/vite-tesseract.ts` is ever type-checked. Vitest strips types without checking, so the suites pass while the types lie. Running `tsc` over exactly those files (scratchpad tsconfig, same options as root plus `types: ["node"]`) yields:

```
functions/src/lib/capture-settings.test.ts(39,25): TS2739 '{ capturePaused; minAmount; ignoreWords }' is missing properties from 'CaptureFilterPrefs': aiSms, aiImages
  … same at (40,25) (41,25) (44,25) (45,25) (46,25)
tests/firestore.import.test.ts(48,38): TS2739 'firebase.default.firestore.Firestore' (compat, from rules-unit-testing) is not the modular 'Firestore' the helper is typed with
  … same at (59,23) (66,23)
tests/storage.avatars.test.ts(25,26): TS2739 'UploadTask' is missing [Symbol.toStringTag], finally — assertSucceeds() wants a Promise
  … same at (26,23) (27,23) (28,23) (29,23)
```

The first group is real drift: `shared/capture-filters.ts:16-29` added `aiSms`/`aiImages` to `CaptureFilterPrefs` (required, see `DEFAULT_FILTERS`), and `filterReason(f: CaptureFilterPrefs, …)` at `:92` now receives objects missing them. It works only because `filterReason` happens not to read those two keys.

Fix (three code edits + one config):

```diff
--- functions/src/lib/capture-settings.test.ts
-    const f = { capturePaused: false, minAmount: 10000, ignoreWords: [] }
+    const f = { ...DEFAULT_FILTERS, minAmount: 10000 }
-    expect(filterReason({ capturePaused: false, minAmount: 0, ignoreWords: ['mutual fund'] }, parse(sip), sip)).toBe('ignored')
+    expect(filterReason({ ...DEFAULT_FILTERS, ignoreWords: ['mutual fund'] }, parse(sip), sip)).toBe('ignored')
     (same for the 'chaiwala' and 'rent' lines; import DEFAULT_FILTERS next to filterReason)
```

```diff
--- tests/firestore.import.test.ts
-import { doc, writeBatch, type Firestore } from 'firebase/firestore'
+import { doc, writeBatch } from 'firebase/firestore'
+type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>
-async function createGroup(db: Firestore) {
+async function createGroup(db: Db) {
```

```diff
--- tests/storage.avatars.test.ts
-const jpeg = (n = 1024) => new Uint8Array(n)
+const jpeg = (n = 1024) => new Uint8Array(n)
+/** UploadTask is thenable but not a Promise; adopt it so assertSucceeds/assertFails type-check. */
+const put = (uid: string | undefined, path: string, bytes = jpeg(), contentType = 'image/jpeg') =>
+  Promise.resolve(st(uid).ref(path).put(bytes, { contentType }))
-    await assertSucceeds(st('alice').ref('avatars/alice/a.jpg').put(jpeg(), { contentType: 'image/jpeg' }))
+    await assertSucceeds(put('alice', 'avatars/alice/a.jpg'))
     (same for the other four put() calls)
```

New `tsconfig.tooling.json` (repo root):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node", "vite/client"], "noEmit": true },
  "include": [
    "tests", "functions/test", "functions/src/**/*.test.ts", "e2e", "scripts",
    "vite.config.ts", "vitest.functions.config.ts", "vitest.rules.config.ts", "playwright.config.ts"
  ]
}
```

```diff
--- package.json
-    "typecheck": "tsc -b",
+    "typecheck": "tsc -b && tsc -p tsconfig.tooling.json",
```

(`tsc -b` cannot take two non-composite projects; chaining is simplest. `functions/tsconfig.json` can keep excluding tests — they are now covered from the root.)

#### H3. No linter or formatter; TypeScript 7 blocks the usual ESLint stack, so use Biome [Certain on the TS 7 constraint; config rule names verified against Biome 2.5.15's published schema]

Absent: `eslint.config.*`, `.eslintrc*`, `biome.json*`, `.prettierrc*`, `.editorconfig`, husky/lint-staged, a `lint` script, any mention of linting in README/docs/CI. The code is consistently single-quote/no-semicolon/~140-col, but only by hand.

Key constraint: `typescript@7.0.2` ships only the native binary (`node_modules/typescript/lib/` = `tsc.js`, `getExePath.js`, `version.cjs`; `require('typescript').createProgram` is `undefined`; the package exposes only `unstable/*` APIs). `typescript-eslint@8.71.1` declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"` and needs the JS compiler API, so **ESLint + typescript-eslint cannot parse this repo** without installing `typescript@6` alongside (two compilers, aliasing hacks). Biome and oxlint have their own parsers and do not touch the TS API, which makes Biome the pragmatic choice: one binary for lint + format + import sorting, React-hooks rules included.

What matters for React 19 hooks (all present in Biome 2.5.15's `configuration_schema.json`, group `correctness`): `useExhaustiveDependencies`, `useHookAtTopLevel`, `noReactPropAssignments`, `useJsxKeyInIterable`; plus `noUnusedImports`, `noUnusedVariables`, `noUnusedFunctionParameters` (correctness), `noArrayIndexKey`, `noExplicitAny` (suspicious), `useImportType` (style). The schema also has a `react` entry under `domains`. The React-Compiler-era rules (`set-state-in-effect`, `refs`, `purity`, `immutability`) exist only in `eslint-plugin-react-hooks@7`; if you want those later, the path is oxlint's JS-plugin host or ESLint with a side-by-side `typescript@6` — revisit when typescript-eslint supports TS 7 [Guessing on timing].

Drop-in `biome.json` (matches the repo's existing style; start hooks rules at `warn` for the first pass, then flip to `error`):

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/dist", "!**/dev-dist", "!functions/lib", "!public/**", "!**/*.tsbuildinfo"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 140 },
  "javascript": {
    "formatter": { "quoteStyle": "single", "jsxQuoteStyle": "double", "semicolons": "asNeeded", "trailingCommas": "all", "arrowParentheses": "always" }
  },
  "linter": {
    "enabled": true,
    "domains": { "react": "recommended", "test": "recommended" },
    "rules": {
      "recommended": true,
      "correctness": {
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error",
        "noReactPropAssignments": "error",
        "useJsxKeyInIterable": "error",
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "noUnusedFunctionParameters": "warn"
      },
      "suspicious": { "noExplicitAny": "warn", "noArrayIndexKey": "warn" },
      "style": { "useImportType": "error", "noNonNullAssertion": "off" }
    }
  },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

```diff
--- package.json (devDependencies / scripts)
+    "@biomejs/biome": "2.5.15",
+    "lint": "biome check .",
+    "lint:fix": "biome check --write .",
+    "format": "biome format --write .",
```

Expect a first run to flag real `useExhaustiveDependencies` cases (e.g. `src/App.tsx:53` `[user, nav]` while the effect also reads `toast`/`takeStashedCapture`; `:56`/`:59`/`:68` depend on `[user]` only). Triage those rather than blanket-disabling: that rule is the one React 19 bug class a linter actually catches. Add `.editorconfig` (2-space, LF, final newline) so editors agree with Biome. Alternative if you prefer the Vite/Rolldown family: `oxlint` 1.87 has `react-hooks/rules-of-hooks` and `exhaustive-deps` [Likely], but no formatter you'd want to adopt yet, so you would still add Biome or Prettier for formatting.

#### H4. No component or end-to-end tests; 78 `data-testid`s have no automated consumer [Certain]

`grep -rn data-testid src | wc -l` = 78 (`home-net`, `nav-create`, `upi-card`, `inbox-add`, `import-file`, `table-code`, …), but nothing under `src/`, `tests/` or `functions/` renders a component or drives a browser; `@testing-library/*`, `jsdom`, `happy-dom`, `@playwright/test` are all absent from `node_modules`. The riskiest flows (sign-in → group → expense → settle → scan) are only ever exercised by hand.

Recommendation: a Playwright smoke suite against **demo mode** (no Firebase, `localStorage` repo), run on every PR. Demo mode is what `vite` serves when `VITE_FIREBASE_API_KEY/PROJECT_ID/APP_ID` are empty (`src/data/index.ts:33`), and `.env.production` is only read in production mode, so a `--mode e2e` server plus explicit empty env vars (process env beats `.env*` files in Vite) guarantees the suite never touches `split-it-prod` even if a developer has `.env.local`.

Install: `npm i -D @playwright/test@1.56.1` (pins to the Chromium r1194 already in `/opt/pw-browsers`; locally `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test` needs no download; CI runs `npx playwright install --with-deps chromium`). Add `"test:e2e": "playwright test"` and `e2e` to `tsconfig.tooling.json` (H2).

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'android-chromium', use: { ...devices['Pixel 7'] } }],   // mobile-first app: test it mobile-first
  webServer: {
    command: 'npx vite --mode e2e --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Force demo mode even if .env.local exists (process env wins over .env files in Vite).
    env: { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_USE_EMULATORS: 'false' },
  },
})
```

`e2e/smoke.spec.ts` (selectors taken from the current markup; the two marked `// verify` are my reading of the page, run once and adjust):

```ts
import { expect, test, type Page } from '@playwright/test'

async function signInDemo(page: Page, name = 'Asha') {
  await page.goto('/')
  await page.getByPlaceholder('Your name').fill(name)                         // src/pages/Login.tsx:50
  await page.getByRole('button', { name: 'Start exploring' }).click()          // Login.tsx:52
  await expect(page.getByTestId('home-greeting')).toBeVisible()               // Home.tsx
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await signInDemo(page)
  ;(page as any).__errors = errors
})

test.afterEach(async ({ page }) => {
  expect((page as any).__errors, 'no uncaught page errors').toEqual([])
})

test('demo sign-in shows the seeded groups', async ({ page }) => {
  await page.goto('/groups')
  await expect(page.getByText('Goa Trip')).toBeVisible()                      // src/data/seed.ts:23
  await expect(page.getByText('Indiranagar Flat')).toBeVisible()              // seed.ts:35
})

test('create a trip group', async ({ page }) => {
  await page.goto('/groups/new')
  await page.getByRole('button', { name: /Trip$/ }).click()                   // GroupForm.tsx:243 chip "✈️ Trip"
  await page.locator('#group-name').fill('Manali 2026')                       // GroupForm.tsx:233
  await page.getByPlaceholder('Name').fill('Dev')                             // GroupForm.tsx:358
  await page.getByPlaceholder('Name').press('Enter')
  await page.getByRole('button', { name: 'Create group' }).click()            // GroupForm.tsx:369
  await expect(page).toHaveURL(/\/groups\/[^/]+$/)                            // verify: post-save navigation target
  await expect(page.getByText('Manali 2026')).toBeVisible()
})

test('add an expense to the Goa trip', async ({ page }) => {
  await page.goto('/add?group=g_goa')                                         // ExpenseForm.tsx:45 reads ?group=
  await page.getByLabel('Description').fill('Dinner at Thalassa')             // ExpenseForm.tsx:358
  await page.getByPlaceholder('0.00').first().fill('1200')                    // ExpenseForm.tsx:384 (amount has no label; see note)
  await page.getByRole('button', { name: 'Add expense' }).click()             // ExpenseForm.tsx:497
  await expect(page).toHaveURL(/\/groups\/g_goa/)
  await expect(page.getByText('Dinner at Thalassa')).toBeVisible()
})

test('settle up records a payment', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByRole('link', { name: 'Settle up' }).click()                  // GroupDetail.tsx:123
  await expect(page).toHaveURL(/\/settle/)
  const record = page.getByRole('button', { name: /^Record/ })                // SettleUp.tsx:207
  await expect(record).toBeEnabled()                                          // verify: default from/to/amount in demo
  await record.click()
  await expect(page).not.toHaveURL(/\/settle/)
})

test('scan page loads', async ({ page }) => {
  await page.goto('/scan')
  await expect(page.getByText('Snap a receipt')).toBeVisible()                // Scan.tsx:126
})
```

Small UI additions that make the suite robust (one line each): `data-testid="demo-signin"` on the Login button, `aria-label="Amount"` on `ExpenseForm.tsx:383` (today the only handle is `placeholder="0.00"`, shared with the FX-rate and budget inputs), `data-testid="settle-record"` on `SettleUp.tsx:207`. CI job in M1. Keep it to these five tests: they catch the "blank screen after deploy" class of failure, which is what a PWA with a service worker and lazy routes is most exposed to.

### MEDIUM

#### M1. `ci.yml` gaps: wrong `engines`, no caching for functions or emulator jars, no lint, no artefact, no preview, no hygiene keys [Certain]

Observed in `.github/workflows/ci.yml` and `package.json`:
- `engines.node: ">=20"` (root) is false: `vitest@5.0.3` declares `"node": "^22.12.0 || ^24.0.0 || >=26.0.0"`, `vite@8.3.3` and `@vitejs/plugin-react@6.1.2` declare `^20.19.0 || >=22.12.0`, `vite-plugin-pwa@2.0.0` `>=20.19.0`. `functions/package.json` says `"node": "22"`; CI uses `node-version: 22`. No `.nvmrc`.
- `setup-node` `cache: npm` only keys on `package-lock.json`; `functions/package-lock.json` is not in `cache-dependency-path`, so `npm ci --prefix functions` is uncached.
- No cache for `~/.cache/firebase/emulators` → every run downloads 181 MB of jars (measured).
- No `permissions:` (defaults to write-all on older repos), no `timeout-minutes`, no `concurrency` (stacked pushes all run to completion), no path filters.
- No lint step (H3), no `dist` artefact (so a failed deploy can't be compared to what CI built), no preview channel for PRs, no deploy at all (production goes out via `npm run deploy` from a laptop).
- Serial single job: rules (52 s + JVM start) and functions emulator tests block the build even for a docs change.
- `test:functions` runs `emulators:exec --only firestore` *nested inside* `emulators:exec --only functions`: two JVM/CLI start-ups. `firebase emulators:exec --only firestore,functions …` should work in one [Guessing why it was nested; try it].
- README says `test:rules` "needs Java 11+"; firebase-tools 15 refuses below 21 (`MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21`).

Replacement workflow (assumes H2/H3/H4 scripts exist; drop the jobs you don't adopt):

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: |
            package-lock.json
            functions/package-lock.json
      - run: npm ci
      - run: npm ci --prefix functions
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist, retention-days: 7, if-no-files-found: error }

  emulator-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: |
            package-lock.json
            functions/package-lock.json
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - uses: actions/cache@v4
        with:
          path: ~/.cache/firebase/emulators
          key: firebase-emulators-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npm ci
      - run: npm ci --prefix functions
      - run: npm run test:rules
      - run: npm run test:functions

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report, retention-days: 7 }

  preview:
    # same-repo PRs only: forks must not receive the service-account secret
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    needs: [check]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read, pull-requests: write, checks: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_SPLIT_IT_PROD }}
          projectId: split-it-prod
          target: now
          channelId: pr-${{ github.event.pull_request.number }}
          expires: 7d
```

Supporting edits:

```diff
--- package.json
-  "engines": { "node": ">=20" }
+  "engines": { "node": ">=22.12" },
+  "packageManager": "npm@10.9.4"
--- .nvmrc (new)
+22
--- README.md
-| `npm run test:rules` | Firestore security-rule tests against the emulator (needs Java 11+) |
+| `npm run test:rules` | Firestore + Storage rule tests against the emulator (needs Java 21+) |
--- firebase.json (emulators; silences the ::1 warnings in containers/CI)
     "firestore": { "port": 8080 },
+    "firestore": { "host": "127.0.0.1", "port": 8080 },
     (same for auth, storage, functions)
```

Preview deploys use the `dist` built with `.env.production`, i.e. the real `split-it-prod` backend; the preview hostname (`split-now--pr-N-xxxx.web.app`) must be added to Firebase Auth → Authorised domains for Google sign-in to work there, and App Check in monitor mode will just log it. Put this under Open questions if you'd rather have previews hit a separate project.

#### M2. Storage `receipts/{groupId}/{fileName}` rules have zero tests — the only match block without any [Certain]

`storage.rules:13-19` gates receipts on `firestore.get(/groups/$(groupId)).data.memberUids` (cross-service), size `< 10 MiB`, `contentType image/*`, `create`/`delete` only (no `update`). `tests/storage.avatars.test.ts` (2 tests) covers only `avatars/`. Every Firestore block (25 of them) is touched by at least one test file; this is the lone gap, and it is the one that depends on a cross-service lookup, which is exactly the kind of thing that silently breaks when the group document shape changes (`memberUids`).

New `tests/storage.receipts.test.ts` (same harness as the avatars file; needs `--only firestore,storage`, which `test:rules` already does):

```ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'groups/g1'), { memberUids: ['alice', 'bob'], members: {}, createdBy: 'alice' }))
})

const img = (n = 1024) => new Uint8Array(n)
const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
const put = (uid: string | undefined, path: string, bytes = img(), contentType = 'image/jpeg') =>
  Promise.resolve(st(uid).ref(path).put(bytes, { contentType }))
const seed = (path: string) => env.withSecurityRulesDisabled(async (ctx) => { await ctx.storage().ref(path).put(img(), { contentType: 'image/jpeg' }) })

describe('receipts/{groupId}', () => {
  it('only members upload, images only, under 10 MB, into an existing group', async () => {
    await assertSucceeds(put('alice', 'receipts/g1/r.jpg'))
    await assertFails(put('carol', 'receipts/g1/r2.jpg'))                       // not in memberUids
    await assertFails(put(undefined, 'receipts/g1/r3.jpg'))                     // signed out
    await assertFails(put('alice', 'receipts/g1/r.pdf', img(), 'application/pdf'))
    await assertFails(put('alice', 'receipts/g1/big.jpg', img(10 * 1024 * 1024)))
    await assertFails(put('alice', 'receipts/missing/r.jpg'))                   // firestore.get on a missing group
  })
  it('members read and delete; outsiders cannot; overwrite is not allowed', async () => {
    await seed('receipts/g1/r.jpg')
    await assertSucceeds(st('bob').ref('receipts/g1/r.jpg').getMetadata())
    await assertFails(st('carol').ref('receipts/g1/r.jpg').getMetadata())
    await assertFails(put('alice', 'receipts/g1/r.jpg'))                        // rules allow create/delete, not update
    await assertFails(st('carol').ref('receipts/g1/r.jpg').delete())
    await assertSucceeds(st('bob').ref('receipts/g1/r.jpg').delete())
  })
  it('nothing outside receipts/ and avatars/ is reachable', async () => {
    await assertFails(put('alice', 'other/g1/x.jpg'))
    await assertFails(st('alice').ref('other/g1/x.jpg').getMetadata())
  })
})
```

[Likely] that the Storage emulator resolves `firestore.get` against the Firestore emulator in the same `emulators:exec` — it has since firebase-tools 11; if the "missing group" case errors rather than denies, `assertFails` still passes.

#### M3. No coverage configuration or thresholds; the UPI QR encoder and the push module are untested [Certain]

`vite.config.ts` `test` block has no `coverage`; `@vitest/coverage-v8` is not installed, so coverage has never been measured. Modules in `src/lib` with no sibling test: `qr.ts` (250 lines — a hand-written ISO 18004 byte-mode encoder, versions 1–10, level M; it draws the QR that someone's UPI app scans to pay the exact amount), `push.ts` (156), `pending.ts` (27), `ai.ts` (51), `chartPalette.ts` (37), `ocr.ts` (22), `share.ts` (20), `theme.ts` (19), `id.ts` (16), `appcheck.ts` (22). (`simplify.ts` *is* covered via `balances.test.ts:27-34`.) In `functions/src`, every `lib/*` module is unit-tested; the handlers (`ai.ts` 244 lines, `capture.ts` 194, `fx.ts` 84, `triggers.ts`, `reminders.ts`, `push.ts`) are only exercised by the 7 emulator tests for `capture`.

Fix (coverage):

```diff
--- package.json
+    "@vitest/coverage-v8": "5.0.3",            // must equal the vitest version exactly (peer "5.0.3")
+    "test:coverage": "vitest run --coverage",
--- vite.config.ts
-  test: { environment: 'node', include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'functions/src/**/*.test.ts'] },
+  test: {
+    environment: 'node',
+    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'functions/src/**/*.test.ts'],
+    fsModuleCache: true,                       // Vitest's own hint: 2.3 s of the 3.7 s run is re-transforming
+    coverage: {
+      provider: 'v8',
+      include: ['src/lib/**', 'src/data/localRepo.ts', 'shared/**', 'functions/src/lib/**'],
+      exclude: ['**/*.test.ts'],
+      reporter: ['text-summary', 'lcov'],
+      // Run once, read the summary, then set each number ~5 points below the measured value so the
+      // gate catches regressions without blocking the first merge.
+      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
+    },
+  },
```

Fix (QR): `npm i -D jsqr@1.4.0` and `src/lib/qr.test.ts` that rasterises `encodeQr()` and round-trips it through a real decoder — this is the only test that proves the matrix is scannable, as opposed to internally consistent:

```ts
import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { encodeQr, qrPath } from './qr'

/** Blow the module matrix up to RGBA pixels (scale px per module, quiet zone of `margin` modules). */
function rasterise(q: ReturnType<typeof encodeQr>, scale = 4, margin = 4) {
  const w = (q.size + margin * 2) * scale
  const data = new Uint8ClampedArray(w * w * 4).fill(255)
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    if (!q.modules[y][x]) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + margin) * scale + dy) * w + (x + margin) * scale + dx) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }
  return { data, width: w }
}

describe('encodeQr', () => {
  it.each([
    'upi://pay?pa=rohan@okaxis&pn=Rohan&am=1234.50&cu=INR&tn=Goa%20trip',   // the real payload (SettleUp)
    'https://split-now.web.app/t/AB12CD34',                                 // table share link
    'x'.repeat(213),                                                        // documented maximum (version 10, level M)
  ])('round-trips %s through a real decoder', (text) => {
    const { data, width } = rasterise(encodeQr(text))
    expect(jsQR(data, width, width)?.data).toBe(text)
  })
  it('picks the smallest version that fits', () => {
    expect(encodeQr('a').size).toBe(21)                 // version 1
    expect(encodeQr('x'.repeat(213)).size).toBe(57)     // version 10
  })
  it('is deterministic and qrPath only emits dark modules', () => {
    const q = encodeQr('upi://pay?pa=a@b')
    expect(qrPath(q)).toBe(qrPath(encodeQr('upi://pay?pa=a@b')))
    expect((qrPath(q).match(/M/g) ?? []).length).toBe(q.modules.flat().filter(Boolean).length)
  })
})
```

(Check `QrMatrix.modules` is the field name at `qr.ts:13-16` and how the encoder behaves at 214 bytes, then pin that too.)

#### M4. Rules-test depth is thin around comments, settlements, activity and profiles [Likely — based on test *descriptions*, not every body]

Counts per block from `tests/`: comments 3 cases (`firestore.rules.test.ts:121,128,138`, `trust.test.ts:123`), settlements 3 (`hardening:195`, `trust:140,148`), activity one `describe` each in `trust:58` and `capture-settings:80`, profiles 4 (`rules:183`, `hardening:100,111,133,167`). Against `firestore.rules:374-456` the assertions I could not find by name:

- comments (`:385-388`): a *member who is not the author* deleting a comment while the expense still exists must fail (the `existsAfter` branch is tested only in the positive direction); `authorName` non-string and `text.size() > 2000` rejections.
- settlements (`:401-406`): update by a member who is not `createdBy` must fail (`validAuthor()` on update); `from == to` must fail; `amount` as a float must fail.
- activity (`:429-433`): `update` must fail for everyone (`allow update: if false`); `delete` by the group creator while the group still exists must fail; `delete` by a non-creator in the same batch as a group delete must fail.
- profiles (`:450-453`): a non-creator member deleting another member's profile must fail; the creator deleting a member's profile while the member is still in `memberUids` succeeds (that is the intended "remove member" path — assert it).
- tables (`:457-523`): a write after `expiresAt` must fail (`isLive`).

Each is a 2–3 line `assertFails`/`assertSucceeds`; add them to the existing files next to the positive cases.

#### M5. No `CLAUDE.md` / `CONTRIBUTING.md`; README has stale tooling facts [Certain]

Nothing tells a new contributor (human or agent) the commands, the invariants or the no-gos; the README's script table says `npm test` covers "splits, balances, simplification, OCR parsing, capture parsing and SMS-setup helpers" (it covers 33 files incl. FX, import, recurrence, activity, statement, table, trust) and "Java 11+" (21). Draft `CLAUDE.md` (also serves as CONTRIBUTING):

```markdown
# Split Now — working notes for contributors and agents

## Commands
- `npm run dev` — Vite on :5173 in demo mode (no `.env.local` → localStorage repo, seeded groups).
- `npm run lint` / `npm run lint:fix` — Biome (lint + format + import order). Run before committing.
- `npm run typecheck` — `tsc -b` (app, shared) + `tsconfig.tooling.json` (tests, configs, scripts, e2e).
- `npm test` — Vitest unit tests (src/lib, shared, functions/src/lib). ~4 s. `npm run test:coverage` for thresholds.
- `npm run test:rules` — Firestore + Storage rules under the emulator. Needs Java 21. ~1 min.
- `npm run test:functions` — builds functions/ and hits the capture webhook in the emulators.
- `npm run test:e2e` — Playwright smoke suite against the dev server in demo mode.
- `npm run build` — typecheck + Vite build; `npm run deploy` — build + `firebase deploy` (prod!). CI builds `dist` and deploys PR previews.
- Node ≥ 22.12 (`.nvmrc`). Functions run on Node 22.

## Layout and rules of the road
- `src/lib` is pure logic with the test next to the file (`x.ts` ↔ `x.test.ts`). Put new logic here, not in pages.
- `src/data/repo.ts` is the only data interface; `firebaseRepo.ts` and `localRepo.ts` implement it. Demo mode must keep working for every feature (it is what the E2E suite runs against).
- `shared/` is imported by both the app and `functions/` (`functions/tsconfig.json` lists the files; `functions/build.mjs` bundles them). Change it with both consumers in mind; it has its own tests.
- Money is integer minor units (paise). Never a float in an `amount`.
- Firestore writes must satisfy `firestore.rules`; every new collection or field that rules check gets a case in `tests/`.
- UI: mobile-first, Tailwind v4, lucide icons, `data-testid` on anything a test needs to find.
- Don't commit `.env.local`, `dist/`, `functions/lib/`, `*.tsbuildinfo`, `*-debug.log` (all gitignored).

## Before opening a PR
`npm run lint && npm run typecheck && npm test` locally; CI also runs rules, functions and e2e. Keep PRs to one concern; describe the user-visible change.
```

#### M6. `npm audit` output: what is real and what is noise [Certain on the chain; Certain that the browser build excludes grpc]

- Root prod: 4 high, all `@grpc/grpc-js@1.9.16` under `@firebase/firestore@4.17.2`. `@firebase/firestore`'s `exports["."].browser` → `dist/index.esm.js`, and only `dist/index.node.mjs` references `@grpc/grpc-js` (grep). Vite resolves the `browser` condition, so **grpc is not in the shipped bundle**; the advisories concern the grpc *server* and auth-context APIs anyway. `firebase@13.0.0` → `@firebase/firestore@4.18.0` still declares `"@grpc/grpc-js": "~1.9.0"` (`npm view`), so the upgrade would not clear it. Do not add a bare `npm audit` gate to CI; if you want one, use `npm audit --omit=dev --audit-level=critical` or an allowlist (`better-npm-audit`/`audit-ci` with GHSA ids).
- Functions prod: `uuid <11.1.1` via `gaxios` — `cd functions && npm audit fix` (non-breaking).
- Dev tree: 17 under `firebase-tools` — not shipped; they go away as firebase-tools updates (Dependabot, L6).

### LOW

#### L1. `vite.config.ts` triggers two native-loader deprecation warnings [Certain]

```diff
-import { tesseractAssets } from './scripts/vite-tesseract'
+import { tesseractAssets } from './scripts/vite-tesseract.ts'
-  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
+  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
```

Vite prints the warning on every `vitest`/`vite` start; the native config loader is slated to become the default in a future Vite major.

#### L2. tsconfig strictness: two flags are free, three are not [Certain]

Measured with CLI overrides on the real `tsconfig.json`: `verbatimModuleSyntax` **0 errors** and `noImplicitOverride` **0 errors** — enable both now (`verbatimModuleSyntax` is what TS 7 wants in place of `isolatedModules`, and it guarantees `import type` hygiene that Biome's `useImportType` will otherwise police). `noPropertyAccessFromIndexSignature` 91, `exactOptionalPropertyTypes` 125 (mostly `shared/sms-parse.ts` returning `vpa: string | undefined` into optional fields), `noUncheckedIndexedAccess` 399 — not worth a flag-day; if you want the last one, apply it per-file with `// @ts-check`-style pragmas in new modules only, or skip.

```diff
--- tsconfig.json and functions/tsconfig.json
     "isolatedModules": true,
+    "verbatimModuleSyntax": true,
+    "noImplicitOverride": true,
```

#### L3. `package.json` scripts: missing `lint`, `format`, `test:e2e`, `test:coverage`, `test:all`; `deploy` is all-or-nothing [Certain]

Add the scripts from H3/H4/M3 plus `"test:all": "npm run lint && npm run typecheck && npm test && npm run test:rules && npm run test:functions"`. Split deploy: `"deploy:hosting": "npm run build && firebase deploy --only hosting"`, `"deploy:functions": "firebase deploy --only functions"`, `"deploy:rules": "firebase deploy --only firestore:rules,storage"` — today `npm run deploy` pushes hosting (both targets), functions, Firestore rules/indexes and Storage rules in one go from a developer machine with no check in front (H1).

#### L4. `firebase.json` duplicates the entire hosting block for the two targets (`main`, `now`) [Certain]

Lines 2–115: identical `public`/`ignore`/`rewrites`/`headers` twice. A header or rewrite edited in one and not the other is a silent prod divergence. JSON cannot share, so either generate `firebase.json` from a small script (`scripts/firebase-config.mjs` writing both targets from one object, run in `predeploy`), or drop the legacy `main` site now that `split-now.web.app` is canonical (README says "Formerly Split It") — product-owner call, see Open questions.

#### L5. Emulator and build artefacts land in the repo root [Certain, no action beyond awareness]

`npm run test:rules` writes `firestore-debug.log` (and `storage-debug.log`) at the root; `tsc -b` under TS 7 writes `tsconfig.tsbuildinfo` even with `noEmit`. Both are in `.gitignore`. If you want the log out of the tree: `firebase emulators:exec … --log-verbosity QUIET` or run from `--config` in a temp dir; not worth it.

#### L6. No Dependabot/Renovate [Certain]

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      minor-and-patch: { update-types: [minor, patch] }
      firebase: { patterns: ["firebase", "firebase-tools", "@firebase/*"] }
  - package-ecosystem: npm
    directory: /functions
    schedule: { interval: weekly }
    groups:
      minor-and-patch: { update-types: [minor, patch] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

#### L7. `@types/node` is 26.x at the root while the runtime and functions are Node 22 [Certain]

Root `devDependencies["@types/node"]: "^26.6.4"`, functions `^22.20.5`, `engines` 22. Types for Node 26 let code compile against APIs Node 22 lacks (and `npm outdated` nags functions to 26). Pin the root to `@types/node@^22` to match the runtime; bump both together when the runtime moves.

#### L8. Notes on the pinned majors (for the record)

- **React 19.3 / @types/react 19.3 / recharts 3.10 / react-router 7.18 / lucide 1.52**: peer ranges all satisfied, one React copy. React Compiler is not enabled (`@vitejs/plugin-react@6` lists `babel-plugin-react-compiler` / `oxc-transform-react` as optional peers) — fine, but if you turn it on, the hook-rules linter (H3) becomes mandatory, not optional.
- **Vite 8.3 (Rolldown)**: works; only L1's loader warnings. `vite-plugin-pwa@2.0.0` peers `vite ^8` and `workbox-build ^7.4.1` (installed 7.4.1).
- **TypeScript 7.0.2 (native)**: no JS API (H3); `baseUrl` removed (repo doesn't use it); `tsc -b` ≈ 2 s. Tools that need the TS API (typescript-eslint, ts-morph, `vite-plugin-checker` in `typescript` mode) will not work; `tsc`-shelling tools do.
- **Vitest 5.0.3**: Node ≥ 22.12 (M1); coverage provider must be the identical version (M3).
- **tesseract.js 7**: self-hosted worker/core via `scripts/vite-tesseract.ts` (owned by the build/perf agent).
- **firebase 12.19**: 13.0.0 is out; no reason to rush (M6). **firebase-tools 15.32**: JDK 21 minimum.

## 4. Already good (leave alone)

- 574 unit tests run in 3.7 s, colocated with the modules they test; `shared/` code is tested once and consumed by both app and functions; every `functions/src/lib/*` module has unit tests and the webhook has an emulator test.
- Rules tests are broad: all 25 Firestore `match` blocks are exercised, including the hard paths (batch join + invite + profile, trash/restore/purge, approvals/disputes, bulk import of 449 docs, capture tokens/inbox, tables with anonymous guests, FX locking).
- `tsconfig` already has `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`; functions mirror it.
- Functions are bundled with esbuild (`functions/build.mjs`) with `packages: 'external'` and an empty `gcp-build`, which is the right way to ship `../shared` to Cloud Build.
- CI already installs Java and runs rules + functions tests, which is more than most Firebase repos do; it just needs to actually run (H1) and be restructured (M1).
- 78 `data-testid`s already exist; the E2E suite in H4 needs only three more.
- Dependencies are tidy: one React, no peer warnings, only one outdated prod package.

## 5. Open questions for the product owner

1. **Preview deploys**: should PR previews hit `split-it-prod` (needs preview hostnames in Auth authorised domains) or a separate `split-it-staging` project (needs a second service account and `.env.staging`)? M1's workflow assumes prod.
2. **Legacy `main` hosting target** (`split-it-prod.web.app`): keep serving it (then fix the duplication in L4) or retire it in favour of `split-now`?
3. **Branching**: is `main` meant to be the integration branch (then H1 is urgent and branch protection should go on now), or has work deliberately lived on `claude/*` branches with `main` frozen at "Initial commit"?
4. **Linter choice**: Biome (H3) now, or wait for an ESLint stack that supports TS 7 so the React-Compiler lint rules are available? The former can be adopted in an afternoon; the latter has no date.
