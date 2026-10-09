# 09 — Half-baked features, docs-vs-code gaps, dead code

Lens: every ✅ / 🟡 / ⏳ claim in `docs/PLAN.md`, `docs/AUTO_CAPTURE.md` and `README.md` checked against the code (routes in `src/App.tsx`, UI reachability, both repos in `src/data/`, `firestore.rules`, `storage.rules`, `functions/src`, `tests/`), plus a sweep for TODO/deprecated/dead code, the ⏳ roadmap, `GroupType` consistency, the Split It → Split Now rename, and what demo mode silently drops. Repo was read-only; `npx tsc -b --noEmit` passes (exit 0). No file in the repo was changed.

## 1. Summary

The code is further ahead than the docs: push notifications, capture push, Gemini AI reading (bills, statements, SMS fallback, per-user keys, admin config, usage stats) and statement import are all built and wired end-to-end, but `PLAN.md` still marks push and AI as ⏳ and never mentions the AI/admin collections at all. The genuinely unfinished pieces are small and well-contained: **leave group** has repo + rules + activity text but no button (and the existing repo path would be rejected by the rules the moment a button is added), **remove member** is done but hidden behind a stricter rule than documented, and nothing exists for archive, haptics, Apple/phone sign-in or year-in-review (the ⏳ markers there are honest). Two deployer-facing doc contradictions matter: `FIREBASE_SETUP.md` suggests an Australian Firestore region while functions are pinned to `asia-south1`, and the setup guide omits the AI callables and the `GEMINI_API_KEY` secret. Dead code is light (two `@deprecated` repo methods with zero callers, two never-used exports, 13 `eslint-disable` comments with no ESLint installed). Demo mode works, but hides Notifications/AI without saying why and can silently stop persisting once receipt data-URLs fill `localStorage`. Overall verdict: **ship-quality code, stale docs; one latent rules bug (self-leave) to fix before adding the Leave button.**

## 2. Findings by severity

### High

#### H1. `PLAN.md` / `AUTO_CAPTURE.md` status markers contradict the code (push, AI, capture push, budget burn-down) [Certain]

| Doc claim | Reality |
|---|---|
| `docs/PLAN.md:97` "⏳ Push notifications (FCM) for new expenses and reminders" | Built: `functions/src/triggers.ts` (`onExpenseCreated`, `onSettlementCreated`), `functions/src/reminders.ts`, `functions/src/push.ts`, `src/lib/push.ts`, `src/components/NotificationSettings.tsx`, `public/push-sw.js`, rules `users/{uid}/pushTokens` (`firestore.rules:49-58`), `tests/firestore.push.test.ts`. `PLAN.md:326` (Phase 3) and `PLAN.md:172-181` already say ✅. |
| `docs/PLAN.md:118` "⏳ … FCM push for new captures (need Cloud Functions / Blaze)" and `docs/AUTO_CAPTURE.md:304` "§9 Later phases … Push notifications. FCM 'New payment to sort'" | Built: `functions/src/capture.ts:159-162` calls `sendToUser(uid, matched ? ['captures'] : ['captures','unsorted'], note)`. `AUTO_CAPTURE.md:27-37` describes it as the primary flow in the same file. |
| `docs/PLAN.md:104` "⏳ Optional server-side AI parsing (Cloud Function + vision model) for messy receipts — needs the Blaze plan"; `PLAN.md:327` Phase 4 "server-side AI receipt parsing" without ✅ | Built: `functions/src/ai.ts` (`parseReceiptAi`, `aiKey`, `aiModels`, `aiStatus`, `aiReadSms`), `functions/src/lib/gemini.ts`, `shared/ai-config.ts`, `src/lib/ai.ts` (`readReceipt` tries Gemini first), `src/components/AiScanToggle.tsx`, `AiSettings.tsx`, `AdminAi.tsx`, `StatementImport.tsx`, repo methods `readReceiptAi/readStatementAi/aiKey/aiModels/aiStatus/watchAiState/watchAppAi/saveAppAi/aiUsage` in both repos, rules `config/ai`, `admins`, `stats`, `users/{uid}/secrets`, `users/{uid}/aiState` (`firestore.rules:28-37,110-133`), `tests/firestore.ai.test.ts`. |
| `docs/PLAN.md:124` "✅ Group budget burn-down" and `PLAN.md:23` "per-group budget burn-down" under Insights; `README.md` Insights row "…and a group budget bar" | `src/pages/Insights.tsx` has no budget chart or bar at all. The only budget UI is `BudgetBar` in `src/pages/GroupDetail.tsx` (static spent/left progress bar, not a burn-down over time). Overstated ✅. |
| `docs/PLAN.md:80` "A 'Needs your OK' card on Home lists what's waiting on you" | Moved: the card is in `src/pages/Inbox.tsx:94` ("Needs your OK" section); Home only mentions it in the greeting text (`src/pages/Home.tsx:325-332`). |
| `docs/PLAN.md:100` "✅ Receipt scan … pre-fills the expense form (itemized split available)" and `PLAN.md:68` itemized as a form split type | Itemized is no longer offered when creating in the form: `src/pages/ExpenseForm.tsx:38-39,452` show the "Items" chip only when editing an already-itemized expense. Scan → "Split by items" goes to `/split` (`src/pages/Scan.tsx:152`), the standalone `SplitBill` page. Feature exists; description is stale. |

Why it matters: `PLAN.md:5` calls itself "the source of truth"; an engineer or the owner planning Phase 4 from it would re-plan work that is done, and an auditor reading "⏳ push" would not look for the push code.

Fix (docs only): in `PLAN.md` change line 97 to ✅ and point at §4.0; line 118 → "✅ FCM push on capture (§4.0); ⏳ open banking, email forwarding"; line 104 → "✅ Server-side AI reading (Gemini): bills, statements, SMS fallback — see §3.5c (new)"; line 124 → "✅ Group budget bar on the group page (spent / left); ⏳ burn-down over time"; line 80 → "A 'Needs your OK' section in the Inbox"; line 100 → "… pre-fills the expense form, or 'Split by items' opens the item-by-item screen (`/split`)". In `AUTO_CAPTURE.md` delete the push bullet from §9. In `README.md` Insights row drop "and a group budget bar" (or say "budget bar on each group").

