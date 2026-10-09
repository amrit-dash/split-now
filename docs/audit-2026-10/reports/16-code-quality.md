# 16 · React/TypeScript code quality, component architecture, maintainability

Repo: `/home/user/split-it` @ `7be583c` (branch `claude/codebase-audit-optimization-k2uyfs`). Read-only audit; nothing in the repo was changed. `npx tsc -p tsconfig.json --noEmit` passes (exit 0).

## 1. Summary and verdict

I read every file the brief named in full (`src/pages/ExpenseForm.tsx`, `src/data/firebaseRepo.ts`, `AutoCaptureSetup.tsx`, `Table.tsx`, `GroupDetail.tsx`, `GroupForm.tsx`, `ImportGroup.tsx`, `Profile.tsx`, `SettleUp.tsx`, `Insights.tsx`, `src/components/AutoCapture.tsx`, `StatementImport.tsx`, `Trust.tsx`), then the rest of `src/` (all pages, components, hooks, `data/`, the `lib/` files that matter for boundaries), `shared/`, and the `functions/src` type surface; plus grep-based counts across the tree. **Verdict: this is a well-above-average codebase for its size** — strict TS with zero `any`, pure and unit-tested domain logic in `src/lib`, a clean `Repo` seam with two implementations, offline-first writes with a central error channel, good accessibility hygiene, and comments that explain *why*. The debt is concentrated and predictable: (a) three god files (`ExpenseForm.tsx` 880 lines / 20 `useState`s, `firebaseRepo.ts` 856 lines / 73-method interface, `AutoCaptureSetup.tsx` 529 lines), (b) **one real functional bug class** in the split editors (controlled money inputs that round-trip the parsed number, so decimals can't be typed), (c) copy-pasted UI/utility patterns (6 local date formatters next to an unused shared one, 54 `(e as Error).message` casts, 18 identical busy/try/catch blocks, 13 identical list containers, 6 `name()` helpers with 4 different fallbacks), (d) `eslint-disable react-hooks/exhaustive-deps` comments in 13 places **with no ESLint in the project**, so the rule has never run, and (e) wire-contract types hand-duplicated between `src/` and `functions/` (prefs, FX doc, webhook reason/response, AI result shapes) instead of living in `shared/`. Zero component tests exist (44 test files, all lib/functions/rules). None of this is architectural rot; it is the normal outcome of fast feature work, and the fixes are mostly mechanical extractions that the existing pure-lib discipline makes easy.

---

## 2. Findings (ranked)

Severity reflects user impact + maintenance cost. Confidence tags: [Certain] verified by reading code paths end to end; [Likely] strong reading-based inference I could not execute; [Guessing] flagged as such.

### CRITICAL

#### C1. Split editors store the parsed number as the input's display value, so multi-digit / fractional amounts cannot be typed — [Likely] (parse behaviour [Certain])

**Where:** `src/pages/ExpenseForm.tsx:647-659` (exact), `:660-679` (percent), `:680-701` (shares).

**What is wrong.** The *exact* editor renders a controlled input whose `value` is `centsToInput(input.exact[id])` and whose `onChange` writes `parseMoney(v)` (or `0`) back into state:

```tsx
// ExpenseForm.tsx:652-654
<AmountRow ... value={input.exact?.[id] !== undefined ? centsToInput(input.exact[id], group.currency) : ''}
  onChange={(v) => setInput((i) => ({ ...i, exact: { ...i.exact, [id]: Number.isFinite(parseMoney(v, group.currency)) ? parseMoney(v, group.currency) : 0 } }))} />
```

Trace typing "12.50" into an INR field: keystroke "1" → `exact=100` → re-rendered as `"1.00"` (caret at end). Keystroke "2" → DOM is `"1.002"` → `parseMoney` rejects 3 decimals (`src/lib/money.ts:68`, regex `^-?\d*(\.\d{0,2})?$`) → `NaN` → stored `0` → displayed `"0.00"`. Only single-digit whole amounts (or paste) can be entered. Percent (`:669-670`) does the same with `parseFloat`: typing `"12."` becomes `12` and the dot is eaten, so `12.5%` is unreachable. Shares (`:692`) likewise (`2.5` shares impossible). The one place this is done right is the multi-payer editor, which keeps **string** state (`payers: Record<MemberId,string>`, `:133-135`) and parses at save time.

**Why it matters.** "Exact" and "Percent" are two of the six headline split types. The seeded defaults (`seedInput`, `:837-839`) mask the problem for the equal-ish case, but any user who tries to *edit* an exact amount will think the field is broken. No component tests exist to catch it.

**Fix.** Introduce `src/components/MoneyInput.tsx` with a string-in/string-out contract and use it in every money field (15 `inputMode="decimal"` inputs across 6 files today):

```ts
export function MoneyInput({ value, onChange, currency, ...rest }: {
  value: string                      // what the user typed, verbatim
  onChange: (raw: string) => void    // parse with parseMoney(raw, currency) at the edge
  currency: string
  className?: string; placeholder?: string; 'aria-label'?: string; autoFocus?: boolean; disabled?: boolean
})
```

Then make `SplitInput` editing hold **strings** in draft state (`exactStr: Record<MemberId,string>`, `percentStr`, `sharesStr`, `adjustStr`) and convert to numbers only in the `preview`/`save` selectors (see H1 for where that selector lives). Add a Vitest + Testing Library test that types `"12.50"` keystroke-by-keystroke and asserts the stored cents (`1250`).

#### C2. `defaultValue` (uncontrolled) inputs keyed by array index in the adjust/items editors show stale values after re-seeding or deleting an item — [Likely]

**Where:** `src/pages/ExpenseForm.tsx:712-714` (adjust, `defaultValue`), `:735-740` (items, `key={idx}` + `defaultValue`).

**What is wrong.** The adjust and items editors avoided C1 by going uncontrolled, but that means React never pushes state into the DOM again. (i) Deleting item *n* (`:741`) shifts the rows up, but because `key={idx}` the DOM input for row *n* is reused and keeps the deleted item's typed amount while state holds the next item's. (ii) Switching group (`:145-155`) or split type (`:453`) re-seeds `input`, but the adjust fields keep whatever was typed before. (iii) Opening an existing itemized expense then switching to another split type and back loses the inputs' link to state.

**Fix.** Same as C1 (string draft state + controlled `MoneyInput`), plus give `ReceiptItem`s a stable `id` in draft state (`uid('it_')`) and key rows by it. The `SplitBill` page already does exactly this (`src/pages/SplitBill.tsx:21-25`, `Row { id, name, amount: string }`) — reuse that shape.

### HIGH

#### H1. `ExpenseForm.tsx` is an 880-line god component (20 `useState`s, render-phase re-seed, 3 effects, 6 inline sub-editors) — [Certain]

**Where:** `src/pages/ExpenseForm.tsx` (51.9 KB). `Form` spans `:107-532`; state hooks `:120-176`; render-phase group re-seed `:145-155`; FX effect `:178-196`; save `:249-300`; `SplitEditor` switch `:615-724`; `ItemsEditor` `:726-770`; pure helpers `seedInput`/`clean`/`buildRecurrence` `:822-871` (untested because they live in a page module).

**Why it matters.** Every split-type bug (C1/C2) is a surgery inside one function; the seeding/switch-group/suggestion rules (`seedFor`, `pickSuggestion`, the `seededFor` block) are the most intricate logic in the app and have **no unit tests** because they are closed over component state. The file also owns a group picker, a currency sheet, a category sheet, a payer sheet, FX editing and receipt scanning.

**Proposed decomposition (file names + prop contracts).** Keep the route component thin and move the *state machine* into a pure, tested reducer:

```
src/lib/expense-draft.ts                 PURE, unit-tested. Moves seedFor/seedInput/clean/buildRecurrence here.
  export interface Draft { cur; amountStr; description; category; catTouched; date; notes;
                           payers: Record<MemberId,string>; multiPay; splitType; split: SplitDraft; picked;
                           repeat; until; receipt?: File; scanned?: {parsed,file}; fx: FxRate|null }
  export type SplitDraft = { selected: MemberId[]; exact: Record<MemberId,string>; percent: Record<MemberId,string>;
                             shares: Record<MemberId,string>; adjust: Record<MemberId,string>; items: ItemDraft[] }
  export type Action = { type:'field'; key: keyof Draft; value } | { type:'switchGroup'; group; order; me; capture? }
                     | { type:'applyReceipt'; parsed; file } | { type:'pickSuggestion'; s: Suggestion; order }
                     | { type:'setSplitType'; t: SplitType; order; amount } | { type:'toggleMultiPay'; singlePayer }
  export function initialDraft(args: { group; order; me; existing?; again?; capture?; history }): Draft
  export function reduce(d: Draft, a: Action): Draft
  export function selectAmount(d, cur): number;  selectPaidBy(d, ...): Record<MemberId,Cents>
  export function selectPreview(d, order, personal, me): { splits?: Record<MemberId,Cents>; error?: string }
  export function validate(d, ...): Partial<Record<'amount'|'description'|'split'|'payers'|'fx'|'until', string>>
  export function toExpense(d, ctx: { group; existing?; user; now }): { expense: Expense; original?: OriginalAmount }

src/pages/ExpenseForm.tsx                ~80 lines: params, useGroup/useExpenses/useCaptures, Loading/NoGroups, <ExpenseEditor key=…/>
src/features/expense-form/
  ExpenseEditor.tsx                      useReducer(reduce, initialDraft) + save(); composes the cards below (~150 lines)
  useFxRate.ts                           (cur, to, date, initial?) → { fx, loading, rateEdit, setRateEdit, applyRate }  (lifts :173-197, keeps the key-guarded race check)
  useReceiptScan.ts                      ({ cur, onParsed }) → { busy, progress, pick(): void, inputProps }        (lifts :199-226)
  AmountCard.tsx                         { draft, dispatch, group, foreign, fx: ReturnType<typeof useFxRate>, scan, suggestions, onPick }
  DescriptionField.tsx                   { value, onChange(v, {touchedCategory:false}), category, onCategoryTap, placeholder }
  SuggestionChips.tsx                    { suggestions: Suggestion[]; onPick(s) }
  DateRow.tsx                            { value; onChange } (DateField + Today/Yesterday chips)
  FxLine.tsx                             (already a component, :584-613) move as-is
  PayerCard.tsx                          { group; order; me; currency; amountStr; payers; multiPay; onPayers; onMultiPay; hint: boolean; onPickPayer }
  split/SplitTypeTabs.tsx                { value: SplitType; options; onChange(t) }
  split/SplitEditor.tsx                  { type; split: SplitDraft; onChange(patch: Partial<SplitDraft>); group; order; me; currency; amount; splits? } → switch to:
  split/EqualEditor.tsx, ExactEditor.tsx, PercentEditor.tsx, SharesEditor.tsx, AdjustEditor.tsx, ItemsEditor.tsx (+ Portions.tsx)
                                         all share:  { group; order; me; currency; amount: Cents; splits?: Record<MemberId,Cents> } plus their own slice
  RecurrenceCard.tsx                     { repeat; until; date; onRepeat; onUntil; nextDate?: string }
  sheets/GroupPickerSheet.tsx            { open; onClose; groups; current; onPick }   (GroupList :539-581 moves here)
  sheets/CurrencySheet.tsx               { open; onClose; value; choices; groupCurrency; groupName; onPick }
  sheets/CategorySheet.tsx               { open; onClose; value; onPick }
  sheets/PayerSheet.tsx                  { open; onClose; group; order; me; value; onPick }
src/components/MoneyInput.tsx            see C1
src/components/MemberRow.tsx             { member: Member; isMe: boolean; size?: number; children (right slot) } — see M5
src/components/Checkbox.tsx              { checked; onChange?; size?: 'sm'|'md' } — the rounded square check drawn by hand 5× today
```

**Effort:** L (3–5 days incl. tests). The reducer extraction alone (S/M) unlocks tests for the trickiest logic and should be done first.

#### H2. `eslint-disable react-hooks/exhaustive-deps` appears 13 times but ESLint is not installed, so the rule has never run and several effects genuinely have stale deps — [Certain]

**Where:** no `eslint.config.*`/`.eslintrc*`, no `eslint` in `package.json`; disables at `src/pages/ExpenseForm.tsx:195,205`, `SettleUp.tsx:81,89,107`, `ImportGroup.tsx:84,91`, `Scan.tsx:49`, `SplitBill.tsx:84`, `Profile.tsx:84`, `components/AiSettings.tsx:52`, `CaptureAlert.tsx:31`, `AutoCapture.tsx:42`.

**Why it matters.** The comments give a false sense that deps are reviewed. Concrete stale closures: `CaptureAlert.tsx:26-31` reads `current` inside an effect keyed only on `[captures]`; `SettleUp.tsx:85-90` reads `amountTouched`/`d` with deps `[from, to, init]`; `ImportGroup.tsx:88-92` uses the odd dep `!!groups`. These are "works today" by accident.

**Fix (S).** Add `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` (v5+, which also ships the React Compiler-derived rules) with a flat config; run `eslint src shared functions/src` in `npm run typecheck`/CI. Then fix each disable by restructuring (see M1) rather than re-disabling.

#### H3. `firebaseRepo.ts` is a single 856-line closure implementing a 73-method `Repo` interface; `localRepo.ts` must mirror all 73 — [Certain]

**Where:** `src/data/repo.ts:62-238` (73 methods incl. 4 optional), `src/data/firebaseRepo.ts:171-846` (the object literal), `src/data/localRepo.ts` (demo mirror, incl. 8 AI stubs that throw/return null, `:425-434`). Boilerplate: 39× `const batch = writeBatch(db)`, 38× `fire(batch, …)`, 12× `batch.update(groupRef(…), { updatedAt: Date.now() })`.

**Why it matters.** Any new feature touches a 73-method interface and two implementations; the file mixes auth, profile, groups, expenses/trust, settlements, activity, captures/tokens/inbox, live tables, FX and AI callables. Reviewing a change to `saveExpense` means scrolling past auth redirect handling.

**Fix (M).**
1. Split the interface into domain sub-interfaces and compose: `Repo = { mode; onError; auth: AuthRepo; profile: ProfileRepo; groups: GroupRepo; expenses: ExpenseRepo; settlements; activity; captures; tables; fx; ai }`. Call sites change from `repo.saveExpense` to `repo.expenses.save` (one mechanical codemod; ~24 files import `repo`).
2. File-split `firebaseRepo.ts` into `src/data/firebase/{client.ts (init, refs, fire, cached, actCtx), auth.ts, groups.ts, expenses.ts, settlements.ts, captures.ts, tables.ts, ai.ts}` each exporting `(ctx: FirebaseCtx) => ExpenseRepo` etc.; `createFirebaseRepo` becomes 20 lines of composition.
3. Add a `write(context, fn: (b: WriteBatch) => void | Promise<void>, { touchGroup?: string })` helper to collapse the batch/fire/updatedAt triplet.
4. Make the AI section optional on the interface (`ai?: AiRepo`) so the demo repo stops stubbing eight methods with throws.

#### H4. Wire-contract types are hand-duplicated between `src/` and `functions/` instead of living in `shared/` — [Certain]

**Where (src ↔ functions):**
- `FxRatesDoc` — `src/lib/fx.ts:38-47` ↔ `functions/src/lib/fx-core.ts:22-31` (identical).
- `NotificationPrefs` + `DEFAULT_PREFS` — `src/lib/push.ts:15-24` ↔ `functions/src/lib/prefs.ts:6-26` (identical; the server comment even says "the client writes the same keys").
- `WebhookReason` — `src/lib/sms-setup.ts:12-14` ↔ `Reason` `functions/src/lib/capture-core.ts:8-17` (identical 10-member union, hand-synced).
- `WebhookOk`/`ParsedSms` — `src/lib/sms-setup.ts:16-27` ↔ `CaptureResponse`/`Parsed` `functions/src/capture.ts:40-42`, `capture-core.ts:26`.
- `StatementTxn` — `src/data/repo.ts:246-254` ↔ `AiTxn` `functions/src/lib/gemini.ts:270` (identical).
- `ParsedReceipt` — `src/lib/ocr-parse.ts:3-13` ↔ `AiReceipt` `functions/src/lib/gemini.ts:205-214` (same shape, comment says "same shape as the app's").
- `WebhookBody` (`sms-setup.ts:30-37`) ↔ `CaptureRequest` (`functions/src/lib/request.ts:9-22`): the server accepts more fields (`amount, currency, merchant, ts, ref`) than the client type knows.

`shared/` already proves the pattern works (`sms-parse.ts`, `capture-filters.ts`, `ai-config.ts` are consumed by both sides via `src/lib/*.ts` re-export shims), but `functions/tsconfig.json:16` whitelists shared files one by one, which discourages adding more.

**Why it matters.** The first time someone adds a reason code or a prefs key on one side only, the other side silently mis-renders (the client's `REASON_TEXT` lookup falls back to `Rejected: <code>`; prefs defaulting diverges).

**Fix (S/M).** Create `shared/contracts/{capture.ts, prefs.ts, fx.ts, ai.ts}` holding the types + defaults + `resolve*` functions; re-export via thin `src/lib/*.ts` shims as today; change `functions/tsconfig.json` `include` to `"../shared/**/*.ts"` (and exclude tests). Delete the copies. Add one `shared/contracts/contracts.test.ts` that type-asserts `functions` and `src` wrappers against the shared types (compile-time `satisfies`).

#### H5. No component tests at all; the UI layer (≈45 % of `src/`) is untested while `lib/` is well covered — [Certain]

**Where:** 44 test files, all `src/lib/*.test.ts`, `shared/*.test.ts`, `functions/src/lib/*.test.ts`, `tests/firestore.*.test.ts`. No `*.test.tsx`; no `@testing-library/*` or `jsdom`/`happy-dom` in `devDependencies`.

**Why it matters.** C1/C2 are exactly the class of bug that a 20-line RTL test catches. The pure-lib discipline is good, but the seams that matter most (ExpenseForm draft rules, Select keyboard handling, DateField iOS workarounds, Collapsible controlled/uncontrolled) are in `.tsx`.

**Fix (S to set up, then incremental).** Add `jsdom` + `@testing-library/react` + `@testing-library/user-event`; a `vitest.workspace.ts` with a `jsdom` project for `src/**/*.test.tsx`; a `renderWithProviders()` helper that calls `initRepo()` in demo mode (the `localRepo` already makes this cheap) and wraps `ToastProvider`/`AuthProvider`/`MemoryRouter`. First tests: `MoneyInput`, `SplitEditor` exact/percent typing, `Select` keyboard, `GroupForm` type switching + parked members.

### MEDIUM

#### M1. Derived state and prop→state sync done with `useEffect` (≈9 sites), plus one unguarded async effect race — [Certain]

**Where:**
- Prop/derived → state via effect: `Profile.tsx:84` (re-sync form from `profile`), `GroupForm.tsx:63-78` (copy `existing` into 14 states once; first paint renders an empty form in edit mode), `GroupForm.tsx:82-84` (`name` derived from `type`/`firstOther`), `SplitBill.tsx:54` (`setCur(group.currency)`), `SettleUp.tsx:85-90, 102-108` (default amount/method), `ImportGroup.tsx:74-92`, `components/AutoCapture.tsx:247` (`Filters` mirrors `prefs.minAmount`), `Avatar.tsx:6` (`setFailed(false)` on `photoURL`).
- Race: `SettleUp.tsx:93-98` — `repo.getMemberProfile(groupId, toUid).then(setPayee)` with no stale guard; switching recipient quickly lets the slower earlier response overwrite the newer payee's handles (`.catch(() => {})` also swallows errors). `AiSettings.tsx:52` and `Join.tsx:22` have the same no-cancel shape (lower impact).
- Correct patterns already in the codebase to copy: `hooks/useFx.ts:12-20` (`live` flag), `ExpenseForm.tsx:177-194` (request key guard), `ExpenseForm.tsx:145-155` and `StatementImport.tsx:89-93`, `ProfileCards.tsx:157` (render-phase "adjust state when a prop changes").

**Fix (M, spread across files).** (1) Derive instead of syncing: `GroupForm` name → `const shownName = nameTouched ? name : type === 'direct' ? firstOther : ''`; `SplitBill` currency → `const cur = group?.currency ?? curState`. (2) For one-shot "load into form" (GroupForm edit, Profile), initialise state lazily from the prop and remount with `key={existing.id}` from the parent (the way `ExpenseForm` keys `Form`). (3) For async lookups use a `useAsync(fn, deps)` hook with an abort/stale flag, or `use(promise)` with a keyed cache (see L2). (4) `SettleUp` defaults (`:67-108`) → a `useReducer` where `from`/`to` changes dispatch `'pair'` and the reducer decides whether to refill `amountStr` — removes all three disables.

#### M2. Error handling: 54 `(e as Error).message` casts, 7 `window.confirm`, 5 un-caught `await repo.*` in click handlers, toast-only feedback — [Certain]

**Where:**
- Casts: 54 occurrences across pages/components (e.g. `GroupForm.tsx:213`, `SettleUp.tsx:138`, `Inbox.tsx:73,104,188,191`). Firebase errors reach users as raw `auth/...`/`permission-denied` messages except where `Login.tsx:85-98 friendly()` and `ProfileCards.tsx:132-144 linkError()` map codes — two near-duplicate mappers.
- `window.confirm`: `Trust.tsx:211,241`, `AutoCapture.tsx:80`, `AutoCaptureSetup.tsx:74`, `ExpenseDetail.tsx:41,180`, `GroupForm.tsx:220`; meanwhile sign-out uses a styled `Sheet` (`Profile.tsx:218-226`) and soft-deletes use the undo-toast (`Trust.tsx:39-54`) — three different confirmation idioms.
- Unhandled rejections: `Capture.tsx:126-130 dismiss`, `Capture.tsx:101 onClick`, `AutoCaptureSetup.tsx:73-77 revoke`, `AutoCapture.tsx:79-83 revoke`, `GroupForm.tsx:219-224 remove`, `Friends.tsx:57-72 settleAll` (no try/catch; a rejection leaves the sheet open with no feedback).
- 18 near-identical `setBusy(true); try { await …; toast(ok); nav(…) } catch (e) { toast((e as Error).message,'err') } finally { setBusy(false) }` blocks (`ExpenseForm.tsx:267-299`, `GroupForm.tsx:189-216`, `SettleUp.tsx:131-140`, `ImportGroup.tsx:125-184`, `TableFinish.tsx:114-132,165-184`, `Join.tsx:45-55`, `Login.tsx:18-21`, …). Note the ones that `setBusy(false)` only in `catch` (ExpenseForm, SettleUp, Join) because they navigate on success — subtle and easy to get wrong.
- Inline validation exists in only three places (`ExpenseForm.tsx:462` split error, `ImportGroup.tsx:118-121,320`, `AutoCaptureSetup.tsx:440-466`); everything else is a toast on submit (142 `toast(` calls, 86 with `'err'`).

**Fix (M).** `src/lib/errors.ts`: `export function errorMessage(e: unknown, fallback = 'Something went wrong'): string` that handles `Error`, `{code}` Firebase errors (merge `friendly`/`linkError` tables here) and strings. `src/hooks/useAction.ts`: `const [run, pending] = useAction(async () => {...}, { onError?: 'toast' })` — or adopt `useActionState` (see L1). Policy: irreversible destructive → `ConfirmSheet` component (`{ open; title; body; confirmLabel; tone:'danger'; onConfirm; onClose }`); reversible → undo toast; never `window.confirm`. Replace the 5 bare awaits with `run(...)`.

#### M3. Form handling: no draft persistence or dirty guards on the heavy forms; back/X silently discards; the Scan→Add hand-off dies on reload — [Certain]

**Where:** `ExpenseForm.tsx:334` (`X` → `nav(-1)` unconditionally; no `<form>`, so Enter does nothing and Save is `onClick` on two buttons `:336,497`), `GroupForm.tsx`, `SettleUp.tsx`, `SplitBill.tsx`, `ImportGroup.tsx` (no dirty tracking); `Profile.tsx:96-100,205-213` is the only form with an "Unsaved changes" bar. `src/lib/pending.ts:4-7` is an in-memory hand-off: `/scan` → `/add` then a reload (or iOS PWA eviction) loses the parsed receipt and File. `main.tsx:20` uses `<BrowserRouter>` + `<Routes>`, so React Router 7's `useBlocker`/`useBeforeUnload` route-aware blocking is unavailable (it needs a data router).

**Why it matters.** This is a mobile PWA: the OS backgrounds and kills tabs; a half-filled expense with a scanned receipt is the most expensive thing a user types.

**Fix (M).** (1) Persist `Draft` (from H1, minus the `File`) to `sessionStorage` under `expense-draft:<groupId|new|expenseId>` on every reducer step; hydrate in `initialDraft`; clear on save/discard; show a "Resume draft?" chip when a stored draft exists and differs from the seed. (2) Park the receipt `File` in Cache Storage (`caches.open('splitit-share')` already exists for the share target, `Scan.tsx:37-50`) instead of a module variable. (3) Migrate to `createBrowserRouter` + `RouterProvider` (also replaces the hand-written `lazy()` table in `App.tsx:16-34` with `lazy` route modules) and add `useBlocker(isDirty)` → `ConfirmSheet("Discard changes?")` in ExpenseForm/GroupForm/SettleUp. (4) Wrap each form in `<form onSubmit>` so Enter submits and `disabled` double-submit protection is uniform.

Validation note: the client is the only place the "splits sum to amount / payers sum to amount" invariant is enforced (`src/lib/splits.ts`, `ExpenseForm.tsx:254-255`); `firestore.rules:308-316 validExpense` checks `amount is int && > 0` and that `paidBy`/`splits` keys are members only [Likely — grep of the rules for `splits`/`amount` shows no sum check]. That is a rules-lens finding, but from the client side it means `validate()` (H1) must stay the single source and be reused by `localRepo` too.

#### M4. Module boundaries: `src/lib` is documented as pure but 4 files break it; one page imports from another page — [Certain]

**Where:**
- `src/lib/ai.ts:1` `import { repo } from '@/data'` — the only lib→data import; `push.ts:7` and `capture-settings.ts:8` explicitly promise "never imports '@/data'" and `fx.ts` uses injection (`setFxShared`, `data/index.ts:49`). Inconsistent, and it makes `lib/ai.ts` untestable without the repo singleton.
- `src/lib/chartPalette.ts:29-37` exports a React hook (`useIsDark`) from `lib/` (imports `react`).
- `src/lib/statement.ts:2` imports a type from `@/data/repo` (`StatementTxn`) — a wire type that should live in `types.ts`/`shared/` (see H4).
- `src/components/InstallBanner.tsx:28-35` re-implements `isIOS`/`isStandalone`, which already exist in `src/lib/push.ts:45-47`; a third `isIOS` lives in `src/lib/payments.ts:150`.
- `src/pages/Groups.tsx:6` imports `Section` from `./Home` (page→page); `Inbox.tsx:201` defines a different `Section`.
- `src/pages/AutoCaptureSetup.tsx:474-529` exports `parseSmsDemo`/`maskSms`/`simulateWebhook` — a demo re-implementation of `functions/src/capture.ts` decision logic inside a *page* module.
- 24 pages/components import `repo` directly (fine for this architecture, but there is no hook layer for writes, so every write site hand-rolls busy/error handling — see M2).
- No circular imports found by inspection (`data` never imports `hooks`/`components`; `hooks` never import `components`) [Likely].

**Fix (S).** Move `useIsDark` to `src/hooks/useIsDark.ts`; inject the AI reader (`setAiRepo(repo)` in `initRepo`, mirroring `setFxShared`) or pass a `readReceiptAi` function into `readReceipt`; relocate `StatementTxn` to `shared/contracts/ai.ts`; delete the duplicate `isIOS`/`isStandalone` (keep `lib/push.ts`' versions, re-export for `payments.ts`); move `Section` to `components/Section.tsx` and `simulateWebhook`+`parseSmsDemo` to `src/lib/capture-demo.ts` (then unit-test it against the shared parser). Add an `eslint-plugin-boundaries` or `import/no-restricted-paths` rule: `src/lib/**` may not import `react`, `react-dom`, `@/data`, `@/components`, `@/hooks`, `@/pages`.

#### M5. Copy-pasted UI patterns that deserve shared components (with counts) — [Certain]

| Pattern | Count | Where (examples) | Proposed component |
|---|---|---|---|
| Date formatting via inline `toLocaleDateString(appLocale(), …)` | 17 inline + **6 local helpers** (`fmtDay`/`fmtDate`) | `GroupDetail.tsx:399`, `ExpenseDetail.tsx:225`, `ExpenseForm.tsx:873`, `ImportGroup.tsx:340`, `Inbox.tsx:20`, `StatementImport.tsx:43`, `Misc.tsx:77` | **`formatDate()` already exists** at `src/lib/locale.ts:125` and is used **once** (`Insights.tsx`). Adopt it everywhere; add `formatDateRange`. |
| Relative time | 4 implementations | `lib/activity.ts:239 fmtAgo`, `ExpenseDetail.tsx:229 fmtWhen`, `AiSettings.tsx:33 ago`, `shared/capture-filters relativeTime` | one `fmtAgo` in `lib/locale.ts` |
| List container `card divide-y divide-slate-100 overflow-hidden dark:divide-white/5` | 13 | `GroupDetail.tsx:149,168,344`, `Home.tsx:136,148`, `Groups.tsx:37,43,48`, `Join.tsx:67`, `Capture.tsx:149`, `Scan.tsx:177`, `Inbox.tsx:170`, `AutoCaptureSetup.tsx:159` | `<ListCard>` |
| Member row (Avatar + name + right slot) | ≥10 | `ExpenseForm.tsx:433-437,521-527,636-643,664-674,687-696,707-716,803-811`, `GroupDetail.tsx:153-159,170-178`, `ExpenseDetail.tsx:105-109,117-128`, `GroupForm.tsx:332-341`, `Table.tsx:295-302`, `ImportGroup.tsx:304-314` | `<MemberRow member isMe size>{right}</MemberRow>` |
| `name = (id) => id === me ? 'You' : …` with **4 different fallbacks** (`'Someone'`, `'Former member'`, `''`, `'?'`) | 6 helpers + 18 inline ternaries | `GroupDetail.tsx:53`, `ExpenseDetail.tsx:36`, `SettleUp.tsx:115`, `Trust.tsx:139,224`, `Table.tsx:155` | `memberName(group, id, meId, { lower?: boolean })` in `lib/members.ts` with one fallback string; or a `GroupContext` (see M6) |
| Hand-drawn square checkbox | 5 | `ExpenseForm.tsx:638,709`, `Table.tsx:195`, `Join.tsx:70`, `Capture.tsx:157`, `StatementImport.tsx:238-241` | `<Checkbox>` / `<RadioDot>` |
| Fixed bottom action bar | 4 | `Table.tsx:241-249`, `SplitBill.tsx:230-240`, `StatementImport.tsx:282-293`, `Profile.tsx:205-213` | `<BottomBar>` |
| Spinner idiom | 17× `Loader2 animate-spin` vs 6× `<Spinner>` | everywhere | pick one (`Spinner` with `size`) |
| Delete icon button `text-slate-400 hover:text-rose-500` | 9 | `GroupForm.tsx:339`, `ExpenseForm.tsx:741`, `Inbox.tsx:190`, … | `<IconButton tone="danger">` |
| Money `<input inputMode="decimal">` with 3 different state strategies | 15 in 6 files | see C1 | `<MoneyInput>` |
| Small duplicated components | `Section` ×2 (`Home.tsx:174`, `Inbox.tsx:201`), `Quiet` (`Inbox.tsx:213`) ≈ `Empty`, `Stat` ×2 (`ImportGroup.tsx:331`, `AdminAi.tsx:111`) ≈ `Kpi` (`Insights.tsx:241`), `Shell` ×2 (`Capture.tsx:180`, `Table.tsx:110`), `Row`/`Line`/`MockRow` key-value rows (`Scan.tsx:194`, `Table.tsx:316`, `AutoCaptureSetup.tsx:230`), `titleCase` ×2 (`ExpenseForm.tsx:877`, `SplitBill.tsx:245`) | | consolidate into `components/` and `lib/text.ts` |

**Effort:** M in total if done alongside H1 (which creates most of them anyway).

#### M6. Prop drilling of group context (`group`, `order`, `me`, `currency`, `name()`) through 2–3 levels — [Certain]

**Where:** `GroupDetail.tsx:137` passes 7 props to `ActivityList`; `Table.tsx:226` passes `color`/`name` closures to `People`; every `SplitEditor` sub-editor receives `{group, order, me, amount, splits}` (`ExpenseForm.tsx:460,615-618,722,726-728,773-775,803`). The `name`/`color` closures are recreated per render (no `useCallback`), which is harmless today only because nothing below is memoised.

**Fix (S/M).** A `GroupScope` context provided once per group screen: `{ group, me, order, currency, memberName(id), member(id) }` with `useGroupScope()`. Pairs naturally with H1 and removes ~6 props from ~12 components. (If you enable the React Compiler — see L3 — the closure-stability concern disappears regardless.)

#### M7. Data hooks: 11 copy-pasted `useState(null)+useEffect(subscribe)` hooks, duplicate listeners per screen, and a write side effect inside a read hook — [Certain]

**Where:** `src/hooks/data.ts:12-146` (`useGroups`, `useCaptures`, `useGroup`, `useExpenses`, `useAllExpenses`, `useAllSettlements`, `useActivity`, `useHistory`, `useComments`, `useSettlements`, + `useTable` in `Table.tsx:67-71`). `useExpenses` (`:61`) and `useAllGroupData` (`:211`) call `catchUpRecurring(...)` — a **write** (`repo.saveRecurringOccurrences`) — from inside snapshot callbacks. On `GroupDetail`, `useExpenses` + `useTrash→useAllExpenses` + `RecentlyDeleted→useTrash` + (from `Layout`) `useAllGroupData` all open their own `watchExpenses(groupId)` for the same group; the Firestore SDK dedupes the network listener but each callback re-runs `liveItems()` and the catch-up loop.

**Fix (M).** `useWatch<T>(subscribe: (cb) => Unsub, key: string): T | null` built on `useSyncExternalStore` with a module-level ref-counted cache keyed by `key` (so N subscribers share one snapshot and one listener); rewrite the 11 hooks as one-liners. Move `catchUpRecurring` to a single `useEffect` in `App.tsx` driven by `useAllGroupData` (one place, once per snapshot).

#### M8. Loose `Record`/string types where a discriminated union would prevent bugs — [Certain]

- `SplitInput` (`src/types.ts:84-97`) is a bag of six optional fields; `Expense.splitType` and `splitInput` can disagree, which is why `clean()` (`ExpenseForm.tsx:847-856`) and `seedInput()` exist. Proposed: `type SplitInput = { type:'equal'; selected } | { type:'exact'; exact } | { type:'percent'; percent } | { type:'shares'; shares } | { type:'adjust'; selected; adjust } | { type:'itemized'; items }` and drop the separate `splitType` field (keep a migration shim in `prepareExpenseSave` for stored docs).
- Sentinel strings: `ImportGroup.tsx:21 type Target = string` ('me' | 'new' | memberId), `TableFinish.tsx:22-23 NEW/NONE`, `SplitBill.tsx:24 NO_GROUP=''`, `Capture.source: string` with `SOURCE_LABEL[c.source] ?? c.source` (`Inbox.tsx:128`), `Settlement.method: string`. Use `type Target = { kind:'me' } | { kind:'new' } | { kind:'member'; id }` and a `CaptureSource` union.
- `TablePatch` (`repo.ts:257-267`) uses `null` as a delete sentinel inside `Record`s — document or wrap as `{ set?; delete?: Id[] }`.
- `Trust.tsx:98`: `{ …, original: expense.original } as Pick<ActivityCtx,'currency'|'memberName'>` — an `as` that hides an extra property the type doesn't declare (check whether `describeChanges` actually reads `original`; if yes, widen the type, if no, drop it).
- `ActivityEntry.before/after: Record<string, unknown>` is acceptable for a log, but `describeChange` would be safer with a `Snapshot` type derived from `Pick<Expense, …>`.
- Counts for the record: `any` = **0** (two grep hits are comments); `as unknown as` = **5** (`repo.ts:296`, `data/index.ts:39`, `localRepo.ts:144,455`, `appcheck.ts:15`) — all defensible, the `localRepo` two would vanish with typed `changedSettings`; non-null `!` = **35** across 20 files (`Home.tsx` 4, `import-splitwise.ts` 4, `Table.tsx` 3 `viewer.pid!`, `Trust.tsx` 3, …). `Table.tsx`'s three `viewer.pid!` would go away if `Viewer` were a union `{ ready:true; pid } | { ready:false; error? }`.

### LOW

#### L1. React 19 idioms that would simplify code (currently unused) — [Certain]

- **`useActionState` + `<form action>`**: replaces the 18 busy/try/catch blocks (M2) and gives Enter-to-submit for free. Fits `ExpenseEditor.save`, `GroupForm.save`, `SettleUp.save`, `ImportGroup.run`, `TableFinish`, `Join.join`, `Login`.
- **`useOptimistic`**: `TripAutoCapture.set` (`GroupDetail.tsx:410-413`), `AutoCapture.update` (`:48-52`), `NotificationSettings.toggle` (`:60-63`), `AiSettings.set` (`:60-65`) all hand-roll optimistic `setState` + fire-and-forget; `useOptimistic` expresses intent and rolls back on failure.
- **`<Activity mode="hidden">`** (React 19.2+, you are on ^19.3): `GroupDetail` tabs (`:137-186`) unmount `ActivityList`, so search/category filters reset when the user peeks at Balances; `ActivityTab`'s `useActivity`/`useTrash` re-subscribe on every return. Wrapping tab panels in `<Activity>` keeps state and defers work.
- **`use(promise)` + `Suspense`**: one-shot reads (`Join.tsx:22 getInvite`, `SettleUp.tsx:93-98 getMemberProfile`, `AiSettings.tsx:52 aiStatus`) could drop the effect+state+race handling given a small keyed promise cache.
- **`useDeferredValue`**: the expense search in `GroupDetail.tsx:301-307` and `GroupList` search (`ExpenseForm.tsx:568`) filter on every keystroke; cheap win on long groups.
- `ref` as a prop / `forwardRef`: not applicable (no `forwardRef` usage).

#### L2. `Insights.compute` and `AutoCaptureSetup.simulateWebhook` are pure functions living in page files — [Certain]

`Insights.tsx:173-235` (bucketing, category folding, top-N) and `AutoCaptureSetup.tsx:486-529` are pure but untested because of where they live. Move to `src/lib/insights.ts` and `src/lib/capture-demo.ts` and add tests (S).

#### L3. React Compiler not enabled; almost no manual memoisation — [Certain]

`vite.config.ts:13` uses `react()` without `babel-plugin-react-compiler`. The codebase has only 3 `useCallback`s (`Select.tsx`, `Toast.tsx`) and passes fresh closures everywhere; today that is fine because children are not memoised, but any future `memo()` will be defeated. Enabling the compiler (S, once H2's lint is green) makes the M6 closure concern moot.

#### L4. Minor parsing inconsistencies — [Certain]

`parseMoney` is excellent (Indian grouping, per-currency decimals), but non-money numbers use ad-hoc parsing: `parseFloat` for percent/shares (`ExpenseForm.tsx:670,692` accepts `"1e3"`), `parseInt(e.target.value) || 1` in `AdminAi.tsx:87,91`, `Number(qa)` from the URL in `SettleUp.tsx:74` (a malformed `?amount=` renders `"NaN"`). Add `parseDecimal(input, maxDecimals)` to `lib/money.ts` and validate URL params with `Number.isFinite`.

#### L5. Sequential writes where one batch exists — [Certain]

`StatementImport.addAll` (`:138-142`) and `Friends.settleAll` (`:60-69`) `await repo.saveExpense/saveSettlement` in a loop → N batches and N activity entries; `GroupForm.save` (`:203-204`) awaits member adds one by one (required by rules — keep, but comment says so). For statement import, consider a `repo.expenses.saveMany(groupId, expenses)` that writes one batch and one summary activity entry, as `bulkImport` does.

---

## 3. Already good — do not "fix"

- **Type discipline:** `strict`, `noUnusedLocals/Parameters`, zero `any`, 5 justified `as unknown as`, `satisfies UserProfile` in `firebaseRepo.ts:140`. `tsc` clean.
- **Pure, tested domain layer:** `lib/splits.ts` (largest-remainder), `lib/fx.ts`, `lib/trust.ts`, `lib/activity.ts`, `lib/recents.ts`, `lib/table.ts`, `lib/import-splitwise.ts` all have tests next to them; `recents.ts:9-16` even injects storage for tests.
- **Repo seam & offline model:** `Repo` interface with Firebase + localStorage implementations; writes resolve on local apply with a central `errorChannel` (`repo.ts:317-338`) surfaced once in `App.tsx:43`; `listenError` suppresses expected permission-denied; batch-order comments explain rule interactions (`firebaseRepo.ts:386-407`).
- **Correct React patterns where it counts:** render-phase state adjustment instead of effects (`ExpenseForm.tsx:145-155`, `StatementImport.tsx:89-93`, `ProfileCards.tsx:157`); keyed re-mount of `Form`; `useSyncExternalStore` for SW/nav/inbox state (`UpdatePrompt.tsx:67-73`, `useInbox.ts:16`); request-key race guard in the FX effect; StrictMode-safe idempotency maps (`Capture.tsx:19`, `CaptureGuest.tsx:13`).
- **Accessible primitives:** `Select` (combobox/listbox roles, type-ahead, portal, flip), `DateField` (iOS workarounds documented), `Collapsible` (`inert`, grid-rows animation, reduced motion), `Switch` (`role="switch"`), `Segmented`, `Sheet` (Escape, scroll lock). `aria-label`s and `data-testid`s are consistent.
- **Comments explain intent** ("why", not "what") throughout — e.g. `firebaseRepo.ts:73-77, 214-216, 432`, `ExpenseForm.tsx:73, 142-144, 182`.
- **Lazy loading** of routes and the Firebase SDK (`data/index.ts:44-45`), Tesseract and Functions on first use.

## 4. Open questions for the product owner

1. **Split type semantics** (M8): is it acceptable to migrate stored expenses so `splitInput` carries its own `type` and the top-level `splitType` becomes derived? This touches rules (`validExpense`), both repos and the CSV import, so it should be a deliberate decision rather than a drive-by.
2. **Drafts** (M3): should expense drafts persist across sessions/devices (Firestore `users/{uid}/drafts`) or only on-device (`sessionStorage`)? The on-device version is a day; cross-device adds rules and a UI for stale drafts.
3. **Demo mode scope**: the demo repo mirrors 73 methods including AI stubs that throw. Is demo mode a long-term product surface (then invest in `ai?:` optionality, H3) or a developer convenience (then it could shrink)?

---

## 5. Prioritised refactor plan

Effort: **S** < ½ day · **M** 1–2 days · **L** 3–5 days.

| # | Item | Effort | Unlocks |
|---|---|---|---|
| 1 | **`MoneyInput` + string draft state in all split editors; stable item ids** (C1, C2) + first RTL test | M | Fixes the only user-visible bug class found; forces the test harness (H5) into existence |
| 2 | **Extract `src/lib/expense-draft.ts` reducer/selectors/validate/toExpense + tests** (H1 step 1) | M | Makes the most intricate logic unit-testable; prerequisite for 3 and for drafts |
| 3 | **ESLint flat config with `react-hooks` (+ `boundaries` rule for `src/lib`)**, remove the 13 decorative disables by restructuring (H2, M1, M4) | S + S/M fixes | Stops stale-dep regressions; enables React Compiler later |
| 4 | **`errorMessage()` + `useAction`/`useActionState`, `ConfirmSheet`; remove 54 casts, 18 busy blocks, 7 `confirm()`, 5 bare awaits** (M2, L1) | M | Consistent UX; most mechanical win per hour |
| 5 | **Shared components:** `ListCard`, `MemberRow`, `Checkbox`, `BottomBar`, `Section`, `IconButton`; adopt `formatDate`; one `fmtAgo`; delete duplicate `isIOS`/`isStandalone`/`titleCase`/`Stat`/`Quiet`/`Shell` (M5, M4) | M | Shrinks every page; makes H1 step 2 mostly moves |
| 6 | **Finish ExpenseForm decomposition into `src/features/expense-form/*`** (H1 step 2) + `GroupScope` context (M6) | L | 880 → ~80-line route + small tested pieces |
| 7 | **Move wire contracts to `shared/contracts/*`**, widen `functions/tsconfig` include (H4) | S/M | Ends client/server drift |
| 8 | **Split `Repo` into domain sub-interfaces and `firebaseRepo` into `src/data/firebase/*`**; `write()` helper; `ai?` optional (H3) | M | Reviewable data layer; demo repo stops stubbing AI |
| 9 | **`useWatch` ref-counted store; move `catchUpRecurring` to App** (M7) | M | Fewer listeners, one place for the recurring side effect |
| 10 | **`createBrowserRouter` migration + `useBlocker` dirty guards + sessionStorage drafts + Cache-Storage receipt hand-off** (M3) | M | Stops lost work on mobile |
| 11 | `<Activity>` for GroupDetail tabs, `useOptimistic` for toggles, `useDeferredValue` for search (L1) | S | Smoother UX, less code |
| 12 | `SplitInput` → discriminated union with stored-doc shim (M8) — after owner answers Q1 | L | Removes `clean()`/`seedInput()` guard logic for good |
| 13 | Pure fns out of pages (`insights.ts`, `capture-demo.ts`) + tests; `parseDecimal`; `saveMany` (L2, L4, L5) | S each | Coverage, consistency |

### Do first (one sprint, in this order)

1. **#1 MoneyInput + split-editor fix + test harness** — it is a bug fix, and setting up `jsdom`/RTL for it pays for every later item.
2. **#2 `expense-draft.ts` reducer** — the single extraction that turns the riskiest code in the app into something you can test and then safely split (#6) and persist (#10).
3. **#3 ESLint + react-hooks** — cheap, and every later refactor benefits from the rule actually running.
4. **#4 `errorMessage` / `useAction` / `ConfirmSheet`** — touches ~25 files mechanically, removes the largest duplication counts, and standardises feedback before new screens copy the old pattern.
5. **#7 shared contracts** — small, and it closes the client/server drift window while the capture/AI features are still moving.
