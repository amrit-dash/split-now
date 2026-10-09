# 10 · Product strategy and USP feature brainstorm — Split Now

Lens: product strategy, competitive landscape, candidate differentiators, admin-console scope, build-now recommendation.
Method: read README.md, docs/PLAN.md, docs/RESEARCH.md, docs/AUTO_CAPTURE.md, every `src/pages/*.tsx`, the admin surface (`src/components/AdminAi.tsx`, `functions/src/ai.ts`, `shared/ai-config.ts`, `firestore.rules`), the push/reminder functions, and the pure libs that the proposals below would touch. Web research (Oct 2026) on Splitwise, Settle Up, Tricount, Splid, Spliit, Kittysplit, SplitMyExpenses, Plates, Tab, Paytm Split Bills, Google Pay bill split, PhonePe Split Expense, Splitkaro, WhatsApp bots, and NPCI's UPI rule changes. Confidence tags: [Certain] read in code or on an official page · [Likely] secondary source or strong inference · [Guessing] gap-filling.

## 1. Summary and verdict

Split Now is already past "Splitwise parity" on the axes that matter for an Indian friend group: free unlimited entries, exact-amount UPI QR + app deep links at settle-up, free on-device OCR with an optional Gemini upgrade (bring-your-own key), a live table split that needs no account, a bank-SMS capture inbox, locked-FX multi-currency with shared ECB rates, and a trust layer (soft delete, disputes, approvals, activity log) that no consumer competitor has. Where it is behind: it needs a sign-in for everything except tables (Tricount/Splid/Kittysplit join by link), it cannot move money (Splitwise Pay by Bank, Tricount via bunq, Paytm in-app UPI), there is no leave/archive group, and the "remind" action is a plain share-sheet text that links to the group page rather than a prefilled payment screen.

The single most important external fact for the roadmap: **NPCI stopped person-to-person UPI collect requests on 1 Oct 2025** [Likely, multiple outlets; no post-deadline reversal found]. "Request money" inside GPay/PhonePe is gone or neutered for friends, and the task's "UPI collect-request deep links" idea is dead on arrival. That is an opening: Split Now can be *the* way an Indian friend asks for money, by sending a link that opens the payer's own settle screen with the amount prefilled and a scannable QR, plus a WhatsApp-ready card. Everything needed for that already exists in `SettleUp.tsx` (query-param prefill) and `payments.ts` (intent + QR); only the link/card wrapper is missing.

Verdict: do not chase parity items (custom categories, Excel export, bank sync). Lean into (1) the settle-up moment, (2) friend-group etiquette (round-down, nudges, acknowledgement, fairness), (3) the trip/flat scenarios Indian groups actually live in, and (4) an admin console so a single developer can run this for other people without the Firebase console. Five concrete builds are in §5.

## 2. Competitor matrix

Legend: ✅ has it · 🟡 partial / paid · ❌ no · ? unverified. "SN" = Split Now (from code). Competitor cells from the sources in §2.3; treat vendor blogs with caution.

