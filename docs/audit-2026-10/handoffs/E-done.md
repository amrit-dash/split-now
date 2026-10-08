# Track E done: tooling, lint, type coverage, tests, CI, contributor docs

## What changed (files I own)

New
- `biome.json` — Biome 2.5.15: formatter (single quotes, no semicolons, 2 spaces, lineWidth 160, trailing commas, JSX double quotes), linter with `preset: recommended` + react/test domains; `useHookAtTopLevel`, `noUnusedImports`, `noUnusedVariables`, `useJsxKeyInIterable`, `noReactPropAssignments`, `useImportType`, `useNodejsImportProtocol` as errors; `useExhaustiveDependencies`, `useButtonType`, `useIterableCallbackReturn`, `noArrayIndexKey`, `noLabelWithoutControl` and the interactive-role a11y rules as warnings (visible, non-blocking for phase 1); `noAutofocus`, `useSemanticElements`, `noSvgWithoutTitle`, `noNonNullAssertion`, `useTemplate`, `noForEach`, `noCommaOperator`, `noParameterAssign`, `noConsole` off (deliberate repo style: autofocused amount, `role="radio"` buttons, `!` on known elements). JSON/CSS/HTML formatting and CSS/HTML linting off (Tailwind v4 at-rules; hand-shaped firebase.json; A2's inline script in index.html). `organizeImports` off to keep the semantic import grouping. `public/`, `functions/lib`, Playwright output ignored; `.gitignore` honoured via `vcs.useIgnoreFile`. Tests/e2e override: `noExplicitAny` off.
- `tsconfig.tooling.json` — extends tsconfig.json; `types: ["node", "vite/client"]`, `allowImportingTsExtensions`; covers `tests/`, `functions/test/`, `functions/src/**/*.test.ts`, `e2e/`, `scripts/`, the three vitest configs, `vite.config.ts`, `playwright.config.ts`.
- `vitest.coverage.config.ts` — `mergeConfig(vite.config.ts, coverage)`: v8 provider over `src/lib`, `src/data/localRepo.ts`, `shared`, `functions/src/lib`; text-summary + lcov; thresholds 75/75/65/75. Calls `vite.config.ts` with the config env when it is a function (A2's mode-dependent config) and accepts an object too.
- `playwright.config.ts` — testDir `e2e`, Pixel 7 Chromium, baseURL `http://127.0.0.1:5174` (`E2E_PORT` overrides), webServer `vite --mode e2e --host 127.0.0.1 --port … --strictPort` with `VITE_FIREBASE_API_KEY/PROJECT_ID/APP_ID` blanked and `VITE_USE_EMULATORS=false`, trace/screenshot on failure, `github`+`html` reporters in CI, `list` locally.
- `e2e/smoke.spec.ts` — 7 tests, every one signed in to demo mode through a `page` fixture that also fails the test on any uncaught page error: demo sign-in + seeded groups on /groups; every tab renders an h1; create a group through the "What are you creating?" radiogroup (name, one member via the Name field + Enter, Create group → /groups/:id with the group name as h1); `nav-create` opens the Create sheet (role=dialog) → `create-expense` → `/add?group=g_goa`, description + amount, Save/Add expense → back on the group with the expense listed; Settle up link → Record → back on the group; /scan h1 + Camera button; /settings h1. Selectors are testids and roles; copy regexes are loose on purpose.
- `tests/storage.receipts.test.ts` — 7 cases for `receipts/{groupId}/{file}` (member-only create/read/delete via the Firestore `memberUids` lookup, missing group denied, size < 10 MiB, contentType whitelist jpeg/png/webp/heic/heif with svg+gif/pdf/text rejected, no overwrite, cross-group isolation, nothing outside receipts/ and avatars/). The svg/gif case is its own `it()` so it fails alone until B's whitelist lands.
- `.github/dependabot.yml` — weekly npm (root, functions; minor+patch grouped, firebase grouped) and GitHub Actions.
- `CLAUDE.md` — commands, layout, conventions (money in minor units, dates, errText, useConfirm, a11y/touch rules, copy glossary, testing rules, demo-mode parity), PR checklist.

Edited
- `package.json` — scripts only (+`lint`, `lint:fix`, `format`, `format:check`, `check`, `typecheck:all`, `test:coverage`, `test:e2e`, `test:all`, `deploy:hosting`, `deploy:functions`, `deploy:rules`); `engines.node` `>=20` → `>=22.12` (Vitest 5). No dependency lines touched (verified with git diff).
- `.github/workflows/ci.yml` — four jobs: `lint-typecheck` (lint + `typecheck:all`), `unit`, `emulator-tests` (Java 21, `~/.cache/firebase/emulators` cached on the lockfile hash, `test:rules` + `test:functions`), `build-e2e` (build → `dist` artefact → `playwright install --with-deps chromium` → `test:e2e`, report uploaded on failure). Node 22, `concurrency` with cancel-in-progress, `permissions: contents: read`, per-job `timeout-minutes`, `cache-dependency-path` includes `functions/package-lock.json`, `workflow_dispatch` added so it can run on a branch by hand.
- `tests/storage.avatars.test.ts`, `tests/firestore.import.test.ts` — type fixes only (`Promise.resolve(uploadTask)` helper; `Db = ReturnType<RulesTestContext['firestore']>`), no behaviour change.
- `.gitignore` — `playwright-report/`, `test-results/`, `blob-report/`.
- `README.md` — Scripts table rewritten; new Testing and CI sections (Java 21, emulator jar cache, e2e in demo mode); nothing else touched.
- `functions/tsconfig.json`, `vitest.rules.config.ts`, `vitest.functions.config.ts`, `tsconfig.json` — unchanged (tsconfig.json's `#repo-impl` path in the working tree is A2's).

## What I verified
- `npx tsc -p tsconfig.tooling.json`: the 14 hidden errors from report 11 H2 are down to the 6 in `functions/src/lib/capture-settings.test.ts` (B's file; exact diff in E.md #1). The three storage/import test errors are fixed.
- `npx playwright test` (demo mode, Pixel 7, preinstalled Chromium at /opt/pw-browsers): 7/7 passed, three runs in a row against the live tree, including after C2's Login/Layout/CreateSheet rewrites and A2's `#repo-impl` switch. One transient 2-test failure mid-run coincided with another track's edit and did not reproduce.
- `npx vitest run --config vitest.coverage.config.ts` runs exactly the same suite as `npx vitest run` (same 799 tests, same failures at the same moment).
- `npm --prefix functions run typecheck`: clean.
- `npx biome check` on my own files (biome.json, playwright.config.ts, vitest.coverage.config.ts, tsconfig.tooling.json, e2e/, tests/storage.receipts.test.ts): clean, formatted.
- `npm run lint` on the whole repo at my finish (other tracks still editing): **9 errors, 197 warnings, 7 infos** — all errors in files other tracks own; none in mine.
  Errors by rule: `useAriaPropsSupportedByRole` 3 (ExpenseForm.tsx:369, SettleUp.tsx:152, one new in Home.tsx/Insights.tsx), `noImplicitAnyLet` 2 (functions/src/ai.ts:192, :228), `noEmptyCharacterClassInRegex` 1 (shared/sms-parse.ts:345), `noShadowRestrictedNames` 1 (src/lib/insights.ts:68 `valueOf`), `noAssignInExpressions` 1 (src/lib/table.test.ts:128), `noUnusedImports` 1 (Home.tsx or Insights.tsx, in flight).
  Files with errors: functions/src/ai.ts (2), shared/sms-parse.ts, src/lib/insights.ts, src/lib/table.test.ts, src/pages/ExpenseForm.tsx, src/pages/Home.tsx, src/pages/Insights.tsx, src/pages/SettleUp.tsx (1 each).
  Top warnings: `useButtonType` 103, `useExhaustiveDependencies` 44, `useIterableCallbackReturn` 22, `noArrayIndexKey` 12, `noLabelWithoutControl` 6, `useOptionalChain` 4.
- Formatter drift: `biome format .` would change 175 files (136 in src, 18 functions, 11 tests, 7 shared). Not applied to files I do not own.

## Repo-wide state at my finish (not mine, for the lead)
- `npx tsc -b`: failing in C3's in-flight files (`src/pages/Profile.tsx`, `src/pages/settings/common.tsx`) and one SharedArrayBuffer typing error elsewhere; it was clean at my start.
- `npx vitest run`: 5 failing (A1's `src/lib/fresh.test.ts` ×3, B's `functions/src/lib/functions.test.ts` ×2), in flight.
- `npm run test:rules` not run by me (plan rule); `tests/storage.receipts.test.ts` needs the emulators and B's contentType whitelist for its svg/gif case.

## Deliberately left out, and why
- `@vitest/coverage-v8` is not in node_modules; no installs allowed. `test:coverage` and the config are ready; install line is in CLAUDE.md, README and E.md #15.
- `format:check` is not in CI and `lint` is `biome lint`, not `biome check`, because 175 files are unformatted and a repo-wide rewrite mid-phase would collide with every track. After the final merge: `npm run format` once, then switch the CI step to `npm run check` (E.md #16).
- `organizeImports` off: the repo groups imports semantically (react, router, icons, data, hooks, lib, components); alphabetising would rewrite every file for no safety gain.
- Hook-deps and button-type rules at `warn`: 44 and 103 hits in files being rewritten by C1/C2/C3 right now; the rule stays visible and can be flipped to `error` in one line once those tracks land.
- `card-footer` is not asserted in the equal-split e2e: `SplitFooter` renders nothing for `equal` (only exact/percent/shares/adjust), so asserting it would have meant driving the split-type sheet C1 is rebuilding.
- `.nvmrc`, `.editorconfig`, `packageManager`, `verbatimModuleSyntax`/`noImplicitOverride` in tsconfig.json, firebase.json emulator `host`, the preview-deploy CI job, the `jsqr` QR round-trip test: outside my ownership list or need a dependency; all documented in report 11 for later.
- `functions/tsconfig.json` unchanged: tests are now typechecked from the root; adding stricter flags there could break B's in-flight code.

## Decisions the owner should know
- `typecheck` stays `tsc -b` (fast, what tracks run); `typecheck:all` is the CI gate and adds tests/configs/scripts/e2e + functions.
- `test:all` excludes e2e (needs browsers); CI runs e2e in its own job after the build.
- The CI workflow only registers once it reaches the default branch (report 11 H1); `workflow_dispatch` lets it be run on any branch after that. Preview deploys and branch protection remain open questions for the owner.
- Biome's `recommended: true` is deprecated in 2.5; the config uses `preset: "recommended"` (schema-verified) so it survives the next major.
