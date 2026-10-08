# Track E handoff: requests to other tracks

Context: `biome.json` is in place; `npm run lint` (= `biome lint .`) fails only on error-level rules. Everything below is what stands between the repo and a green `npm run lint` + `npm run typecheck:all`, plus a few optional test hooks. Each item is a one- or two-line change in a file you own.

## B (functions, shared, rules)

1. **functions/src/lib/capture-settings.test.ts** — 6 type errors (TS2739: `CaptureFilterPrefs` now requires `aiSms`/`aiImages`). Only visible under `npm run typecheck:all` (tsconfig.tooling.json). Fix: import `DEFAULT_FILTERS` next to `filterReason` and spread it:
   ```ts
   import { DEFAULT_FILTERS, filterReason } from '../../../shared/capture-filters'
   // line ~39
   const f = { ...DEFAULT_FILTERS, minAmount: 10000 }
   // lines ~44-46
   filterReason({ ...DEFAULT_FILTERS, ignoreWords: ['mutual fund'] }, parse(sip), sip)
   filterReason({ ...DEFAULT_FILTERS, ignoreWords: ['chaiwala'] }, parse(chai))
   filterReason({ ...DEFAULT_FILTERS, ignoreWords: ['rent'] }, parse(chai), chai)
   ```
2. **functions/src/ai.ts:192 and :228** — `let models` with no type or initialiser (Biome `noImplicitAnyLet`, error). Fix: `let models: ReturnType<typeof usefulModels>` (or whatever `usefulModels` returns).
3. **shared/sms-parse.ts:345** — `[^]` inside `DEBIT_RE` (Biome `noEmptyCharacterClassInRegex`, error). `[^]` means "any character" in JS; `[\s\S]` is the exact equivalent and reads as intended: replace `(?:(?!due|statement|bill|limit|[.;])[^])*?` with `(?:(?!due|statement|bill|limit|[.;])[\s\S])*?`. The sms-parse tests cover this regex.
4. **storage.rules** — `tests/storage.receipts.test.ts` (new, mine) encodes the planned contract for `receipts/{groupId}/{file}`:
   - create only by a uid in `groups/{groupId}.memberUids` (Firestore lookup), signed-out and non-members denied, a group that does not exist denied;
   - `contentType` in `image/(jpeg|png|webp|heic|heif)`: `image/jpeg`, `image/png`, `image/webp`, `image/heic` must succeed; `image/svg+xml`, `image/gif`, `application/pdf`, `text/plain` must fail (one `it()` holds the svg/gif case so it fails in isolation if the whitelist is not there yet);
   - size `< 10 MiB` (10 MiB - 1 succeeds, exactly 10 MiB fails);
   - read and delete by members only; **no `update`** (a second `put` to an existing path must fail);
   - nothing outside `receipts/` and `avatars/` is reachable.
   It runs under the existing `npm run test:rules` (`--only firestore,storage`). I did not start the emulators; the lead runs it.

## A1 (lib)

5. **src/lib/table.test.ts:128** — assignment inside an expression (Biome `noAssignInExpressions`, error). Pull the assignment out onto its own statement.

## C1 (expense form, settle up)

6. **src/pages/ExpenseForm.tsx:369** — `aria-label="Past descriptions"` on a plain `<div data-testid="desc-suggestions">` (Biome `useAriaPropsSupportedByRole`, error): a generic div has no role, so the label is ignored by AT anyway. Add `role="group"` to that div (keeps the label meaningful) or move the label to a visually-hidden heading.
7. **src/pages/SettleUp.tsx:152** — `<span aria-label={cur}>` around the currency symbol (same rule). Either `role="img"` on the span, or drop it and label the amount input instead (`aria-label={`Amount in ${cur}`}`), which the next item wants anyway.
8. Optional test hooks (the smoke suite works without them, but they make it sturdier against copy changes): `aria-label="Amount"` on the ExpenseForm amount input (today the only handle is `placeholder="0.00"`; `e2e/smoke.spec.ts` already prefers `getByLabel('Amount')` when present), and `data-testid="settle-record"` on the SettleUp "Record …" button (the test uses the `/^Record/` button name).
9. The smoke suite submits via `getByRole('button', { name: /^(Save|Add expense)$/ }).first()`, fills `getByRole('textbox', { name: 'Description', exact: true })`, and expects `/groups/:id` after save with the description visible. Keep those (any accessible name containing exactly "Save" or "Add expense" works).

## C2 (shell, home, groups, insights)

10. **src/lib/insights.ts:68** — a function/variable named `valueOf` shadows the global (Biome `noShadowRestrictedNames`, error). Rename (e.g. `contribution`).
11. The smoke suite relies on: `data-testid="nav-create"` opening a `role="dialog"` that contains `data-testid="create-expense"`; one `<nav>` landmark holding links named Home / Groups / Insights / Profile; a level-1 heading on every tab page and on GroupDetail (the group name); `data-testid="home-greeting"` and `data-testid="home-net"` on Home; the Groups list showing the seeded "Goa Trip" and "Indiranagar Flat"; GroupDetail's "Settle up" link. Also a `role="radiogroup"` named "What are you creating?" with a radio whose name starts with "Group" on /groups/new, `<label for="group-name">Name</label>`, the member `placeholder="Name"` input adding on Enter, and a "Create group" button.
12. Login: the suite now uses your `data-testid="demo-name"` and `data-testid="demo-start"` (falling back to `placeholder="Your name"` and the button text). Keep them.

## A2 (build)

13. No change needed. FYI `vitest.coverage.config.ts` reuses `vite.config.ts` through `mergeConfig` and calls it with the config env when it is a function (it also accepts a plain object). `tsconfig.tooling.json` typechecks `vite.config.ts` and `scripts/*.ts` with `types: ["node", "vite/client"]` and `allowImportingTsExtensions`, so `.ts`-suffixed imports there are fine. The two native-loader warnings (`__dirname`, extension-less `./scripts/vite-tesseract` import) still print on every `vite`/`vitest` start; report 11 L1 has the two-line fix if you want it.

## C3 (settings)

14. `e2e/smoke.spec.ts` opens `/settings` and expects a level-1 heading matching /settings/i, and `/scan` with a level-1 heading matching /scan/i plus a button matching /camera/i. Keep an `<h1>` on those screens (PageHeader provides it).

## Lead

15. `@vitest/coverage-v8` is not installed; `npm run test:coverage` needs `npm i -D @vitest/coverage-v8@5.0.3` (must equal the vitest version). Thresholds in `vitest.coverage.config.ts` are a first guess (75/75/65/75); measure once and tune.
16. `biome format` would rewrite 175 files (136 in src). The formatter is configured but `format:check` is deliberately not in CI yet: run `npm run format` once after phase 1 merges, then add `npm run format:check` (or switch the CI lint step to `npm run check`) in `.github/workflows/ci.yml`. `organizeImports` is off to keep the existing semantic import grouping.
17. The CI workflow only registers once it is on the default branch; `workflow_dispatch` is enabled so it can be run by hand on any branch after that. Report 11 H1/M1 open questions (preview deploys, branch protection) are unchanged.