| Capability | SN | Splitwise | Settle Up | Tricount | Splid | Spliit (OSS) | Kittysplit | SplitMyExpenses | Paytm Split Bills | GPay bill split | Splitkaro |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Free, no daily cap, no ads | ✅ | ❌ (~3–4/day + 10 s cooldown + ads; Pro ₹149/mo or ₹999/yr India, 2023 figure) | 🟡 (ads; Premium) | ✅ | 🟡 (1 free group) | ✅ | 🟡 (≤9 people free) | 🟡 ($3.99/mo tier) | ✅ | ✅ | 🟡 (subs) |
| Join without an account | 🟡 (tables only) | ❌ | 🟡 (view-only link) | ✅ (link) | ✅ (code) | ✅ (link) | ✅ (link) | ❌ | ❌ (Paytm users) | ❌ (GPay users) | ❌ |
| Placeholders + claim on join | ✅ | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ | ? | ? | ❌ | ? |
| Split types (equal/exact/%/shares/adjust/itemized) | ✅ all 6, multi-payer | 🟡 (itemized Pro) | ✅ most | 🟡 (custom splits dropped) | ✅ | ✅ | ✅ | ✅ | ✅ 4 | 🟡 equal/custom | ✅ item-wise |
| Simplify debts + explainable graph | ✅ before/after graph | 🟡 black box | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ❌ | ✅ |
| Cross-group netting | ✅ | 🟡 (friend balances, no one-tap net) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UPI settle: exact-amount QR + GPay/PhonePe/Paytm intents | ✅ | ❌ (external; some Paytm link) | 🟡 ("Pay via bank app") | ❌ | ❌ | ❌ | ❌ | ❌ (Venmo/Zelle) | ✅ in-app Paytm UPI | ✅ in-app | 🟡 |
| In-app money movement | ❌ (by design) | 🟡 Pay by Bank (UK/DE/AT via Tink), Splitwise Pay (US) | ❌ | 🟡 (bunq) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Receipt OCR | ✅ free on-device + Gemini | 🟡 Pro | 🟡 (photos, Premium) | ❌ | ❌ | ✅ (OpenAI, optional) | 🟡 paid | 🟡 AI, paid | ❌ | ❌ | 🟡 |
| Payment-screenshot → settlement | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bank/UPI statement screenshots → many expenses | ✅ (Gemini) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🡒 bank link (US) | ❌ | ❌ | 🟡 SMS drafts |
| Auto-capture from bank SMS / card | ✅ SMS webhook (iOS Shortcut / MacroDroid) | 🟡 (US transaction import, Pro) | ❌ | ✅ bunq card | ❌ | ❌ | ❌ | ✅ card link (US) | 🟡 (own UPI) | 🟡 (own UPI) | ✅ SMS drafts |
| Live "tap what you had" at the table | ✅ QR, anonymous guests | 🟡 Plates (separate app, ≤10, stale) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delivery-app bill import (Swiggy/Zomato) | 🟡 (share screenshot → AI) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ one-tap fetch |
| Multi-currency with locked rate | ✅ ECB, shared | 🟡 Pro | ✅ | ✅ | ✅ 150+ | 🟡 | 🟡 paid | ✅ | ❌ | ❌ | ❌ |
| Recurring expenses | ✅ (client catch-up) | ✅ | 🟡 Premium | ❌ | ❌ | ❌ | ❌ | 🟡 (10 free) | ❌ | ❌ | ? |
| Comments | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ? | ❌ | ❌ | ? |
| Activity feed + per-field edit history | ✅ | 🟡 feed only | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Undo / trash / restore | ✅ 30 days | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dispute flag / approval above threshold | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Insights/charts | ✅ free | 🟡 Pro | 🟡 Premium | ❌ (dropped) | 🟡 | ❌ | ❌ | ✅ | 🟡 summary | ❌ | ✅ |
| Budget per group | ✅ bar (no alerts) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Export | 🟡 CSV only | ✅ CSV (JSON backup) | 🟡 CSV/Excel | ❌ (dropped) | 🟡 PDF free, Excel paid | ✅ CSV | ? | ? | ❌ | ❌ | ❌ (complaint) |
| Import from Splitwise | ✅ CSV with balance check | — | ❌ | ✅ | ❌ | ❌ | 🟡 by email | ? | ❌ | ❌ | ❌ |
| Push notifications | ✅ web push (installed PWA on iOS) | ✅ native | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Reminders / nudges | 🟡 weekly auto push; manual = share text | ✅ | ✅ auto | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ in-app | ✅ | ? |
| "Who should pay next" | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leave / archive group | ❌ (planned) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ? | ? |
| Offline | ✅ cache; writes queue | 🟡 | ✅ | ✅ | ✅ full | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (complaint) |
| Native app / widgets | ❌ PWA; manifest shortcuts | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hindi / Hinglish UI | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ✅ Hinglish | ? |
| Demo mode without backend | ✅ | ❌ | ❌ | ❌ | ❌ | 🟡 self-host | ❌ | ❌ | ❌ | ❌ | ❌ |

### 2.1 Where Split Now is clearly ahead [Certain, from code]
- Settle-up is the best in the category for India: `payOptions()` in `src/lib/payments.ts` builds `upi://pay` with amount + note, app-specific `tez://`, `phonepe://`, `paytmmp://` links, and the same string as an on-device QR (`src/lib/qr.ts`, no dependency). Reading a GPay/PhonePe success screenshot straight into a settlement (`parsePaymentScreenshot`) is unique.
- Capture pipeline: SMS → webhook → inbox → "is this a trip expense?" with per-user filters, trip windows, idempotency, and Gemini as a parser fallback (`functions/src/capture.ts`). Only Splitkaro's "SMS drafts" and Tricount's bunq card come close, and neither does trip-window matching.
- Trust layer: soft delete + Undo, per-field history, disputes, approvals above a threshold, append-only activity — enforced in `firestore.rules`, not just UI. Nobody else has this.
- Live table split with anonymous guests and "finish into an itemized expense" (`src/pages/Table.tsx`, `src/lib/table.ts`).
- Statement import: GPay/PhonePe history screenshots → list of flagged transactions (`src/components/StatementImport.tsx`, `src/lib/statement.ts` with `maybe_added` duplicate detection).
- Cross-group netting with one real payment (`src/pages/Friends.tsx`).
- Splitwise CSV import that reconstructs payer/share splits and verifies balances against Splitwise's totals.
- Free Insights, free FX, free OCR — everything Splitwise charges for.

### 2.2 Parity and behind
- Parity: groups/placeholders/invite, six split types, simplify, comments, categories, recurring, CSV export, push, budget bar, weekly reminders.
- Behind (honest):
  1. **Account required** for anything but tables; Tricount/Splid/Kittysplit onboard a reluctant friend from a link. The invite flow is good (`Login.tsx` invite banner, return path) but it is still a sign-up.
  2. **No in-app payment** (by design; needs a licensed PSP). Paytm Split Bills (Jul 2026) and GPay bill split settle in-app for their own users. Split Now's answer must be "pay with *your* app in two taps", and it is already close.
  3. **Remind = share text** (`GroupDetail.tsx:56`) that links to `/groups/{id}`, not to a prefilled settle screen, and there is no push nudge a creditor can trigger.
  4. **No leave/archive/remove-with-balance-check** (planned ⏳ in PLAN §3.2). Users expect it.
  5. Reminder policy is hard-coded (`functions/src/config.ts:21` REMINDER: ₹500, 7 days, 7-day cooldown) and not per-group or per-user tunable.
  6. No "who should pay next" (Settle Up), no custom categories (Settle Up Premium), no Excel/PDF export (Splid/Settle Up), no Hindi/Hinglish (GPay), no delivery-app order fetch (Splitkaro).
  7. PWA limits: no home-screen widgets (PWA widgets are still a W3C/Edge explainer [Likely]); iOS push needs install; no SMS reading without Shortcuts/MacroDroid.

