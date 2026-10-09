# C1 done — Expense entry, splits, settle-up, expense detail

## What changed
New
- `src/lib/expense-draft.ts` (+ `expense-draft.test.ts`, 36 tests): the pure state machine for the expense form — `Draft`/`SplitDraft` (money as minor units of the entry currency, absent = empty), `initialDraft` (new / edit / "add again" / captured payment, seeded from `lastSplit`), `reduce` (22 actions incl. `switchGroup`, `currency` with digit rescaling, `applyReceipt` honouring the reader's currency, `assignItems`, `pickSuggestion`), selectors (`selectPaidBy`, `selectSplits`, `describePayer`, `describeSplit`), `validate` (per-field errors), `toExpense` (FX conversion with `original`, recurrence, edit mode keeping id/createdBy/receiptPath/importedFrom), `buildRecurrence`, `isDirty`, sessionStorage draft persistence (`draftKey`/`loadDraft`/`saveDraft`/`clearDraft`, injectable storage), `hydrateDraft`/`restoreDraft`, `parseDecimal`, Unicode `titleCase`, `SPLIT_TYPE_LABEL`.
- `src/features/expense-form/`: `ExpenseEditor.tsx` (useReducer + persistence + save/cancel + sheets), `AmountCard.tsx`, `PayerCard.tsx`, `SplitCard.tsx` (summary row + sheet with the six types in a 3×2 grid, itemised restored), `SplitEditor.tsx`, `ItemsEditor.tsx`, `MoreCard.tsx` (Collapsible: Repeat + Ends + Notes), `FxLine.tsx`, `useFxRate.ts`, `DecimalInput.tsx` (string-draft number input for percent/shares), `bits.tsx` (Footer/Left/SplitFooter strips, SameHint, MemberRow, CheckBox, youFirst), `sheets.tsx` (group picker with the owner's Create section, currency, category, payer, SummaryCard).
Changed
- `src/pages/ExpenseForm.tsx`: ~90 lines; picks the group (URL → stored draft → live trip → last used → first), recovers from a deleted `?group=`, loads what the editor needs, skeleton instead of spinner, NoGroups kept (`?next=add`, `nogroups-split`).
- `src/pages/SettleUp.tsx`: MoneyInput, amount labelled "Amount in <CUR>" with inline error, `?from&to&amount` kept (validated), "Full ₹1,247 · ₹1,200 · ₹1,250" chips (`roundSuggestions`), "Waive the rest" switch → second settlement `{ method: 'waived', note: 'Rest waived' }`, method chips as a radiogroup with `methodLabel`, stale-response guard on `getMemberProfile`, `inputMode="email"` on the UPI field, 44px icon buttons, `errText`, no emoji in toasts.
- `src/pages/ExpenseDetail.tsx`: comment delete and stop-repeating are Undo toasts (restorable) instead of `window.confirm`; no empty `<h1>` (one h1); 44px header actions; `formatDate`/`formatDateTime`; `errText`; `text-muted`; emoji hidden from AT; "share/shares".
- `src/pages/SplitBill.tsx`: AI fallback toast is neutral, `errText`, shared Unicode `titleCase`, `text-muted`, 44px remove buttons.
- `src/lib/payments.ts` (+test): `methodLabel()`, `roundSuggestions()`.
- `src/lib/pending.ts`: doc comment only (currency hand-off).
- `src/components/MoneyInput.tsx`: `bare` prop (no `.input` box) for the hero amounts; contract unchanged.
- `src/components/MemberChips.tsx`: `aria-pressed`, check icon (not colour-only), 36px, defensive member lookup; props unchanged.
- `src/components/Misc.tsx`: `PageHeader` renders `<h1>` only with a title, 44px back button; `Empty` title is `<h2>`; `formatRange` via cached `formatDate`.
- `src/components/Select.tsx`: `currencyOptions` defaults to `appLocale()`.
- `src/components/DateField.tsx`: 36px clear button, readable hint colour, cached `formatDate`.
- `src/components/QrCode.tsx`: never throws (too-long value → plain message).
- `src/components/Toast.tsx`: error toasts carry `role="alert"`.

## Owner's decisions preserved (addendum)
"With" picker Create section (`group-create`, `?next=add` → `/add?group=<id>`), one-line header Save, currency trigger showing the symbol with codes in the sheet, Scan on the date row filling the width (`@container`), `Footer`/`Left`/`SplitFooter` strips with `card-footer`, NoGroups → `?next=add`, no second inline mini-form, FAB untouched.

## What I verified
- `npx tsc -b`: exit 0 (whole repo, at finish).
- `npx vitest run`: 54 files, 814 tests, all passing at finish (earlier runs showed 4 failures in B's `functions/src/lib/{functions,gemini}.test.ts` while B was mid-edit; gone by the end).
- `npx biome lint --diagnostic-level=error` on every file I touched: 0 errors.
- Draft logic exercised in tests for every split type (equal/exact/percent/shares/adjust/itemised all balanced), FX conversion + `original`, recurrence (new/changed/unchanged/occurrence), edit-mode seeding (multi-payer in original currency), "add again", captured payment, group switch (content kept, payer/split re-seeded, foreign currency kept), currency digit rescaling, scanned-bill currency, suggestion restore, validation messages, dirty check, storage round-trip and junk, hydration of a draft from another group.
- No component tests: the repo has no jsdom/RTL (E's call; none installed), so the UI layer was checked by type-checking and by reading; the state machine behind it is what the tests cover.

## Deliberately left out, and why
- The receipt `File` is not persisted with the draft (sessionStorage can't hold it; the report's Cache Storage idea needs a shared helper with Scan/Share — C3's area). A reload keeps every typed field and restores the draft with a toast; only the photo must be re-scanned.
- `createBrowserRouter`/`useBlocker` dirty guard (16 §M3): main.tsx/App.tsx are A2's; the X button's confirm + sessionStorage restore cover the same loss case without a router migration.
- Toast pause-on-hover (15 §M3): not done; error toasts now `role="alert"`, and Undo durations are unchanged.
- SettleUp's method chips stay a chip row (05 §M5 suggested a Select) — the chips are now a labelled radiogroup, which was the accessibility ask; the layout is the owner's.
- "Assign items myself" seeds every item with everyone selected (a valid split from the start); the alternative (nobody selected) forces a tap per item before Save works.
- `Sheet` close button kept at the owner's fresh 36px design (request 16); it sits alone with spacing, which the ≥24px-with-spacing rule allows.
- `memberOrder(g, me)` "You first" was not added to hooks/data.ts (A1's): pickers display "You" first via `youFirst()`; the canonical order stays for deterministic allocation.
- `usePageTitle` (C2): no handoff had landed when I finished; titles are listed in C1.md for C2 to wire.

## Decisions the owner should know
- Split editing moved into a sheet opened from a one-line summary ("Split equally · 4 people" / "₹300.00 each"); the card still shows the status strip (exact/percent left, errors) so a problem is visible before Save. Multi-payer amounts stay inline on the Paid-by card with the "left to assign" strip (request 21); the payer sheet has a "Several people paid" row.
- Validation is inline after the first Save attempt (`role="alert"` next to the field, first problem scrolled into view and focused); toasts are only for server errors.
- Switching the entry currency keeps the typed figure in the new currency's digits (₹12.50 → ¥13); 2-decimal ↔ 2-decimal switches are unchanged.
- A draft typed on `/add` survives a reload or back; opening `/add?group=X` later restores the typed fields but takes X as the group (the `?next=add` create flow depends on this). A draft started from `?again=`/`?capture=` only restores for the same again/capture.
- Cancel asks "Discard this expense?" only when dirty; from the home-screen shortcut (no history) it goes Home.
- "Waive the rest" is offered to whoever records a part payment (not only the person owed); it writes a separate 'waived' settlement so the history shows what was paid and what was let go. C2 must render `methodLabel()` for it to read "Waived".
