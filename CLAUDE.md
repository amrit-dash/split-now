# Split Now — working notes for contributors and agents

Mobile-first PWA for splitting bills and settling up over UPI. React 19 + Vite 8 + Tailwind v4 on the
client, Firebase (Firestore, Auth, Storage, Cloud Functions in asia-south1) behind a `Repo` interface,
with a localStorage "demo mode" that must keep working for every feature. `docs/PLAN.md` is the
product and architecture source of truth (data model §4.2, security §4.3, performance §4.6, glossary §8).

## Commands
- `npm run dev` — Vite on :5173. With no `.env.local` it runs in demo mode (seeded groups, data in localStorage). The data layer is picked at **build time** (`#repo-impl` in `vite.config.ts`): Firebase when `VITE_FIREBASE_API_KEY/PROJECT_ID/APP_ID` are set for the mode, else demo. `vite --mode e2e` is always demo.
- `npm run lint` / `npm run lint:fix` — Biome lint (`biome.json`). Errors fail CI; warnings are the backlog.
- `npm run format` / `npm run format:check` — Biome formatter (single quotes, no semicolons, 2 spaces, 160 cols). `npm run check` runs lint + format together.
- `npm run typecheck` — `tsc -b` for the app and `shared/`. `npm run typecheck:all` adds tests, configs, scripts, e2e (`tsconfig.tooling.json`) and `functions/`.
- `npm test` — Vitest unit tests next to the code (`src/lib`, `src/data`, `shared`, `functions/src/lib`); about 10 s, no emulators. `npm run test:watch` while working.
- `npm run test:coverage` — the same suite with v8 coverage and thresholds (`vitest.coverage.config.ts`; `@vitest/coverage-v8` is a dev dependency).
- `npm run test:rules` — Firestore + Storage security rules under the emulators (`tests/`). Needs Java 21. About a minute. In a container with an HTTPS proxy: `HTTPS_PROXY= https_proxy= npm run test:rules` (the Storage rules runtime fetches Firestore documents over plain HTTP).
- `npm run test:functions` — builds `functions/` and exercises the capture webhook and the admin callables in the emulators (`functions/test/`).
- `npm run test:e2e` — Playwright smoke suite in demo mode (`e2e/`, `playwright.config.ts`). Locally: `npx playwright install chromium` once; where a Chromium for another Playwright version is preinstalled, `E2E_CHROMIUM=/opt/pw-browsers/chromium npx playwright test` instead. `E2E_PORT=5175` if 5174 is busy.
- `npm run test:all` — lint, typecheck:all, unit, rules, functions (what CI runs, minus e2e).
- `npm run icons` — regenerate every PNG icon from `public/favicon.svg` (`scripts/generate-icons.mjs`; `ICON_BG='#rrggbb'` overrides the maskable field). Run it after any change to the SVG; the design itself is the owner's call.
- `npm run build` — typecheck + production build into `dist/`; `npx vite build --mode e2e` builds the demo variant. `npm run deploy` is production (`deploy:hosting`, `deploy:functions`, `deploy:rules` for one piece at a time).
- Node >= 22.12 (Vitest 5 needs it); Cloud Functions run on Node 22.

