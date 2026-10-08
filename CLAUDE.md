# Split Now — working notes for contributors and agents

Mobile-first PWA for splitting bills and settling up over UPI. React 19 + Vite 8 + Tailwind v4 on the
client, Firebase (Firestore, Auth, Storage, Cloud Functions in asia-south1) behind a `Repo` interface,
with a localStorage "demo mode" that must keep working for every feature.

## Commands
- `npm run dev` — Vite on :5173. With no `.env.local` it runs in demo mode (seeded groups, data in localStorage).
- `npm run lint` / `npm run lint:fix` — Biome lint (`biome.json`). Errors fail CI; warnings are the backlog.
- `npm run format` / `npm run format:check` — Biome formatter (single quotes, no semicolons, 2 spaces, 160 cols). `npm run check` runs lint + format together.
- `npm run typecheck` — `tsc -b` for the app and `shared/`. `npm run typecheck:all` adds tests, configs, scripts, e2e (`tsconfig.tooling.json`) and `functions/`.
- `npm test` — Vitest unit tests next to the code (`src/lib`, `shared`, `functions/src/lib`); about 5 s. `npm run test:watch` while working.
- `npm run test:coverage` — the same suite with v8 coverage and thresholds (`vitest.coverage.config.ts`). Needs `npm i -D @vitest/coverage-v8@5.0.3` once (must match the vitest version).
- `npm run test:rules` — Firestore + Storage security rules under the emulators (`tests/`). Needs Java 21. About a minute.
- `npm run test:functions` — builds `functions/` and exercises the capture webhook in the emulators (`functions/test/`).
- `npm run test:e2e` — Playwright smoke suite in demo mode (`e2e/`, `playwright.config.ts`). Locally: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test` where the browsers are preinstalled, else `npx playwright install chromium` once. `E2E_PORT=5175` if 5174 is busy.
- `npm run test:all` — lint, typecheck:all, unit, rules, functions (what CI runs, minus e2e).
- `npm run build` — typecheck + production build into `dist/`. `npm run deploy` is production (`deploy:hosting`, `deploy:functions`, `deploy:rules` for one piece at a time).
- Node >= 22.12 (Vitest 5 needs it); Cloud Functions run on Node 22.

## Where things live
- `src/lib/` — pure logic, one `x.test.ts` beside every `x.ts`. New logic goes here, not in pages or hooks. No Firebase imports.
- `src/data/repo.ts` — the only data interface. `firebaseRepo.ts` and `localRepo.ts` implement it; every repo method must work in both.
- `src/hooks/` — auth, the shared group-data store, OCR, inbox. Pages read data through hooks, never through `repo` watchers directly.
- `src/pages/`, `src/components/` — screens and UI primitives (`Sheet`, `ConfirmSheet`, `MoneyInput`, `Segmented`, `Skeleton`, `Toast`).
- `shared/` — code imported by both the app and `functions/` (SMS parser, capture filters, balances core). `functions/build.mjs` bundles it; `functions/tsconfig.json` lists the files.
- `functions/` — Cloud Functions: capture webhook, push, reminders, AI callables, FX. Its own `package.json` and lockfile.
- `firestore.rules`, `storage.rules` — tested in `tests/`. Every new collection, field or size cap that rules check gets a case there.
- `e2e/` — Playwright smoke tests; `tests/` — rules tests; `functions/test/` — emulator tests.

## Conventions
- Style: no semicolons, single quotes, 2-space indent, long lines are fine (160), trailing commas, `@/` alias for `src/`. Biome enforces it; do not hand-format around it.
- Comments explain *why*, in plain prose. Keep the existing ones when refactoring.
- Money is integer minor units (paise, cents) everywhere: `amount`, splits, settlements, budgets. Never a float in storage or arithmetic; format only at the edge with `formatMoney`. Use `MoneyInput` for every money field (string draft inside, minor units outside). Splits use largest-remainder rounding so shares always sum to the total.
- Dates are local ISO `YYYY-MM-DD` strings (`todayISO()`); timestamps are epoch ms.
- Errors: `errText(e)` from `src/lib/errors.ts` is the one error-message mapper; use it in every catch instead of `(e as Error).message`.
- Confirmations: `useConfirm()` from `ConfirmSheet`, never `window.confirm`. Restorable actions use the Undo toast instead of a confirm.
- Accessibility and touch: every control is at least 44px (or 24px with spacing), labelled (`<label htmlFor>` or `aria-label`), keyboard operable, never colour-only state (`aria-pressed`, `aria-checked`, `role="radio"` plus text or icon), `inputMode` on numeric fields, `type="button"` inside forms. Text that is just "muted" uses the `text-muted` token.
- Copy: plain English, no jargon, no exclamation marks. Glossary: "Add expense" (not create), "Record a payment" / "Settle up", "Split by items" (the itemised split), "Live table" (the QR shared bill), "Captured payment" (an SMS/share capture), "Capture key" (the token), "Scan" (OCR/AI reading of a photo), "Needs your OK" (approval), "Flagged" (dispute).
- Tests: add a unit test for every pure function you add or change; a rules test for every rules change; keep `data-testid`s that `e2e/` uses (`home-greeting`, `home-net`, `nav-create`, `create-expense`, `card-footer`, `group-create`, ...). Prefer roles and testids over copy in e2e selectors.
- Demo mode is what the e2e suite runs against, so a feature is not done until `localRepo` supports it too.
- Never commit `.env.local`, `dist/`, `functions/lib/`, `*.tsbuildinfo`, `*-debug.log`, `playwright-report/`, `test-results/` (all gitignored).

## Before opening a PR
`npm run lint && npm run typecheck:all && npm test` locally. CI (`.github/workflows/ci.yml`) runs four jobs: lint + typecheck, unit, rules + functions under the emulators, build + e2e. One concern per PR; say what changes for the person using the app.