#### H2. The AI feature set, statement import and ~11 collections/fields are missing from the data model, feature inventory and deploy guide [Certain]

- `docs/PLAN.md` §3 has no entry for: Gemini bill reading (`readReceipt`), **statement import** (Scan → Statement → `StatementImport.tsx`, writes expenses via `repo.saveExpense` or captures with `source: 'statement'` at `src/components/StatementImport.tsx:141,158`), SMS fallback in the webhook (`functions/src/capture.ts:104-114`), per-user Gemini keys (`aiKey`), admin config (`config/ai`, `admins/{uid}`), usage stats (`stats/ai_{day}`), AI rate limits (`rateLimits/ai_{kind}_{uid}`, `functions/src/ai.ts:56-63`).
- `docs/PLAN.md` §4.2 data model omits: `users/{uid}/pushTokens`, `users/{uid}/settings/notifications` (holds push prefs + capture filters + AI prefs, `firestore.rules:69-94`), `users/{uid}/captureLog`, `users/{uid}/secrets/gemini`, `users/{uid}/aiState/status`, `config/ai`, `admins/{uid}`, `stats/ai_*`, `rateLimits/*`, `reminderState/*`, `fxRates/*` (the last three are only in §4.0 prose); fields `Group.captureOff`, `UserProfile.phone`, `UserProfile.photoSource`, `profiles/{uid}.photoURL`, `Capture.ts/card/raw/note/suggestedGroup`, `Expense.receiptUrl`.
- `docs/PLAN.md:174-181` §4.0 function table and `docs/FIREBASE_SETUP.md:63-72` §5a table list 7 functions; `functions/src/index.ts` exports 11 (`parseReceiptAi`, `aiKey`, `aiModels`, `aiStatus` missing). `FIREBASE_SETUP.md` never mentions the `GEMINI_API_KEY` secret (`functions/src/ai.ts:26`, `defineSecret`), the `admins/{uid}` doc that must be created by hand (`firestore.rules:10-11,124-128`), or that `config/ai.mode` defaults to `'off'` (`shared/ai-config.ts:34`) so the shared key does nothing until an admin flips it. A new deployer following §5a will be prompted by the CLI for an undocumented secret.
- `README.md` features table and `README.md` "Project layout → pages/" list omit AI, statement import, trust features (activity/history/trash/disputes/approval), comments, recurring, Inbox, Capture, Table/SplitBill, ImportGroup, AutoCaptureSetup, Share.
- `docs/PLAN.md:170` says functions bundle `shared/sms-parse.ts`; they also bundle `shared/capture-filters.ts` and `shared/ai-config.ts`.

Fix: add §3.5c "AI reading (Gemini)" and §3.5d "Statement import" to PLAN with the key-resolution order from `shared/ai-config.ts:100-120` (own key → shared key per `config/ai.mode`/allowlist → none), add the missing collections to §4.2 (copy the comments already in `firestore.rules`), extend the function tables, and add a §5d "AI (Gemini)" to `FIREBASE_SETUP.md`: `firebase functions:secrets:set GEMINI_API_KEY`, create `admins/{yourUid}` in the console, set `config/ai` from Profile → Admin · AI features.

#### H3. "Leave group" is wired in repo + rules + activity text but has no UI, and the existing repo path would be rejected by the rules on self-leave [Likely]

- Backend exists: `Repo.removeMember` in both repos; `src/lib/activity.ts:209-213` already produces "X left the group" when `self` is true; `firestore.rules:230-234` allows a member to remove themselves; `tests/firestore.hardening.test.ts:82-83` "a member can leave (remove themselves)" passes.
- No UI: `src/pages/GroupForm.tsx:338` renders the remove X only for `m.uid !== user.uid`; nothing in `GroupDetail.tsx`/`Profile.tsx` offers Leave. `PLAN.md:57` lists it ⏳.
- Latent bug: `src/data/firebaseRepo.ts:350-370` `removeMember` always writes `invites/{code}` (`:363`, `placeholders.{memberId}: deleteField()` with merge) in the same batch. The invite rule (`firestore.rules:525-537`) requires `uid() in groupAfter(groupId).data.memberUids`, evaluated **after** the batch. When the member removes themselves they are no longer in `memberUids`, so the invite write is denied and the whole batch is rejected ("you don't have permission (the change was undone)"). The rules test only updates the group doc, not the batch with the invite write, so it doesn't catch this. The creator removing someone else passes (creator stays a member).

Why it matters: the first engineer to add a Leave button will hit a permission-denied that looks like a rules bug; the activity text and test give false confidence.

Fix (code, ~0.5 day):
1. `firebaseRepo.ts:362-364`: only touch the invite for placeholders: `if (!m?.uid && group.type !== 'personal') batch.set(inviteRef(...), …)`. `placeholdersOf()` (`src/data/repo.ts:333-335`) already filters uid-less members, so joined members never appear in the invite doc anyway. Mirror nothing in `localRepo` (it has no invite doc).
2. Add a rules test that runs the full batch (group update + invite merge + profile delete + activity create) as the leaving member.
3. UI: in `GroupForm.tsx` (edit mode, `existing && existing.createdBy !== user.uid`) add a "Leave group" button next to "Delete group" that computes `net[me]` via `computeGroupData(existing, expenses, settlements, user.uid)` (imports already available) and blocks with "Settle up first — you owe/are owed ₹X" when non-zero; on success `nav('/groups')`. The creator cannot leave because `createdBy` is immutable (`firestore.rules:248`) — show "You created this group: delete it, or ask a member to re-create it" (no ownership transfer exists; see Open questions).

#### H4. `FIREBASE_SETUP.md` tells a new deployer to pick a Firestore region that the functions cannot use [Certain]