### 2.3 What users complain about (Splitwise and others)
- Daily cap (~3–4 free expenses, varies by region) plus a 10-second cooldown and interstitial ads; features that were free (receipt scan, itemized, charts, currency) moved to Pro; Pro is per user, so a 6-person trip pays 6×. Trustpilot reviews from 2023–2025 and Kimola's Play Store digests repeat these. Sources: getfinny.app/blog/best-splitwise-alternatives-2026, hipposplit.com/blog/splitwise-review, kimola.com reports, itvoice.in (India pricing), trustpilot.com/review/splitwise.com.
- Travellers hit the cap hardest (many expenses in one day). Roommates want recurring bills without paying.
- Settling "outside the app" and then forgetting to mark it (Splitwise outside Tink markets; Tricount/Splid/Settle Up everywhere in India) — tricount.com's own India comparison admits this.
- Friends who refuse to install another app or create an account (every link-based competitor markets this).
- Splitkaro: crashes, no offline, no export (Play reviews via chrome-stats). Splid: one free group, no real-time sync complaints. Tricount: dropped exports/stats/custom categories when it went free.
- New 2026 entrants (HippoSplit, SplitterUp, Finny, Splitfair, Splitty, FairSplit) all market "no daily cap + AI receipt scans + Splitwise import" — the cap is the wedge everyone is using. Split Now already has all three; the differentiation has to come from UPI and etiquette, not from the cap.
- India-specific: Paytm Split Bills (launched 29 Jul 2026, free, unlimited, 4 split types, in-app UPI prefilled settle, reminders) is the new bar for "simple + settles in-app" [Likely, paytm.com/blog + exchange filing]. Google Pay bill split (2021, ≤20 people, creator collects) relied on collect requests; its status after the NPCI P2P collect ban is unclear [Guessing]. PhonePe Split Expense exists (non-users can't see details). WhatsApp bots (SplitBot, SplitChat, WhatsYourShare) log expenses from chat.

## 3. Ranked candidate USP features

Each: user problem · why competitors don't · fit in this codebase · effort (S ≤ 1 day, M 2–4 days, L a week+) · risk · why it zings. "Client-only" = no Cloud Functions change; "Rules" = `firestore.rules` change + a rules test.

### 1. "Pay me" link + WhatsApp-ready settle card — S/M, client-only
- Problem: after NPCI killed P2P collect requests (1 Oct 2025), there is no clean way to *ask* a friend for ₹1,233.33 over UPI. People type amounts into WhatsApp and the payer retypes them into GPay.
- Why not others: Splitwise/Tricount/Splid don't do UPI; Paytm/GPay only work inside their walled garden; nobody renders a shareable card.
- Fit: `SettleUp.tsx:71` already prefills from `?from=&to=&amount=`. Change `remind()` in `GroupDetail.tsx:56` to share `/groups/{id}/settle?from={debtor}&to={me}&amount={paise}` so the tap lands on the QR + app buttons. Then render a PNG card with `<canvas>` (group emoji/name, "You owe Amrit ₹1,233.33", the UPI QR from `encodeQr`, "Open in Split Now") and share it with `navigator.share({ files })` — `deliverCsv()` in `src/lib/export.ts:94` already has the file-share + fallback pattern. For a debtor who hasn't joined (placeholder member), add a signed-out page `/r/{code}` backed by `requests/{code}` (shape below) that shows amount + QR + intents without an account, same access model as `tables/{code}`.
- Risk: iOS Safari share-with-files needs 15+; UPI apps may warn on link-initiated P2P (already documented in `payments.ts`); the request doc exposes a UPI ID to anyone with the code (same as showing it at the table). Keep the code 10+ chars and expire in 7 days.
- Zings: "Splitwise can't do this, and GPay can't do it any more."
- Data: `requests/{code} = { code, groupId, from: memberId, to: memberId, toUid, amount, currency, note, upi?, groupName, emoji, createdAt, expiresAt, paidAt? }`. Rules: create by a group member whose uid is `toUid`; `get` by anyone signed in (anonymous OK) while unexpired; no list; update only `paidAt` by the creator.

### 2. Settle etiquette: round-down + waive the remainder — S, client-only
- Problem: debts come out as ₹1,233.33. Indian friends pay ₹1,230 or ₹1,250 and nobody wants ₹3.33 hanging around for months; today the group shows "owes ₹3.33" forever.
- Why not others: Splitwise shows exact cents and leaves it; Settle Up has "round" in simplification settings but doesn't record a waiver.
- Fit: in `SettleUp.tsx`, next to "Use", add chips "₹1,230" / "₹1,250" (`roundSettle(amount, [10, 50, 100])` in a new pure `src/lib/settle.ts`, unit-tested). On save, if `amount < owed` and the user ticked "Waive the rest", write a second settlement `{ amount: owed - paid, method: 'Waived', note: 'Rounded down' }`. Rules already accept any `method` string and require `amount > 0` (`firestore.rules` settlements). Show "₹3.33 waived" in the activity text (`src/lib/activity.ts` settlement.created wording).
- Risk: none technical; socially, make the waiver the *payee's* choice when they are the one recording, and the payer's proposal otherwise ("Rohan rounded down ₹3.33 — OK?" could reuse the comment thread).
- Zings: it encodes how Indian friends actually settle.

### 3. Push nudge + adaptive reminders — S/M, Functions
- Problem: the creditor's only tool is a share-sheet text; the automatic weekly nudge is one-size (₹500 / 7 days / 7-day cooldown, `functions/src/config.ts:21`).
- Why not others: Splitwise reminders are generic; nobody adapts cadence to behaviour.
- Fit: new callable `nudge({ groupId, debtorMemberId })` in `functions/src/` using `sendToUser()` (`functions/src/push.ts:18`) with a per-pair rate limit in `rateLimits/nudge_{gid}_{uid}` via `applyRateLimit()` (`functions/src/lib/ratelimit.ts`), copy in `notify-text.ts` ("Amrit nudged you: ₹1,233.33 for Goa — pay in one tap"), URL = the prefilled settle screen from #1. Then make `reminderTargets()` (`functions/src/lib/balances.ts:57`) read thresholds from `config/reminders` (admin-editable, §4) and tighten the cooldown for members whose median days-to-settle (computable from settlements vs. the activity log) is above the group median.
- Risk: nagging; cap at 1 manual nudge per debtor per group per 3 days, and let the debtor mute a group (`users/{uid}/settings/notifications.mutedGroups[]`, rules key allow-list update).
- Zings: the awkward WhatsApp message becomes a tap, and the app learns who needs it.

### 4. IOU acknowledgement (payee confirms receipt) — M, Rules
- Problem: anyone can record "Rohan paid Amrit ₹500"; the payee has no way to say "yes, got it" or "no, I didn't". Trust is the app's theme and this is the hole.
- Why not others: Splitwise lets anyone record payments too; Settle Up/Tricount the same.
- Fit: add `confirmedBy?: uid, confirmedAt?: number` to `Settlement` (`src/types.ts`). Rules: a second update branch on `settlements/{id}` allowing only those two keys, `confirmedBy == uid()` and `groupDoc().members[to].uid == uid()` (mirror `isFlagOrApproval` structure). UI: "Confirm received" chip in `ActivityList` for the payee; unconfirmed settlements older than 48 h show a soft "unconfirmed" badge via `TrustBadges`. Push `onSettlementCreated` already targets the payee (`functions/src/triggers.ts`); add the confirm action URL.
- Risk: moderate rules work + test in `tests/firestore.trust.test.ts`; don't block balances on confirmation (keep it informational, like disputes).
- Zings: "every payment is acknowledged by the person who got it" — a receipt, not a claim.

### 5. Duplicate-expense detection — S, client-only
- Problem: SMS capture, statement import, table finish and manual entry all create expenses; two people at the same dinner both add "Dinner ₹2,400". Splitwise reviewers complain about duplicates on trips.
- Why not others: only SplitMyExpenses/bank-link apps dedupe, and only against their own imports.
- Fit: `findDuplicate()` already exists in `src/lib/statement.ts:26` (`maybe_added`). Lift it to `src/lib/dupes.ts`, call it in `ExpenseForm` on amount/date change (same group, same amount ±1%, date ±1 day, not the expense being edited) and show "Looks like 'Dinner at Toit' added by Priya yesterday — add anyway / open it". Also run it in `Inbox` capture cards and `TableFinish`.
- Risk: false positives on rent-like recurring amounts; exempt `recurringFrom` occurrences.
- Zings: quiet, but it is the top trip-group annoyance.

### 6. Merchant memory + cross-group auto-categorisation — S, client-only
- Problem: `guessCategory()` is a regex over Indian merchants; `pastCategory()` (`src/lib/recents.ts:165`) only remembers within one group. Users correct "Blue Tokai → Food" every time in a new trip.
- Why not others: Spliit uses OpenAI for categories (paid); Splitwise has none.
- Fit: a per-user merchant map in `users/{uid}/settings/merchants` (`{ [normalisedMerchant]: { category, description, n } }`, ≤300 keys, rules key allow-list like `settings/notifications`) updated on every save; consulted before `guessCategory`. Also use it to prettify SMS merchants ("ZOMATO LTD" → "Zomato") in `Inbox`.
- Risk: none; keep it client-side and bounded.
- Zings: second time you pay the same place, the form is already right.

### 7. Fairness insights: "who fronts the money", "whose turn to pay" — S/M, client-only
- Problem: in a friend group one person always pays and waits; Insights has paid-vs-share per member (`Insights.tsx`) but not time-to-settle or a "turn" suggestion.
- Why not others: Settle Up has "who should pay next"; nobody has days-to-settle.
- Fit: pure `src/lib/fairness.ts`: per member — total fronted (paid − share), median days from expense `createdAt` to the settlement that cleared it (approximate via activity entries), and `nextPayer(net)` = the largest debtor. Surface in the group header ("Rohan's turn to pay 🍽️") and an Insights card; keep it private (not pushed) and good-humoured.
- Risk: the task's "trust score" idea is socially corrosive if public; keep it per-group, descriptive, and never a number on a person's avatar.
- Zings: "whose turn" ends the awkward pause when the bill arrives.

### 8. Group budget alerts with push — S/M, Functions
- Problem: `BudgetBar` (`GroupDetail.tsx:205`) is passive; trips blow the budget silently.
- Why not others: budgets are rare in this category (SplitMyExpenses only).
- Fit: in `onExpenseCreated` (`functions/src/triggers.ts`), if `group.budget`, sum live expenses (one query) and if crossing 80 % / 100 % and `budgetState/{gid}.last < threshold`, push all members ("Goa trip is at 82 % of ₹60,000"). State doc server-only like `reminderState`. Also surface "per-day burn vs days left" on the bar for trips with dates (client-only, `S`).
- Risk: extra reads per expense create (bounded by group size).
- Zings: the trip treasurer finally has a dashboard.

### 9. Trip timeline (day-by-day with receipts and photos) — M, client-only
- Problem: a trip is a story; the list is flat. Receipts (`receiptUrl`) and dates already exist.
- Why not others: nobody in this category does a timeline; it is a "memories" feature.
- Fit: a `Timeline` tab in `GroupDetail` for groups with `startDate/endDate`: group expenses by day (`formatRange`, `isLiveTrip` helpers in `src/lib/capture.ts`), day totals, category emoji strip, receipt thumbnails; "Day 3 · Coorg · ₹4,820 · 🍽️🚕🏨". Share a day or the trip as an image (reuse the canvas card from #1).
- Risk: Storage needs Blaze (already on Blaze); large receipts → use the existing 1600 px downscale.
- Zings: the end-of-trip recap people actually post.

### 10. Home-group template: recurring presets, rent escalation, deposit tracking — M, client-only (escalation touches `recurrence.ts`)
- Problem: the Bengaluru-flat persona (PLAN §2) sets up rent/maid/wifi/BESCOM by hand every time; rent steps up yearly; the deposit is a shared asset nobody tracks.
- Why not others: Settle Up charges for recurring; Splitwise has no templates; Splid/Tricount have no recurring at all.
- Fit: on `GroupForm` for `type === 'home'`, a "Set up monthly bills" sheet creating recurring templates (rent, maid, cook, wifi, electricity, maintenance) with `shares`/`equal` splits (`makeOccurrence` in `src/lib/recurrence.ts`). Escalation: `recurrence.escalation?: { percent, everyMonths, anchorDate }` and `makeOccurrence` re-allocates `paidBy/splits` with `allocate()`; rules don't validate `recurrence` keys today, so this is client-only (add a rules key check while there). Deposit: `group.deposits?: { [memberId]: cents }` + "Deposit returned" flow that records settlements; rules: any member may edit `deposits` (same class as `captureOff`).
- Risk: escalation edge cases (month clamping already handled); deposits are not debts so keep them out of `netBalances`.
- Zings: "set up the flat in one tap" is the roommate hook Splitwise never built.

### 11. Shared shopping list → one expense — M, Rules
- Problem: groceries for a trip/flat are planned in WhatsApp and then re-typed as an itemized expense.
- Why not others: no splitter has a list; list apps don't split.
- Fit: `groups/{gid}/lists/{id}` with items `{ name, qty, forMembers[], price?, boughtBy?, boughtAt? }`; "Convert bought items to an expense" builds an `itemized` `splitInput.items` via the existing `computeSplits` path and `SplitBill` UI. Rules: members read/write, key allow-list, ≤200 items.
- Risk: scope creep; ship the minimum (checkbox list + convert).
- Zings: the list becomes the receipt.

### 12. Consumption presets (drinkers / veg / "I only had starters") — S, client-only
- Problem: the most common Indian split argument: alcohol only for the drinkers, rest equal. Today that is a manual itemized or exact split.
- Why not others: Plates/Tab do it item by item; nobody has a two-bucket preset.
- Fit: in `ExpenseForm` split picker, a "Two buckets" preset that builds two `items` ("Drinks ₹X → selected", "Everything else → everyone") and saves as `itemized`; the math (`computeSplits` itemized + proportional tax) already exists. Remember the drinkers set per group via `recents.ts`.
- Risk: none.
- Zings: solves the fight in two taps.

### 13. Year-in-review share card — M, client-only (⏳ already in PLAN §3.6)
- Fit: pure `src/lib/yearReview.ts` over `useAllGroupData` (trips, total shared, top friend, biggest night out, fastest settler), canvas PNG via the #1 card renderer, share sheet. Gate by December or on demand.
- Risk: vanity; cheap once #1 exists.
- Zings: free marketing in WhatsApp statuses.

### 14. "I'll pay later" promise with a reminder — M, Functions
- Fit: `groups/{gid}/promises/{id} = { from, to, amount, date, createdBy }` (rules: creator is `from`), shown on the debt row ("Rohan: paying on 1 Nov"), `dailyReminders` pushes both sides on the date and skips the generic nudge until then.
- Risk: low; the social contract is the feature.
- Zings: turns "yaar next week" into a dated commitment.

### 15. Read-only snapshot link for a non-member (parents, the trip's accountant) — M, Rules
- Fit: don't add a viewer role to `memberUids` (that grants writes); instead a `snapshots/{code}` doc written by a member with a frozen summary (balances, totals, last 50 expenses, no payment handles), readable by anyone signed in (anonymous OK) for 30 days — the `tables` access pattern again.
- Risk: data leakage via the code; keep names first-name only and no receipts.
- Zings: "send Papa the trip accounts" without an account.

### 16. Voice / natural-language quick add — M, Functions (optional)
- Fit: Web Speech API (`webkitSpeechRecognition`) on Android Chrome; iOS Safari support is patchy [Likely]. Parse "450 dinner, split with Rohan and Priya" with a small grammar in `src/lib/nlAdd.ts` (amount, description, names → members via `matchMember`), fall back to a new `kind: 'text'` in `parseReceiptAi` with a tiny schema. Entry point: a mic button in `CreateSheet`.
- Risk: Hinglish recognition; free-text parsing errors. Always lands in the form for confirmation (the app's existing rule).
- Zings: fastest entry on a moving bus.

### 17. Google Sheets / spreadsheet export — S for "copy as table", L for live Sheets
- Fit: S: a "Copy as table" (TSV) next to "Export CSV" (`groupCsv` already produces the rows). L: Sheets API with the Google sign-in token needs an extra OAuth scope and a token refresh path; or a Cloud Function with a service account writing to a user-shared sheet. The CSV share sheet already lands in Drive on Android.
- Risk: L is not worth it now.
- Zings: the flat's "accounts" tab stays in sync.

### 18. One-tap quick-add from iOS Shortcuts / Android — S, client-only
- Fit: the `/capture?amount=&merchant=&group=` contract (`src/lib/capture.ts`) already files a capture; document "Add ₹ to Goa" Shortcuts and a `/add?amount=&desc=&group=` prefill (`ExpenseForm` reads `group`, `again`, `capture` today; add `amount`, `desc`). Manifest shortcuts already exist (`vite.config.ts:36`). Real home-screen widgets are not possible for a PWA [Likely].
- Zings: Siri, "log 300 chai to the flat".

### 19. Settle in a different currency — M (⏳ PLAN §4.1a)
- Fit: `original` on settlements, FX-aware `SettleUp` using `getRate()`; rules extension mirroring `validOriginal`. Matters once the group travels abroad; not for the first Indian cohort.

### 20. Hinglish / Hindi UI and amount words — L
- Fit: no i18n layer exists; strings are inline. GPay's Hinglish is the only precedent. Defer; note that `formatMoney` already does lakh grouping.

Not recommended: a public trust score (see #7), in-app money movement (licensing), native SMS reading (Play policy), Swiggy/Zomato account linking (fragile scraping; Splitkaro's reviews show sync problems — prefer "share the order screenshot", which already works via the share target + Gemini).

## 4. Admin console scope

### 4.1 What exists today [Certain]
- `admins/{uid}` created by hand in the Firebase console; `isAdmin()` in `firestore.rules:11`; the client learns it from the `aiStatus` callable (`functions/src/ai.ts:212`, `isAdmin` at :107) and `admins/{uid}` is self-readable (`firestore.rules:125`).
- One config doc, `config/ai` (`shared/ai-config.ts` `AppAiConfig`: mode off/everyone/allowlist, allowEmails ≤200, images, sms, model, perDay, perHour), with a key allow-list and ranges in rules (`firestore.rules:112`), edited by `AdminAi.tsx` inside a Profile collapsible (`Profile.tsx:181`).
- Usage counters `stats/ai_{day}` written by `record()` (`functions/src/ai.ts:64`), admin-read-only (`firestore.rules:130`); only "today" is shown.
- Everything else operational is hard-coded: capture rate limits (`functions/src/config.ts:18`), reminder policy (:21), allowed origins (:8), own-key AI limits (`functions/src/ai.ts:28`), region defaults (`src/lib/locale.ts`, `src/lib/payments.ts`).
- No feature flags, no announcement banner (the `UpdatePrompt` is SW-only), no maintenance mode, no invite-only mode, no block list, no project-wide AI cost cap, no user/group counts.

### 4.2 Proposed scope (v1, coherent with the existing `config/*` + `stats/*` + `admins/*` pattern)
Move the admin surface to a lazy `/admin` route (`src/pages/Admin.tsx`), reachable from Profile when `admins/{uid}` exists, with five cards: **Status & stats**, **Flags & switches**, **Announcement**, **AI** (existing `AdminAi`), **Limits & policy**, plus **People** (block/approve) behind a callable.

Firestore documents (all under `config/`, all readable by signed-in users unless noted, writable by admins only with per-doc validators):

```
config/app                                   ← read: everyone incl. signed-out (Login shows maintenance/announcement)
  maintenance:  { on: bool, message: string≤300 }
  minVersion:   string            ← semver; client compares with __APP_VERSION__ (vite.config.ts define) and forces the UpdatePrompt
  announcement: { id: string, text: string≤300, level: 'info'|'warn', url?: string, from: int, until: int } | null
  flags: {                        ← feature flags; client reads via useFlags(); server reads where relevant
    liveTables: bool, autoCapture: bool, aiReading: bool, statementImport: bool,
    payLinks: bool, nudges: bool, budgetAlerts: bool, insightsFairness: bool
  }
  signups: 'open' | 'invite'      ← invite-only mode (see 4.4)
  updatedAt: int, updatedBy: string

config/limits                                ← read: signed-in; used by functions
  capture:   { perHour: int, perDay: int, enabled: bool }       ← replaces RATE_LIMIT
  nudge:     { perPairDays: int, enabled: bool }
  ai:        { projectPerDay: int, ownPerHour: int, ownPerDay: int }  ← project-wide cap + OWN_LIMIT
  push:      { perUserPerDay: int }
  updatedAt, updatedBy

config/reminders                             ← read: signed-in; used by dailyReminders
  enabled: bool, minAgeDays: int, cooldownDays: int, hourIST: int,
  threshold: { INR: int, default: int }, adaptive: bool

config/ai                                    ← existing, plus:
  models?: { receipt: string, statement: string, sms: string }, killSwitch?: bool

config/regions                               ← optional v2: { IN: { currency, methods[] }, AU: {...}, INTL: {...} }

stats/ai_{day}         ← existing: app, own, app_images, own_sms, errors
stats/capture_{day}    ← received, stored, pushed, by reason (not_a_debit, outside_trip, …), ai_fallbacks
stats/push_{day}       ← sent, failed, deadTokens
stats/users_{day}      ← newUsers, activeUsers (users with a write), groupsCreated, expensesCreated
blocked/{uid}          ← { reason, at, by } server-written; rules deny every write by a blocked uid
```

### 4.3 Rules needed
Generalise the `config` match so each doc has its own validator and `config/app` is public:

```
match /config/{id} {
  allow read: if id == 'app' || signedIn();
  allow write: if isAdmin() && (
       (id == 'ai' && validAiConfig(request.resource.data))
    || (id == 'app' && validAppConfig(request.resource.data))
    || (id == 'limits' && validLimits(request.resource.data))
    || (id == 'reminders' && validReminders(request.resource.data)));
}
function validAppConfig(d) {
  return d.keys().hasOnly(['maintenance','minVersion','announcement','flags','signups','updatedAt','updatedBy'])
    && d.get('maintenance', {on:false}).on is bool
    && d.get('minVersion', '0.0.0') is string && d.get('minVersion','0.0.0').size() <= 20
    && (d.get('announcement', null) == null || (d.announcement.text is string && d.announcement.text.size() <= 300 && d.announcement.level in ['info','warn']))
    && d.get('flags', {}) is map && d.get('signups', 'open') in ['open','invite'];
}
// Maintenance and blocking: one extra get() per write; fine at this scale.
function writesOpen() {
  return isAdmin() || (
    !get(/databases/$(database)/documents/config/app).data.get('maintenance', {on:false}).on
    && !exists(/databases/$(database)/documents/blocked/$(request.auth.uid)));
}
```
Then `&& writesOpen()` on `groups` create/update, `expenses`/`settlements`/`activity`/`comments` create/update, `tables` create/update, `captureTokens` create, and `users/{uid}` create (invite-only, below). Add `tests/firestore.admin.test.ts` mirroring `firestore.ai.test.ts`. Note the rules file already pays one `groupDoc()` get per write, so the budget impact is one more small read.

### 4.4 Behaviours
- **Flags**: `useFlags()` hook (`onSnapshot(config/app)`, cached in memory + localStorage so first paint is right) and a `flag('liveTables')` guard in `CreateSheet`, `App.tsx` routes and `Scan.tsx`. Functions read the same doc in `capture`/`parseReceiptAi` so a flag is a real kill switch, not just a hidden button.
- **Maintenance mode**: banner above the tab bar (reuse `UpdatePrompt` styling), `repo` wrapper turns writes into a toast ("Split Now is in read-only mode for a few minutes"), rules enforce via `writesOpen()`.
- **Min version**: if `config/app.minVersion > __APP_VERSION__`, show the update banner in forced mode (no "Later") — the SW update handshake already exists in `UpdatePrompt.tsx`.
- **Announcement**: `announcement.id` dismissed in localStorage; shown on Home and Login.
- **Invite-only**: two workable options. (a) Soft: `signups: 'invite'` makes the Login screen show "invite only" unless the path is `/join/{code}` or the email is in `config/access.allowEmails` (checked by a callable `canSignUp({email})`, since clients can't list anything); `groups` create rule additionally requires `get(users/uid).data.approved == true` and admins approve from the People card via a callable `adminApproveUser`. (b) Hard: an Auth blocking function `beforeUserCreated` (needs Identity Platform upgrade; free at this scale [Likely]) that rejects sign-ups unless an invite exists or the email is allow-listed. Recommend (a) now, (b) later.
- **Abuse controls**: `adminBlockUser({uid})` callable writes `blocked/{uid}`, disables the Auth user (`auth().updateUser(uid, { disabled: true })`), revokes refresh tokens, deletes `pushTokens` and `captureTokens`. "Revoke all capture keys" and "Pause capture for everyone" (`config/limits.capture.enabled=false`) buttons.
- **Quotas and cost caps**: `functions/src/ai.ts withAi()` additionally checks `stats/ai_{day}.app < config/limits.ai.projectPerDay`; `capture` reads `config/limits.capture`; `sendToUser` reads `push.perUserPerDay`. Optional L: Billing budget → Pub/Sub → function that flips `config/ai.killSwitch` at 100 % of budget.
- **Usage stats**: a callable `adminStats()` (Admin SDK, admins only) returning counts of `users`, `groups`, expenses in the last 7/30 days (collection-group `count()` aggregates), push tokens, pending captures, plus the last 14 `stats/*` docs for sparklines. Avoids opening `users` to `list`.
- **Model selection**: keep `config/ai.model` for the project key; add per-feature overrides and a "Test with sample bill" button (calls `parseReceiptAi` with a bundled image).
- **Audit**: every admin write records `updatedBy`; the Admin page shows "changed by X, 3 h ago" from the doc.
- **Per-region defaults**: v2 only; the `IN/AU/INTL` tables in `src/lib/locale.ts` and `payments.ts` can later be seeded from `config/regions`.

Effort: v1 (route, `config/app` + `config/limits` + `config/reminders`, flags hook, maintenance banner, announcement, min-version, rules + tests, `adminStats` callable) ≈ M–L (4–6 days). Blocking, invite approval and cost auto-kill are each S–M on top.

## 5. Top-5 to build now (single developer, Indian friend group first)

1. **Pay-me link + WhatsApp settle card (§3 #1), with the remind button fixed first.** One-line win today: point `remind()` at `/groups/{id}/settle?from=&to=&amount=`. Then the canvas card + file share. Reason: it is the moment friends actually feel the app, it is unique after the NPCI change, it is client-only, and it reuses `payments.ts`, `qr.ts`, `export.ts`'s share pattern. Add `/r/{code}` for placeholders only if the first week shows non-members are the common debtor.
2. **Round-down + waive (§3 #2) and "whose turn" (§3 #7, the `nextPayer` half).** Both are S, pure-lib + UI, test-friendly, and they make the app feel Indian rather than translated. Ship together under a "Settle etiquette" label.
3. **Push nudge with rate limit + `config/reminders` (§3 #3).** The push plumbing (`sendToUser`, prefs, tokens) is done; this is a 150-line callable plus copy. Make the daily reminder read its thresholds from Firestore in the same change — that is the first real admin setting and it de-risks step 4.
4. **Admin console v1 (§4): `/admin` with flags, maintenance, min-version, announcement, limits, stats.** The owner is the only operator and currently needs the Firebase console for anything but Gemini. Flags also let items 1–3 ship dark to the friend group and roll back without a deploy. Keep `AdminAi` as one card inside it.
5. **Duplicate detection + merchant memory (§3 #5, #6).** Both S, both client-only, both prevent the slow erosion of trust in the numbers that kills splitter apps on long trips — and they amplify the capture/statement features that are already the app's edge.

Next after these, in order: Home template with recurring presets and deposits (#10) for the flat persona; trip timeline (#9) and year-in-review (#13) once the card renderer from #1 exists; IOU acknowledgement (#4) when the rules test budget allows; leave/archive group (parity, planned) before any public launch.

## 6. Things already good (don't "fix")
- The decision to keep money movement out of the app and make the user's own UPI app do the work; the QR-first fallback is exactly right given NPCI's direction.
- `SettleUp` query-param prefill, remembered method per payee, manual UPI entry for non-members, iOS/Android copy differences.
- The share/download fallback chain in `deliverCsv` and `shareOrCopy`.
- Pure-lib discipline (`src/lib/*` with 27 test files; `shared/` reused by functions) makes every proposal above testable before UI.
- `config/ai` + `stats/ai_*` + `admins/*` is the right skeleton for an admin console; the rules key allow-lists are the right style to extend.
- Capture filters stored in `users/{uid}/settings/notifications` with server-side enforcement is the model to follow for `mutedGroups`, `merchants`, etc.
- PLAN.md is honest about gaps (recurring not logged, approval client-side) — keep that habit.

## 7. Open questions for the product owner
1. Should a non-member be able to open a pay-me link (`/r/{code}`) without signing in? It leaks the payee's UPI ID to anyone with the code (same exposure as the live table). If no, #1 stays members-only and the card carries the UPI ID as text.
2. Waivers: should the *payer* be allowed to record a round-down waiver, or only the payee? Default proposal: payee only; payer can propose via comment.
3. Invite-only: is "soft" (approved flag + admin approval) acceptable for the friend-group phase, or do you want the Identity Platform blocking function from the start?
4. Is the name check ("Split Now", PLAN §7) going to happen before any of the share cards (which carry the brand into WhatsApp) go out?
5. Do you want fairness insights (#7) visible to the whole group or only to the viewer? The recommendation is viewer-only until the group asks.

## Sources (research)
getfinny.app/blog/best-splitwise-alternatives-2026 · getfinny.app/blog/splitwise-pricing-2026 · hipposplit.com/blog/splitwise-review · kimola.com Splitwise reports · trustpilot.com/review/splitwise.com · itvoice.in (Splitwise India pricing/limits, 2023) · tricount.com/blog/top-splitwise-alternatives-in-india-2025 · tricount.com/en/what-happened-with-premium · apps.apple.com Settle Up (id737534985), Splid (id991473495), Plates (id669801762), Tab (id595068606), Splitkaro (id1573115695), SplitMyExpenses (id6502963284) · kittysplit.com/en/splid-alternative · github.com/spliit-app/spliit, opencollective.com/spliit · paytm.com/blog/bill-payments/paytm-split-bills (launch 29 Jul 2026) · support.google.com/pay/india/answer/11420982 (GPay bill split) · phonepe.com help: Split Expense · medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1 and businesstoday.in / theweek.in on the NPCI circular · razorpay.com and cashfree.com UPI collect-migration docs · decentro.tech Splitkaro case study · tink.com/blog/splitwise-tink-partner · MicrosoftEdge/MSEdgeExplainers PWAWidgets (widgets still a proposal) · firebase.google.com/docs/projects/billing/firebase-pricing-plans · ai.google.dev rate-limit docs (Gemini free tier).