## Where things live
- `src/lib/` — pure logic, one `x.test.ts` beside every `x.ts`. New logic goes here, not in pages or hooks. No Firebase imports (`src/lib/push.ts`, `capture-settings.ts` and `flags.ts` load the SDK lazily and only in firebase mode; keep that pattern).
- `src/data/repo.ts` — the only data interface; its comments are the contract (what waits for the server, what is fire-and-forget, `SnapMeta` on every watcher). `firebaseRepo.ts` and `localRepo.ts` implement it; every repo method must work in both. `store.ts` is the shared, refcounted live-query store every hook reads from; `index.ts` + `impl.firebase.ts` / `impl.local.ts` are the build-time alias.
- `src/hooks/` — `auth`, `data` (the live hooks, over the store with `useSyncExternalStore`), `groupData` (the all-groups view, computed once), `useInbox`, `useAppConfig` (`useFlag`, maintenance, blocked), `useAiStatus` (cached per sign-in), `useMerchants`, `useOnline`, OCR. Pages read data through hooks, never through `repo.watch*` directly.
- `src/pages/` — screens; `src/pages/settings/*` (Preferences, Notifications, Automation, Ai, Data, Admin redirect) under `Settings.tsx`; `src/pages/admin/*` (Overview, FlagsApp, Limits, AdminAi, Users, `api.ts`) under `Admin.tsx`.
- `src/features/expense-form/` — the expense form's cards, sheets and editor; its state machine is `src/lib/expense-draft.ts` (tested), the UI only dispatches.
- `src/components/` — UI primitives (`Sheet`, `ConfirmSheet`, `MoneyInput`, `Segmented`, `Switch`, `Collapsible`, `Skeleton`, `Toast`, `OfflinePill`), `charts/` (hand-rolled SVG `Donut`, `AreaChart`, `Bars`; no charting dependency), `Layout`, `CreateSheet`, `QuickAdd`, `RemindActions`, the settings-area components.
- `src/routes.ts` — the lazy `import()` map, `routeKey(pathname)` and the prefetchers; `App.tsx` builds `lazy()` screens from it. Add a route in both.
- `shared/` — code imported by both the app and `functions/` (`sms-parse`, `capture-filters`, `trips`, `balances-core`, `money-core`, `ai-config`, `limits`, `budget`). Pure: no Firebase, no DOM, no `@/types` (match documents structurally). `functions/build.mjs` bundles them; `functions/tsconfig.json` lists them (tsc follows imports anyway).
- `functions/` — Cloud Functions: `capture` webhook, Firestore triggers, schedules (`reminders`, `fx`), callables (`ai`, `nudge`, `admin`), `lib/` pure helpers with tests, `lib/limits.ts` (admin-tunable limits and `flagOn()`), `lib/seal.ts` (key encryption). Its own `package.json` and lockfile.
- `firestore.rules`, `storage.rules` — tested in `tests/`. Every new collection, field, size cap or flag that rules check gets a case there and a line in `docs/PLAN.md` §4.2.
- `e2e/` — Playwright smoke tests; `tests/` — rules tests; `functions/test/` — emulator tests.
- `docs/` — `PLAN.md`, `FIREBASE_SETUP.md` (deploy, secrets, admin console), `AUTO_CAPTURE.md`, `RESEARCH.md`, `REQUESTS-2026-10-08.md` (the owner's decision log: never undo an item there).

## Conventions
- Style: no semicolons, single quotes, 2-space indent, long lines are fine (160), trailing commas, `@/` alias for `src/`. Biome enforces it; do not hand-format around it.
- Comments explain *why*, in plain prose. Keep the existing ones when refactoring.
- Money is integer minor units (paise, cents) everywhere: `amount`, splits, settlements, budgets. Never a float in storage or arithmetic; format only at the edge with `formatMoney`. Use `MoneyInput` for every money field (string draft inside, minor units outside). Splits use largest-remainder rounding so shares always sum to the total.
- Dates are local ISO `YYYY-MM-DD` strings (`todayISO()` from `src/lib/id.ts`; never `toISOString().slice(0, 10)`); timestamps are epoch ms. Format dates with the cached `formatDate` / `formatDateTime` / `formatTime` from `src/lib/locale.ts`.
- Errors: `errText(e)` from `src/lib/errors.ts` is the one error-message mapper; use it in every catch instead of `(e as Error).message`.
- Confirmations: `useConfirm()` from `ConfirmSheet`, never `window.confirm`. Restorable actions use the Undo toast instead of a confirm.
- Live data: subscribe through the hooks in `src/hooks/data.ts`; a new live query is a new key in the store, not a new `onSnapshot` in a page. A watcher's `meta.fromCache` matters: an empty cached list is not "loaded".
- Feature switches: gate new user-facing features with `useFlag('name')` on the client and `flagOn('name')` in functions; a flag is added in `src/lib/flags.ts` `FLAG_NAMES` and `firestore.rules` `validFlags` together (a test checks they match). Rate limits the functions apply come from `config/limits` through `getLimits()`, defaults in `shared/limits.ts`.
- Writes to Firestore must stay valid under the rules' key whitelists and size caps (`docs/PLAN.md` §4.2 lists them); a new field means a rules change plus a test.
- Accessibility and touch: every control is at least 44px (or 24px with spacing), labelled (`<label htmlFor>` or `aria-label`), keyboard operable, never colour-only state (`aria-pressed`, `aria-checked`, `role="radio"` plus text or icon), `inputMode` on numeric fields, `type="button"` inside forms. Text that is just "muted" uses the `text-muted` token (not `text-slate-400`). One `h1` per screen; `usePageTitle()` from `src/lib/brand.ts` on every page.
- Copy: plain English, no jargon, no exclamation marks. Glossary (`docs/PLAN.md` §8): "Add expense" (not create), "Record a payment" / "Settle up", "Split by items" (the itemised split), "Live table" (the QR shared bill), "Captured payment" (an SMS/share capture), "Capture key" (never "token"), "Scan" (OCR/AI reading of a photo), "Needs your OK" (approval; pill "Needs OK"), "Flagged" (dispute), "Quick add" (the natural-language line), "Remind" (the share sheet with the Pay me link and card), "Pay me link" (the deep link into a prefilled Settle up), "Nudge" (the push).
- No new runtime dependencies without a reason written in the PR: charts are hand-rolled, fonts are self-hosted, `re2js` is stubbed; check the per-chunk gzip effect with `npx vite build`.
- Tests: add a unit test for every pure function you add or change; a rules test for every rules change; keep `data-testid`s that `e2e/` uses (`home-greeting`, `home-net`, `nav-create`, `create-expense`, `demo-name`, `demo-start`, `card-footer`, `group-create`, ...). Prefer roles and testids over copy in e2e selectors. The repo has no DOM test runner; put every decision a component makes into a tested pure function.
- Demo mode is what the e2e suite runs against, so a feature is not done until `localRepo` supports it too (a server-only feature answers with a toast or a plain card there).
- Never commit `.env.local`, `dist/`, `functions/lib/`, `*.tsbuildinfo`, `*-debug.log`, `playwright-report/`, `test-results/` (all gitignored). `.env.production` holds the public Firebase keys on purpose; a debug App Check token never goes there.

## Before opening a PR
`npm run lint && npm run typecheck:all && npm test` locally; `npm run test:rules` when rules changed. CI (`.github/workflows/ci.yml`) runs four jobs: lint + typecheck, unit, rules + functions under the emulators, build + e2e. One concern per PR; say what changes for the person using the app, and update `docs/PLAN.md` when a status marker, collection or field changes.