`docs/FIREBASE_SETUP.md:11` "pick a region close to your users (e.g. `australia-southeast1`)". `functions/src/config.ts:2` pins `REGION = 'asia-south1'` and `FIREBASE_SETUP.md:56` / `PLAN.md:170` say it "must match the Firestore location" (2nd-gen Firestore triggers must be deployed in the database's location). A fresh project created per §1 step 3 would fail to deploy `onExpenseCreated`/`onSettlementCreated` or, if `REGION` is edited, break the Hosting rewrites that hardcode `"region": "asia-south1"` in `firebase.json` (both sites) and the client `getFunctions(app, 'asia-south1')` in `src/data/firebaseRepo.ts:828`.

Fix: `FIREBASE_SETUP.md:11` → "pick **`asia-south1` (Mumbai)**, which `functions/src/config.ts`, `firebase.json` rewrites and `src/data/firebaseRepo.ts` (`getFunctions(app, 'asia-south1')`) all assume; if you must use another region, change all three." Optionally derive the client region from one exported constant (`src/lib/brand.ts` or a new `shared/region.ts`) to avoid the triple hardcode.

### Medium

#### M1. Approval threshold default is 10,000 minor units regardless of currency (₹100 for INR); docs say "A$100" [Certain]

`src/lib/trust.ts:11` `DEFAULT_APPROVAL_THRESHOLD = 10_000` with the comment "A$100.00"; `firestore.rules:324` `g.get('approvalThreshold', 10000)`; `src/components/Trust.tsx:159` `group.approvalThreshold ?? 10000`; `src/pages/GroupForm.tsx` placeholder shows `centsToInput(10_000, currency)` = "100.00" for INR. After the India-first pivot (`PLAN.md:12`) the default means almost every dinner in an INR group needs approval once the toggle is on, and ¥10,000 for JPY. `PLAN.md:80` still says "default A$100".

Fix: (a) `GroupForm.tsx` save: when `requireApproval` is on and the user left the field blank, write an explicit `approvalThreshold` from a per-currency table in `trust.ts` (`{ INR: 2000_00, AUD: 100_00, USD: 100_00, EUR: 100_00, JPY: 15000, … }` with a 100-major-unit fallback via `minorDigits`); (b) keep the rules default but it then only matters for legacy docs; (c) `Trust.tsx:159` use `thresholdOf(group)` (already exported, currently unused outside `trust.ts`); (d) update `PLAN.md:80`.

#### M2. Balances tab says disputed expenses are "still counted until resolved **or edited**" — editing never clears a flag [Certain]

`src/pages/GroupDetail.tsx:146`. `src/lib/trust.ts:83` `prepareExpenseSave` copies `prev.dispute` through every edit, and `firestore.rules:335` (`trustFieldsKept`) rejects a normal edit that touches `dispute`. The Trust panel text (`Trust.tsx:418` "until you resolve it") and `PLAN.md:79` ("The flagger resolves") are correct.

Fix: change the GroupDetail string to "(still counted until the flagger resolves it)". If the intended behaviour was "an edit of the money clears flags", implement it in `prepareExpenseSave` (drop `dispute` when `moneyChanged(prev, next)`) and relax `trustFieldsKept` to allow removing `dispute` keys when `amount/paidBy/splits` changed, plus a rules test; that also addresses the "only flagger clears flag" gap (§3 item 11).

#### M3. `group.type` (and `name`/`emoji`/`currency`) are not validated by rules; an unknown type crashes the Edit group page for every member [Likely]

`firestore.rules:241-253` validate `createdBy`, `memberUids`, `inviteCode`, `captureOff` and membership only. Any member can write `type: 'banana'`. `src/lib/groupTypes.ts:45-47` `iconsFor(type)` does `GROUP_TYPES[type].icons` and `GroupForm.tsx` does `const info = GROUP_TYPES[type]` then `info.placeholder` → TypeError → the Edit group route white-screens (there is no error boundary in `App.tsx`). `LiveBadge`, `GroupRow` and the functions (`type !== 'personal'`) degrade gracefully. Needs a hostile co-member, so Low likelihood, but a one-line rule.

Fix: add `&& request.resource.data.type in ['trip','outing','home','couple','event','office','other','direct','personal']` to `allow create` (`firestore.rules:241`) and the member-update branch (`:246`), `&& request.resource.data.currency is string && request.resource.data.currency.size() == 3`, `&& request.resource.data.name is string && request.resource.data.name.size() <= 100`; and make `parseGroupType`/`iconsFor` fall back to `'other'` for unknown values. See §4 for the doc side.

#### M4. "Remove a member" is actually built (both repos, rules, activity, tests) but `PLAN.md` marks it ⏳, and the UI rule is stricter than documented and silent [Certain]

`PLAN.md:57` "⏳ … remove a member (blocked when their balance is non-zero)". Code: `Repo.removeMember` in `firebaseRepo.ts:350` and `localRepo.ts:159`, rules `firestore.rules:228-234`, tests `hardening.test.ts:76-87`, activity "X removed Y from the group". The UI (`GroupForm.tsx:338`) hides the X when the member id appears in **any** expense or settlement, trashed ones included (`used`), with no explanation — a member who paid once and is fully settled can never be removed, and the user sees no hint why the X is missing. Also note for the future "zero balance" rule: `firestore.rules:315-316` require `paidBy`/`splits` keys ⊆ current `members`, so after removing a referenced member, any edit of an old expense that includes them is rejected (`validExpense` fails) with a confusing permission toast.

Fix: mark ⏳ → 🟡 in PLAN with the real rule; in `GroupForm.tsx` show a disabled X with `title="Can't remove: appears in N expenses"` instead of nothing. For the documented behaviour see §3 item 3 (former-members map).

#### M5. Dead and vestigial code [Certain]

- `Repo.updateGroup` (`src/data/repo.ts:104`, `@deprecated`) and `Repo.uploadReceipt` (`repo.ts:135`, `@deprecated`): zero callers outside the two repos (`grep -rn "\.updateGroup(\|\.uploadReceipt(" src` returns only the implementations). Implemented in `firebaseRepo.ts:324-336,547-552` and `localRepo.ts:147-151,320-328`. Remove from the interface and both repos (~35 lines).
- Never referenced anywhere (only their definition line): `appRegion` (`src/lib/locale.ts:109`), `CAPTURE_SOURCES` (`src/lib/capture.ts:26`, also stale: lacks `'sms'` and `'statement'` which `functions/src/lib/capture-core.ts:84` and `StatementImport.tsx:158` write). `GROUP_EMOJIS` (`src/components/IconPicker.tsx:5`) is a redundant alias of `ALL_GROUP_ICONS`.
- 13 `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `src/` but ESLint is not a dependency and there is no config file (`grep -c eslint package.json` = 0, no `.eslintrc*`/`eslint.config.*`). The comments are inert; the hooks rule they silence is not enforced anywhere.
- ~35 functions/consts and ~40 types are `export`ed but only used inside their own file (full list in Appendix A). Harmless but it hides real dead code; nothing in CI checks for it.
- `docs/PLAN.md:66` README "Project layout" line `hooks/ auth context, live data hooks, OCR hook` omits `useFx`, `useInbox`, `useReceiptReader`.

Fix: delete the two deprecated methods and the two unused exports; either add ESLint (`eslint`, `eslint-plugin-react-hooks`, `typescript-eslint`) with `react-hooks/exhaustive-deps` on so the 13 comments mean something, or delete the comments; add `knip` (or `ts-prune`) as `npm run deadcode` and run it in `.github/workflows/ci.yml` after `typecheck`.

#### M6. Demo mode silently hides features and can silently stop saving [Likely]

- `src/pages/Profile.tsx:176` renders the AI section only in Firebase mode; `src/components/NotificationSettings.tsx:35` returns `null` in demo (and in Firebase without `VITE_FCM_VAPID_KEY`); `src/components/AiScanToggle.tsx:13` returns `null`. A demo user never learns these exist. The only demo indicators are the Login banner and the Profile footer (`Profile.tsx:214`). Statement import does say "Demo: shows a sample statement." (`StatementImport.tsx:184`) and the SMS wizard says "(demo, simulated)" — good precedents.
- `src/data/localRepo.ts:263-278` `attachReceipt` stores a 900 px / q0.7 JPEG as a data URL (~130–330 KB base64 each) inside the single `splitit-demo-v1` key; `localRepo.ts:62-64` `commit()` swallows `QuotaExceededError`. After roughly 15–35 receipts (5 MB origin quota, shared with `splitit-fx-v1` etc.) every subsequent `commit()` fails silently: the UI keeps showing the in-memory state, listeners fire, toasts say "saved", and on reload everything since the first failed write is gone. `uploadAvatar` (256 px) is fine.

Fix: (a) add a tiny `DemoNote` component ("Available once Firebase is connected — see docs/FIREBASE_SETUP.md") and render it where `NotificationSettings`, the AI `Collapsible` and `AiScanToggle` currently return `null` in demo; (b) in `localRepo.commit()` `catch (e) { errors.emit('write', e, 'Saving to this device (storage full?)') }` so `App` toasts it; (c) store demo receipts in Cache Storage (`caches.open('splitit-receipts')`, like `public/share-target-sw.js` does for shared images) or IndexedDB keyed by expense id and keep only `receiptPath: 'cache:<id>'` in state, resolving to a blob URL in `ExpenseDetail`.

#### M7. Group delete leaves orphans beyond one batch; a 10-line Cloud Function fixes it properly [Certain]

`src/data/firebaseRepo.ts:371-405` deletes sub-docs in 450-write batches and only `activity.slice(0, BATCH_LIMIT - 2)` in the final batch (rules `firestore.rules:428-430` only allow activity deletes in the batch that deletes the group). `PLAN.md:284` acknowledges "more are left orphaned and unreadable". The same applies if any earlier batch is rejected offline: the group goes, the expenses stay (forever, unreadable, billable).

Fix: add `onGroupDeleted = onDocumentDeleted({ document: 'groups/{groupId}', region: REGION }, (e) => db().recursiveDelete(db().doc(\`groups/${e.params.groupId}\`)))` in `functions/src/triggers.ts` (Admin SDK bypasses rules), plus `getStorage().bucket().deleteFiles({ prefix: \`receipts/${groupId}/\` })` for receipts; then the client can shrink `deleteGroup` to "delete the invite + group doc" and drop the best-effort batches. Update `PLAN.md:284` and the activity-delete rule comment.

### Low

#### L1. Split It → Split Now rename leftovers [Certain]

Intentional and fine to keep (renaming would wipe users' preferences/demo data; `PLAN.md:332` says ids stay): `localStorage` keys `splitit-theme/accent/duo/demo-v1/fx-v1/fx-last/install-dismissed/inbox-seen/last-group/last-split/last-method/pending-capture/push-token/ai-scan/return/table-guest/table-name`, cache `splitit-share`, package names, Firebase project `split-it-prod`, `APP_ORIGINS` listing both hosts (`functions/src/config.ts:8-15`), two Hosting targets in `firebase.json`/`.firebaserc`.

Inconsistent or user-visible, worth fixing:
- `public/push-sw.js:15` fallback notification title `'Split It'` (shown if a push ever arrives without `data.title`). Use `'Split Now'` (or import `APP_NAME`-like constant; the SW can't import from `src`, so a literal).
- `src/lib/capture-settings.ts:16-18` use a new `splitnow-demo-*` prefix while every other key uses `splitit-`. Pick one convention (recommend keep `splitit-` as the storage namespace and document it in `src/lib/brand.ts`).
- `firestore.rules:3` "Split It — Firestore security rules", `functions/src/index.ts:2` "Split It Cloud Functions", `docs/FIREBASE_SETUP.md:15` 'register "Split It"', `:27` "Split It uses `signInWithRedirect`".
- `src/lib/import-splitwise.ts:30` `ImportSource = 'splitwise' | 'split-it'` vs `src/types.ts` `ImportedFrom = 'splitwise' | 'csv'`, mapped by hand in `src/pages/ImportGroup.tsx:159`. Rename the parser's value to `'csv'` so one vocabulary covers both and the old brand leaves the type system (`import-splitwise.test.ts:292-307` adjust).
- `src/lib/table.test.ts:241` fixture URL `split-it.web.app` — harmless.

#### L2. Smaller doc/code drift [Certain]

- `src/types.ts:181` `Capture.source` comment "ios-shortcut, android-auto, share, email, manual" misses `sms-ios`, `sms-android`, `sms`, `statement` (`SOURCE_LABEL` in `src/lib/capture.ts:28-31` has them).
- `docs/PLAN.md:287` / §4.3 "Storage receipts … signed-in users only" — `storage.rules:13-18` is members-only (stricter, good) and `avatars/{uid}` rules (`storage.rules:20-25`, `tests/storage.avatars.test.ts`) are undocumented in PLAN.
- `docs/PLAN.md:49` "type (Trip, Home, Couple, Event, Other)" vs 7 shared types in code (see §4).
- `docs/AUTO_CAPTURE.md` never mentions the statement-screenshot capture path (`source: 'statement'`, `suggestedGroup`), which lands in the same Inbox.
- `README.md` "Quick start" says demo pre-loads "a Goa trip and a Bengaluru flat" ✓, but the Scripts table says `npm test` covers "splits, balances, simplification, OCR parsing, capture parsing and SMS-setup helpers"; it also runs `shared/` and `functions/src/**/*.test.ts` (`vite.config.ts:67`).

#### L3. Settle-up gives no hint when the payer's home currency differs from the group's [Certain]

`PLAN.md:86,202` mark cross-currency settlement out of scope. `src/pages/SettleUp.tsx` shows only the group currency symbol; a user in an INR profile paying a THB trip debt gets no "≈ ₹…" figure although `useTodayRates`/`convertMinor` exist (used on Home/Insights). One line under the amount (`≈ {formatMoney(convertMinor(amount, cur, profile.currency, rate), profile.currency)} at today's ECB rate — record the group-currency amount`) closes most of the gap without the full feature (§3 item 4).

#### L4. Env-flagged UI that is permanently off, and a test-only export nobody imports [Certain]

- `VITE_ANDROID_MACRO_URL` is empty in `.env.production` and `.env.example`, so the "Download MacroDroid template" button in `src/pages/AutoCaptureSetup.tsx` never renders in production (documented as optional in `AUTO_CAPTURE.md:125`; fine, just note it in the wizard code as such).
- `functions/src/capture.ts:86` `handleCapture` is exported with an injectable `readSms` parameter for unit testing, but no test imports it (`functions/src/lib/functions.test.ts` tests the pure helpers; `npm run test:functions` goes over HTTP). Either add the unit test (mock `readSms`, assert the `paused → parse → filters → scope → dedupe` order from `AUTO_CAPTURE.md:70`) or drop the parameter.

#### L5. Test gaps around the ✅ claims [Certain]

- No rules test for the full `removeMember` batch (see H3) or for `addMember` writing the invite placeholder.
- No `storage.rules` test for `receipts/{groupId}` (only avatars).
- No rules test that `captureOff` must be a boolean (`firestore.rules:251`) — `tests/firestore.capture-settings.test.ts` covers the settings doc; check it covers the group field too.
- No test for `GroupForm` member-removal gating or for `catchUpRecurring` (`src/hooks/data.ts:46`), which is exported but only exercised through the hooks.

## 3. The ⏳ list and the §3.3b "Gaps" — effort, files, recommended scope

Effort assumes one engineer who knows this codebase. "Files" are the ones that must change; tests listed are the ones to add.

| # | Item | State today | Effort | Files | Recommended scope |
|---|---|---|---|---|---|
| 1 | **Archive a group** (`PLAN.md:57`, Phase 3 🟡) | Nothing. No field, no UI, no filter. | ~1 day | `src/types.ts` (`archivedAt?: number`), `src/pages/GroupForm.tsx` (Archive/Unarchive button, any member), `src/pages/Groups.tsx` + `src/components/GroupRow.tsx` (collapsed "Archived" section), `src/hooks/data.ts` (`useAllGroupData` keeps archived but Home/Friends/Insights/`useInbox` skip them), `src/components/CreateSheet.tsx` + `src/pages/ExpenseForm.tsx` group pickers (hide archived), `src/lib/capture.ts` `rankGroupsForCapture` and `functions/src/lib/trips.ts` `pickTrip` (skip archived), `functions/src/reminders.ts` (skip), `src/lib/activity.ts` + `ActivityType` (`group.archived`/`group.restored`), `tests/firestore.hardening.test.ts` (field accepted), docs. Rules need no change (scalar group fields are not whitelisted). | Soft flag only; archived groups stay readable and restorable; exclude from totals and from capture matching. Don't block on non-zero balances (people archive old trips with ₹3 dust). |
| 2 | **Leave a group** | Repo, rules, activity text, rules test exist; no button; repo batch would be denied (H3). | ~0.5 day | `src/data/firebaseRepo.ts:362` (skip invite write for joined members), `src/pages/GroupForm.tsx` (button + zero-balance check via `computeGroupData`), `tests/firestore.hardening.test.ts` (full batch as leaver), `PLAN.md:57`. | Block when `net[me] !== 0`; creator can't leave (immutable `createdBy`) — say so. Ownership transfer is a separate decision (see §5 Open questions). |
| 3 | **Remove member blocked only on non-zero balance** | Built but gated on "ever referenced" (M4). | 1–2 days | `src/types.ts` (`Group.formerMembers?: Record<MemberId, Member>`), both repos' `removeMember` (move the entry instead of deleting when `used`), `firestore.rules:315-316,398-399` (`hasOnly(members.keys().union(formerMembers.keys()))` — note rules `Map.keys()` returns a List; use `.toSet()`), `validMembershipChange` (allow the move), `src/pages/GroupForm.tsx:338` (enable X when `net[id] === 0`, disabled-with-reason otherwise), name lookups (`GroupDetail.tsx` `name()`, `Trust.tsx`, `activityCtxFor`) fall back to `formerMembers[id]?.name` instead of "Former member"/"Someone", `src/pages/Insights.tsx:222` paid-vs-share includes former members with activity, `tests/firestore.hardening.test.ts`, `activity.ts`. | Keep the "former members" map so old expenses stay editable and readable; expose "Re-add" from the map. Without the map, keep today's gate but explain it (M4 fix). |
| 4 | **Settle in a different currency** (`PLAN.md:86,202`) | Nothing; PLAN lists the design. | 1.5–2 days | `src/types.ts` (`Settlement.original?: OriginalAmount`), `firestore.rules` (hoist `validOriginal` out of `expenses` to group scope and add to `validSettlement`), `tests/firestore.fx.test.ts`, `src/pages/SettleUp.tsx` (currency picker + rate line; extract `FxLine` from `src/pages/ExpenseForm.tsx:584-612` into `src/components/FxLine.tsx`), `src/lib/payments.ts` `payOptions` (QR/UPI amount in the payee's currency — UPI links are INR-only, so only for INR payees), `src/lib/activity.ts` `settlementActivity` (use `amountLabel`), `src/lib/export.ts` (original columns), `src/pages/ExpenseDetail.tsx`-style display on settlement rows in `GroupDetail.tsx`, `src/data/seed.ts`. | Record in group currency (balances untouched), keep `original` for display, lock the rate like expenses. Do L3 first as a cheap interim. |
| 5 | **Year-in-review** (`PLAN.md:128`) | Nothing; `Insights.tsx:173-235` `compute()` already does period/basis aggregation. | 1–2 days, client-only | New `src/lib/yearReview.ts` (+ test): per-year totals, top categories, top groups, biggest expense, most-paid-with friend, trips taken (groups with dates), settlements count, "you fronted ₹X"; `src/pages/Insights.tsx` (card shown Dec–Jan or via `?year=`), `src/lib/share.ts` (render to canvas → `navigator.share` with a PNG; fall back to download), route `insights/year/:year` in `src/App.tsx`. | Reuse `compute()` with `period: 'year'`; multi-currency groups via `useTodayRates` as Insights does. Skip the shareable image in v1 if time is short. |
| 6 | **Apple sign-in** (`PLAN.md:46`) | Nothing. Needs Apple developer account (Services ID, key, team id). | 0.5 day code + account setup | `src/data/repo.ts` (`signInWithApple?`, `linkApple?`), `src/data/firebaseRepo.ts` (`OAuthProvider('apple.com')`, redirect in standalone like Google at `:208-214`; Apple returns the name only on first consent → `updateProfile`), `src/pages/Login.tsx` (button), `src/components/ProfileCards.tsx` `SignInMethods`, `docs/FIREBASE_SETUP.md`. | Only worth it if an App Store wrapper is planned (Apple requires it there); for a PWA, Google + email + (item 7) phone cover India. |
| 7 | **Phone OTP** (`PLAN.md:46`) | Nothing. `UserProfile.phone` exists but is unverified (`src/types.ts:37`). | 1–1.5 days + SMS cost on Blaze | `src/data/firebaseRepo.ts` (`signInWithPhoneNumber` + invisible `RecaptchaVerifier`; interplay with App Check `src/lib/appcheck.ts`), `src/data/repo.ts`, `src/pages/Login.tsx` (two-step phone → code form), `src/components/ProfileCards.tsx` (mark phone verified, link phone to an existing account), `docs/FIREBASE_SETUP.md` (enable Phone, test numbers). | Higher value than Apple for India (UPI = phone). Gate behind a flag until SMS costs are understood (Firebase phone auth free tier is limited). |
| 8 | **Haptics** (`PLAN.md:146`) | Nothing (`grep vibrate` empty). | 1–2 hours | New `src/lib/haptics.ts` (`tap()`/`success()` → `navigator.vibrate?.([10])`, no-op when `prefers-reduced-motion`), calls in `src/components/Trust.tsx` (Undo toast, Approve), `src/pages/SettleUp.tsx` (recorded), `src/pages/ExpenseForm.tsx` (saved), `src/pages/Table.tsx` (claim toggle), `src/components/Misc.tsx` `Segmented`. | Android-only by nature; no settings toggle needed. Keep ⏳ note "iOS Safari has no Vibration API" in PLAN. |
| 9 | **Recurring occurrences not logged** (`PLAN.md:83`) | Deliberately skipped; `saveRecurringOccurrences` writes no activity (`firebaseRepo.ts:617-625`, `localRepo.ts:330-337`). | ~0.5 day | `src/lib/activity.ts` (new type `expense.recurred`, text "“Rent” repeated for 1 Nov"), `src/types.ts` `ActivityType`, both repos (`batch.set(doc(activityCol, \`rec_${templateId}_${date}\`), entry)` — deterministic id so concurrent clients overwrite), `firestore.rules:426-427` (`allow update: if isGroupMember(groupId) && validEntry(request.resource.data) && resource.data.type == 'expense.recurred' && request.resource.data.targetId == resource.data.targetId`), `tests/firestore.trust.test.ts`. | Deterministic id + narrow update rule is enough; `actorUid` is whichever client generated it, which is honest ("Priya's phone added the November rent"). |
| 10 | **Receipt attachments not logged** (`PLAN.md:83`) | `attachReceipt` patches `receiptUrl/receiptPath` in its own batch with no entry (`firebaseRepo.ts:522-546`). | 1–2 hours | `src/lib/activity.ts` (`expense.receipt`, icon 🧾, text "X attached a receipt to “Dinner”"), `src/types.ts`, `firebaseRepo.ts:538-540` (log in the same batch), `localRepo.ts:263-278`. | Log attach only; removal isn't a feature today. |
| 11 | **Only the flagger can clear a flag** (`PLAN.md:83`) | Rules `firestore.rules:342-344` `ownKeyOnly('dispute')`; UI `Trust.tsx:409` "Resolve my flag". | ~0.5 day | `firestore.rules` (in `isFlagOrApproval`, allow *removing* any `dispute` key when `uid() == resource.data.createdBy` or `uid() == groupDoc.createdBy`; adding/changing stays own-key), `src/data/firebaseRepo.ts` `resolveFlag(group, e, byUid?)`, `localRepo.ts`, `src/components/Trust.tsx` (per-flag Resolve for author/creator), `src/lib/activity.ts` ("X resolved Y's flag"), `tests/firestore.trust.test.ts`. | Also fix the M2 string. Alternatively auto-clear flags when the money changes (one place: `prepareExpenseSave`). |
| 12 | **Approval only client-side** (`PLAN.md:83`) | Inherent to client-computed balances (`PLAN.md:166`); rules enforce the marker and own-key approvals. | n/a | — | Accept and document; the only server-side alternative is a maintained `balances` doc via a Cloud Function, which PLAN already names as the >5k-expense upgrade path. Not half-baked, just a known trade-off. |
| 13 | **Orphaned activity beyond ~448 on group delete** (`PLAN.md:284`) | See M7. | 2–3 hours | `functions/src/triggers.ts` (`onDocumentDeleted` + `recursiveDelete` + Storage prefix delete), `src/data/firebaseRepo.ts:371-405` (simplify), `PLAN.md:284`. | Do it; it also cleans up partial client deletes. |
| 14 | **Splitwise API import (OAuth)** (`PLAN.md:137`) | Nothing; CSV import is complete. | 3–5 days | New `functions/src/splitwise.ts` (OAuth2 code exchange holding the client secret, token storage in `users/{uid}/secrets/splitwise`, paginated `get_expenses`, receipts re-uploaded to Storage), `src/pages/ImportGroup.tsx` (second source), `src/lib/import-splitwise.ts` (map API shapes: exact payer/share, comments → `comments` subcollection, categories), rules for the new secret doc, docs. Requires a registered Splitwise app. | Defer. The CSV path already reconstructs balances exactly; the API only adds comments/receipts/exact payers. |
| 15 | **Open banking (Basiq)** (`PLAN.md:118`, `AUTO_CAPTURE.md:302`) | Nothing. | Weeks; AU-only, paid; India needs the Account Aggregator framework (licensed FIU) | — | Drop from the roadmap or mark "not planned"; SMS capture is the India answer and already exists. |
| 16 | **Email forwarding** (`PLAN.md:118`, `AUTO_CAPTURE.md:303`) | Nothing; `src=email` label reserved in `src/lib/capture.ts:30`. | 2–3 days + domain/MX setup | Inbound email (SendGrid Inbound Parse or Mailgun route) → `functions/src/email.ts` (per-user address `u_<token>@…`, parse with `aiReadSms`-style Gemini prompt, write `users/{uid}/captures` with `source: 'email'`), `docs/AUTO_CAPTURE.md`, `src/components/AutoCapture.tsx` (show the address). | Defer behind SMS; when done, reuse the capture token as the address secret. |

## 4. `GroupType` consistency

| Where | Values |
|---|---|
| `src/types.ts:4` | `trip, outing, home, couple, event, office, other, direct, personal` (9) |
| `src/lib/groupTypes.ts:19-29` `GROUP_TYPES` | all 9, `SHARED_TYPES` = 7 (`trip, outing, event, home, couple, office, other`) ✓ consistent |
| `src/pages/GroupForm.tsx` chips | `SHARED_TYPES` + links to `direct`/`personal` ✓ |
| `src/pages/TableFinish.tsx:175` | creates `type: 'outing'` ✓ |
| `src/data/seed.ts` | `trip`, `home` only (fine) |
| `firestore.rules` | **no validation of `type`** (M3) |
| `functions/src/lib/trips.ts`, `reminders.ts`, `src/pages/Scan.tsx`, `Friends.tsx`, `useInbox.ts` | only test `type !== 'personal'`; `direct` is treated as shared (intended) |
| `src/components/Misc.tsx:66` `LiveBadge` | "Live trip" for `trip`, "On now" for everything else ✓ |
| `tests/*.test.ts` | `type: 'trip'` only |
| `docs/PLAN.md:49` | "Trip, Home, Couple, Event, Other" (5) — stale |
| `docs/PLAN.md:216` §4.2 | `trip\|home\|couple\|event\|other\|direct\|personal` (7) — missing `outing`, `office` |
| `README.md` Groups row | "Trips, homes, couples, events, 1:1 friends and a personal wallet" — missing outings, offices |

Verdict: code is internally consistent; docs lag by two types; rules don't enforce the enum. Fix: M3 rule + update the three doc lines. `groupTypes.test.ts` covers `outing`/`office` parsing.

## 5. Naming migration (Split It → Split Now)

See L1. Summary: storage keys, cache names, package/project ids and both Hosting targets are deliberately kept (`PLAN.md:332`) and that is the right call. Four user-visible/structural leftovers to fix: `public/push-sw.js:15` fallback title, the `splitnow-demo-*` vs `splitit-*` key prefix split in `src/lib/capture-settings.ts:16-18`, `ImportSource = 'split-it'` leaking the old brand into a type, and the "Split It" headers/sentences in `firestore.rules:3`, `functions/src/index.ts:2`, `docs/FIREBASE_SETUP.md:15,27`. Export filenames already use `split-now-` (`src/lib/export.ts:87`) and the Shortcut is named "Split Now SMS" ✓.

## 6. Demo mode: what silently doesn't work

| Feature | Demo behaviour | Does the UI say so? |
|---|---|---|
| Google / email sign-in | throw "Connect Firebase…" (`localRepo.ts:114-116`); Login hides them | Yes — demo banner on Login |
| Push notifications | `NotificationSettings` returns `null` (`:35`) | **No** — section absent |
| AI bill reading | `readReceiptAi` → `null`; `AiScanToggle` → `null`; Profile hides "AI features" (`Profile.tsx:176`) | **No** — Scan quietly uses OCR; the `fellBack` toast never fires because `aiScanPossible()` is false |
| AI statement import | canned 6-row sample (`localRepo.ts:446-459`) | Yes — "Demo: shows a sample statement." (`StatementImport.tsx:184`) |
| Own Gemini key / admin | `aiKey` throws "AI features aren't available in the demo"; `saveAppAi` throws "Not in the demo" | n/a (sections hidden) |
| Shared FX rates | `getFxRates`/`refreshFx` → `null`; `src/lib/fx.ts` calls Frankfurter directly (network needed) | Partially — `RatesField` toast; works if online |
| Live tables | localStorage + `storage` event; `?guest=demo` link (`Table.tsx:235-239`) | Yes — "Demo: open as another phone" |
| Capture tokens / webhook | `submitToInbox` files straight into the inbox; `claimInbox` → 0; wizard simulates (`AutoCaptureSetup.tsx:407-432`) | Yes — "(demo, simulated)" |
| Apple Pay REST URL | `restUrl = ''` (`AutoCapture.tsx:56-58`) | Partially — block shows without a URL |
| Signed-out `/capture` with `t`+`u` | `canInbox` false → stashes and shows Login (`CaptureGuest.tsx:24`) | Yes — "Sign in to save ₹…" |
| Receipt attach | data URL in `localStorage`; quota failure swallowed (M6) | **No** |
| Avatar upload | data URL (256 px) ✓ | n/a |
| Account linking (`SignInMethods`) | hidden (`ProfileCards.tsx:65`) | No, but harmless |
| Activity / history / trash / disputes / approvals / comments / recurring / import / export | all work in `localRepo` ✓ | n/a |

Fix: M6 (a)–(c).

## 7. Already good (don't "fix")

- Both repos implement every non-optional `Repo` method; the method-name diff is only the optional Firebase-only ones (`linkGoogle`, `addPassword`, `signInAnonymously`) and `signInDemo`. Pure logic (`prepareExpenseSave`, `activity.ts`, `trust.ts`, `table.ts`, `fx.ts`) is shared so demo and Firebase behave identically.
- Every page and component is imported somewhere; no unreachable routes (`src/App.tsx` route table matches the pages directory).
- The only `TODO` in the repo (`functions/src/fx.ts:55`, App Check enforcement) is documented in `FIREBASE_SETUP.md:72` and `.env.production`.
- Deprecations are marked with `@deprecated` and the replacements named.
- The SMS parser, capture filters and AI config live in `shared/` and are re-exported for the client (`src/lib/sms-parse.ts`, `capture-filters.ts`, `ai-config.ts`) — one implementation, two bundles.
- Demo mode has honest banners where it matters most (Login, statement import, SMS wizard, live table).
- Rules tests cover the trust fields, FX `original`, tables, capture settings, push tokens, AI config and import; `hardening.test.ts` covers membership integrity including self-leave on the group doc.

## 8. Open questions for the product owner

1. **Creator leaving / ownership transfer.** `createdBy` is immutable by rule. Should a creator be able to hand the group to another member (a `transferOwnership` write allowed only by the current creator), or is "delete it" acceptable? This decides the Leave UI copy (item 2).
2. **Approval default for INR** (M1): ₹2,000? ₹5,000? Per-currency table or "always ask the user to type a threshold"?
3. **Remove-member semantics** (item 3): keep today's "never remove anyone who appears in an expense" (simple, safe) or build the former-members map so settled people can be removed?
4. **Open banking**: drop from the roadmap (`PLAN.md:118`, `AUTO_CAPTURE.md:302`) for an India-first app, or keep as a far-future AU item?
5. **Disputed + edited** (M2): is the intended rule "a flag survives edits until the flagger clears it" (current code) or "editing the money clears flags" (current Balances-tab text)?

---

### Appendix A — exported symbols only used in their own file (candidates for un-exporting; none are bugs)

Functions/consts: `src/hooks/data.ts` `catchUpRecurring`; `src/data/index.ts` `firebaseConfigured`; `src/lib/payments.ts` `upiQuery`, `UPI_APPS`; `src/lib/activity.ts` `describeChange`, `TRACKED_FIELDS`; `src/lib/table.ts` `validShares`, `MAX_NAME`; `src/lib/locale.ts` `detectFromBrowser`, `DEFAULT_REGION`, `DEFAULT_LOCALE`; `src/lib/trust.ts` `thresholdOf`, `moneyChanged`, `isTrashed`, `TRASH_DAYS`; `src/lib/sms-setup.ts` `IOS_VARS`, `MACRODROID_VARS`, `MACRODROID_PACKAGE`; `src/lib/greeting.ts` `SALUTATIONS`; `src/lib/accent.ts` `DEFAULT_ACCENT`, `DARK_THEME_COLOR`; `src/lib/colors.ts` `MEMBER_COLORS`; `src/lib/chartPalette.ts` `OTHER`; `src/lib/fx.ts` `reallocate`; `src/lib/balances.ts` `countable`; `src/pages/Capture.tsx` `captureHeadline`; `src/pages/AutoCaptureSetup.tsx` `parseSmsDemo`; `src/components/IconPicker.tsx` `GROUP_EMOJIS`; `shared/sms-parse.ts` `minorDigitsOf`, `findRef`, `findBank`; `shared/capture-filters.ts` `normaliseMinAmount`, `MAX_IGNORE_WORD_LEN`; `shared/ai-config.ts` `validModel`, `appKeyAllowed`, `withFallbacks`; `functions/src/capture.ts` `handleCapture`; `functions/src/lib/balances.ts` `isBalanced`; `functions/src/lib/request.ts` `deviceFromUserAgent`; `functions/src/lib/fx-core.ts` `FIRST_DATE`, `isIsoDate`.

Never used at all: `src/lib/locale.ts` `appRegion`; `src/lib/capture.ts` `CAPTURE_SOURCES`.

Types (exported, used only in-file, fine to keep for API clarity): `Unsub`, `NewGroup`, `RepoError`, `CaptureTokenOpts`, `SelectOption`, `ToastOptions`, `ReadResult`, `DayPart`, `GreetingState`, `Greeting`, `UpiApp`, `UpiParams`, `ImportSource`, `ImportedExpense`, `ImportedPayment`, `ParseOptions`, `GroupTypeInfo`, `CaptureParse`, `DueResult`, `LocaleInfo`, `TableItemView`, `PersonTotal`, `TableSplit`, `TableDraft`, `NotificationState`, `RecentsStorage`, `LastSplit`, `QrMatrix`, `AccentPreset`, `FxStorage`, `Converted`, `SmsDevice`, `WebhookReason`, `WebhookOk`, `ScopeCheck`, `DraftExpense`, `PhotoSource`, `CaptureStatus`, `SmsKind`, `SmsMethod`, `AppAiStatus`, `CaptureLogResult`, `CaptureResponse`, `CapturePrefs`, `Device`, `EcbRates`, `RefreshPlan`, `ExpenseRecipient`, `GeminiErrorKind`, `GeminiModelInfo`, `CaptureExtra`, `Interpretation`, `ScopeResult`.
