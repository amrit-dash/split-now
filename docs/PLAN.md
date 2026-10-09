# Split Now — End-to-End Product & Technical Plan

> Formerly *Split It*. The repository is `split-now`; the Firebase project id keeps `split-it-prod`. The app is **Split Now** (Hosting: `split-now.web.app`, also `freesplit.web.app`). Tagline: *Spending is wise, splitting is free. Split Now!* **Trademark check pending:** "Split Now" has not been cleared against existing app-store listings or Indian / international trademark registrations. Do that before any public launch.

This is the source of truth for what we are building, why, and in what order. It was last brought into line with the code in the October 2026 audit (§9).
Status markers: ✅ built · 🟡 partially built · ⏳ planned.

---

## 1. Product thesis

**India-first, global later.** The first users are the owner's friend group in India: trips (Goa, Coorg, Manali), shared flats (Bengaluru, Mumbai) and dinners, all paid back over UPI. So the defaults are INR, en-IN formatting (₹1,00,000.00, "7 Oct"), UPI-first settle-up, Indian merchants in category guessing and OCR tuned for Indian bills and UPI screenshots. Everything stays multi-currency and region-aware (AUD/PayID and international handles still work), so going global is a matter of adding regions, not rewriting.

Splitwise solved "who owes whom". Its weak points today are where Split Now goes after:

| Splitwise pain | Split Now answer |
|---|---|
| Daily expense cap and ads on the free tier | No caps. Free on Firebase's Spark plan; the Blaze features (push, AI, webhook) cost cents. |
| Receipt scanning and itemization are paid (Pro) | Receipt **and** payment-screenshot reading: on the device by default, with Gemini as an optional reader |
| Settling up is "mark as paid" only | **UPI-first settle-up**: a UPI QR for the exact amount (scan with any UPI app), `upi://` + Google Pay / PhonePe / Paytm buttons, UPI number, bank A/c + IFSC; PayID/BSB, PayPal.me and Revolut for other regions. A "Pay me" link opens the friend's Settle up screen prefilled. |
| Simplify debts is a black box | Before/after **debt graph** shows exactly what simplification changed |
| Simplification stops at the group boundary | **Cross-group netting**: one number per friend, across every group |
| Typing every expense | **Auto-capture** of bank/UPI debit SMS into an Inbox, **Quick add** in plain English or by voice, duplicate warning, merchant memory |
| Weak analytics | Insights tab: category donut, spending trend, paid vs share, top expenses, budget with 80 % / 100 % marks |
| App-store install | Installable PWA (iOS + Android + desktop), works offline |

**Primary platform: mobile PWA.** The app is designed at 360–430px width first. On desktop it renders in a centered phone-width column with a wider dashboard layout where useful.

---

## 2. Personas & core jobs

1. **Trip organiser** creates a group, adds friends (some not signed up yet), logs expenses as they happen, settles at the end.
2. **Housemate** logs recurring bills (rent, power, internet) and wants a monthly "who owes what".
3. **Couple** splits by ratio (e.g. 60/40 by income).
4. **Individual** tracks personal spending alongside shared spending.

---

## 3. Feature inventory

### 3.1 Accounts, profile and settings
- ✅ Google sign-in, email/password sign-in and sign-up (Firebase Auth)
- ✅ Demo mode with no Firebase config: data lives in `localStorage`, so the UI runs immediately (the e2e suite runs against it)
- ✅ **Profile** (`/profile`) is identity only: photo (upload or Google), name, mobile number, email, sign-in methods, **payment handles by region** (India: UPI ID, bank account + IFSC; Australia: PayID, BSB + account; International: PayPal.me, Revolut; "Show all payment options" reveals the rest), links to Settings and Balances, **Support the developer** (a sheet with Buy Me a Coffee, GitHub Sponsors and a star on the repository; the URLs are `SUPPORT_LINKS` in `src/lib/brand.ts`, mirrored in `.github/FUNDING.yml` and the README) and sign out. One phone field: the mobile number doubles as the UPI number when the switch "Friends can pay this number with UPI" is on. Everything autosaves (800 ms after typing stops, on blur, on leaving) with a quiet "Saved" pill; there is no Save button.
- ✅ **Settings** (`/settings`, nested routes in `src/pages/Settings.tsx` + `src/pages/settings/*`, one lazy chunk per area): **Preferences** (default currency with the rates refresh, theme, accent, dual-tone), **Notifications**, **Automation** (auto-capture: master switch, filters, trips, capture keys, recent activity; Apple Pay / capture links under "Advanced"), **AI features** (Firebase only: one switch "Read bills and SMS with AI" plus a consent line; which key, model and the own-key form under "Advanced"), **Data** (CSV export of any group, Import from Splitwise, Install Split Now, version) and **Admin** (only for admins; opens `/admin`, §3.8). Old `/profile#auto-capture|#ai|#ai-admin|#notifications|#appearance` deep links redirect to the matching settings route.
- ✅ **Locale** (`src/lib/locale.ts`): region from `navigator.language` + `Intl` time zone (an Indian time zone wins, so an en-US phone in Asia/Kolkata is still India); numbers and dates use en-IN for India and unknown regions, otherwise the user's locale, always with Western digits (`-u-nu-latn`). `<html lang>` stays `en` because the copy is English.
- ⏳ Apple sign-in (needs an Apple developer account), phone OTP

### 3.2 Groups
- ✅ Create a group with a name, emoji, type (Trip, Outing, Home, Couple, Event, Office, Other), currency and, under "More options", budget, trip dates, simplify and approval settings. The form starts with a kind selector (Group / 1:1 friend / Personal), shows recent people as pills and searches people from your other groups (`src/lib/people.ts`), with email add
- ✅ Add members by name/email **before they sign up** (placeholder members)
- ✅ Invite by link or code. The person who joins **claims** a placeholder member, so past expenses stay attached
- ✅ Guest-friendly invites: opening `/join/CODE` signed out shows an invite banner on the sign-in screen (sign-up form first, Google one tap), and the app returns to the invite after sign-in (path kept in `sessionStorage`; Google redirect returns to the same URL). Email sign-ups store the typed name, not the email prefix
- ✅ **Switch from Splitwise in one tap** (`/groups/import`, entry points on Groups, New group and the first-run card): see §3.4b
- ✅ Per-group "Simplify debts" toggle
- ✅ Direct (1:1) expenses use a hidden 2-person group of type `direct`; personal expenses a 1-person group of type `personal` (a person may have several)
- ✅ **Archive** (`group.archived`, any member, from the ⋯ menu with Undo): the group stays readable and is listed under "Archived" on Groups, but leaves the Home totals, Balances, Insights "All groups", capture matching, reminders and the app badge
- ✅ **Leave group** (non-creators, zero balance, from the ⋯ menu) and **Remove member** (creator, on a zero balance, from Balances), both through `repo.removeMember` with a confirm sheet; the creator sees why they cannot leave. The rules only allow exactly these cases (§4.3)
- ✅ **Delete group**: the client deletes what the rules let it reach; the `onGroupDeleted` trigger removes every subcollection and the group's receipts (§4.0)
- ✅ A group created a moment ago is trusted over Firestore's first answer: `src/lib/fresh.ts` retries its listeners with backoff for 30 s so a new group never reads as "not found"
- ✅ The trip window (`startDate`/`endDate`) lives on the group doc (§3.5b). Pausing auto-capture for a trip is **per person** (`pausedTrips` in their own `settings/notifications`, owner decision Oct 2026); the old group-wide `captureOff` is legacy and ignored
- ✅ **Several personal wallets** (e.g. Fuel, Groceries, Shopping), each with its own icon and budget: the form always offers *Personal*; the first wallet defaults to "My spending", later ones start empty with the placeholder "Fuel, Groceries, Shopping…" (`src/lib/wallets.ts`). Groups lists them under Personal with *New wallet*; the With picker offers *New wallet* once one exists; a captured payment's *Personal* opens the only wallet, creates "My spending" when there is none, or asks *Which wallet?* (with *New wallet…*) when there are several

### 3.3 Expenses
- ✅ Description, amount, date, category (suggested from merchant memory, then this group's history for the same description, then the keyword guess), notes
- ✅ **Multiple payers** (e.g. A paid ₹600, B paid ₹400)
- ✅ Split types:
  - **Equally** among selected people
  - **Exact amounts**
  - **Percentages**
  - **Shares / ratio** (2:1:1)
  - **Adjustments** (equal split plus a +/- per person)
  - **Split by items**: assign receipt line items to people, with tax/tip spread proportionally; "Assign items myself" in the form or "Split at the table" (§3.5a)
- ✅ Cent-exact rounding: leftover minor units are distributed deterministically, so splits always sum to the total; the engine rejects negative or non-finite shares and ends with a sum invariant (`SplitError`, shown inline)
- ✅ **The form** (`src/pages/ExpenseForm.tsx` picks the group; `src/features/expense-form/*` is the UI; `src/lib/expense-draft.ts` is the pure state machine, reducer, validation and `toExpense()`, 36 tests): amount card (`MoneyInput`, currency trigger showing the symbol), "With" picker with a Create section (group / 1:1 / personal → GroupForm `?next=add` → back to `/add?group=<id>`), payer card ("You paid" → sheet, multi-payer inline with a "left to assign" strip), split card (summary row → sheet with the six types), date row with Scan, "More" (repeat, ends, notes). Inline validation after the first Save, one Save in the header. The draft survives a reload or back (sessionStorage keyed by route); "Discard this expense?" asks only when dirty; Cancel from the home-screen shortcut goes Home
- ✅ **Quick add** (`src/lib/nl-expense.ts`, 19 tests): "dinner 1200 with Rahul and Priya, I paid" / "Rahul paid 850 for cab, split 3 ways" / "auto 240 only me" → amount, currency, day word, payer, participants (fuzzy first names; "me"/"I" is you), split hint, description. In the Create sheet (the + button), under the tiles after an "or" divider (`src/components/QuickAdd.tsx`, loaded with the sheet, not with Home; the field is not focused on open). Target: the group you're in, else the live trip, else the last used group, with a picker. The line can name its group (`src/lib/quick-group.ts`, tested): after "in"/"into"/"for" or as "@name", whole words, case-insensitive, any word of the name or a 3+ letter prefix; "for" a member of the picked group stays a person; those words leave the description. A match shows as a chip ("→ Goa Trip", tap to go back to the picked group); two equal matches set the picker to "Which group?" and sending opens it. "in a new group Bali trip" / "new group Bali" (or the picker's "New group…") shows "Create “Bali trip”": GroupForm opens with `?name=` (and a guessed `type`), and `next=add&quick=1` lands on /add with the line, whose people ExpenseForm reads again against the new members (`bindQuickPrefill`). The hint ("Dinner 1200 with Rahul, I paid") drifts sideways when wider than the field (`marqueeFor` in `src/lib/fit.ts`; still and cut off with reduced motion); voice fills the field (caret at the end) for a read-through instead of sending straight away. A mic button where the Web Speech API exists (`src/lib/speech.ts`, recognition by the browser in `en-IN`). It never saves: it opens the form prefilled (`pending.quick`). When the local parse is unsure and AI reading is on for this device, the text goes to `parseReceiptAi({ kind: 'text' })` with the group's member names (never uids) and the answer fills only the gaps
- ✅ **Duplicate warning** (`src/lib/duplicates.ts`): same group, same |amount| (a foreign draft matches the stored `original`), date within a day, similar description (containment or Jaccard ≥ 0.5) → an advisory card above Save ("Looks like a duplicate of “Dinner” (₹1,200.00, yesterday)") with "Open it" and "save anyway". Repeating expenses are exempt. Also applied to the capture prefill and the one-tap add from the capture prompt (which opens the form instead of saving when it finds one)
- ✅ **Merchant memory** (`src/lib/merchants.ts`, `users/{uid}/settings/merchants`): learns a category only when you picked one by hand that differs from the suggestion; LRU, at most 200 merchants; applied to typed descriptions, scans and captures. Demo mode keeps it in localStorage
- ✅ Edit / delete (any group member). Delete is a **soft delete** (see 3.3b); edits write only the changed fields, so a flag or approval that landed meanwhile survives
- ✅ Receipt image attached (Firebase Storage, downscaled JPEG, uploaded after the save, deleted only from `receipts/<groupId>/`)
- ✅ Recurring expenses (weekly / fortnightly / monthly / yearly, optional end date) via **client catch-up**: when a member opens a group, missed occurrences are created with deterministic ids (`{templateId}_{yyyy-mm-dd}`) so concurrent clients never duplicate. Month-end dates clamp (Jan 31 → Feb 28/29 → Mar 31). Occurrences never carry the template's receipt. No Cloud Functions
- ✅ Comment thread on each expense (author-only delete, Undo toast)
- ✅ **Multi-currency expenses with a locked FX rate** (§4.1a): pick a currency next to the amount (remembered per group); the ECB rate for the expense date is fetched from Frankfurter and shown as "≈ ₹6,056.64 at 1 USD = 84.12 INR (ECB, 2026-10-07)", editable, and typed by hand when offline. Captures and scans in a foreign currency prefill the form in that currency. Switching the entry currency keeps the typed figure in the new currency's digits
- ✅ Search (description/notes), category filter chips and an "involving me" toggle on a group's activity list
- ⏳ Settling up in a different currency from the group's (see §4.1a)

### 3.3b Trust: activity feed, edit history, undo/trash, flags, approval
- ✅ **Activity log** `groups/{gid}/activity`: every expense/settlement create, edit, delete, restore and purge, member add/remove, flag/resolve and approval writes one entry **in the same batch** as the change; so does saving the group form when the name, currency, approval settings or budget changed (`group.updated`, `groupSettingsActivity`: one line joining every change, e.g. *"Priya turned on approval for expenses over ₹2,000 and turned on small-edit auto-approve up to ₹100"*, *"Rahul changed the currency to USD"*; not for a personal wallet, nor for archiving, auto-capture, dates or the icon). Pure diff + wording in `src/lib/activity.ts` (unit-tested), so both repos produce identical text, e.g. *"Sarah changed amount ₹800.00 → ₹840.00 on “Dinner”"*. The rules whitelist the 16 types a client may write; `settlement.nudged` is written by the `nudge` callable alone (§3.4).
- ✅ **History** card on each expense (per-field before → after, rendered from the stored snapshots with current member names); **Activity** tab on a group; cross-group **Recent activity** on Home (falls back to the latest expenses when no group has activity yet). Both screens share one listener per group (50 entries).
- ✅ **Soft delete + undo**: deleting an expense or payment sets `deletedAt`/`deletedBy`; balances, lists, insights and export ignore it. A 6 s **Undo** toast replaces the confirm dialog. **Recently deleted** (Activity tab) restores within 30 days; the deleter or the group creator can **Delete forever** (purge: the doc, its comments and its receipt). Items older than 30 days are purged by an allowed member's client when they open the trash.
- ✅ **Flagged** (glossary word for a dispute): anyone who paid or owes on an expense can flag it with a reason → `dispute: { [uid]: { byUid, memberId, reason, at } }` (several flags allowed). Flagged expenses show a "Flagged" pill and still count in balances. The flagger resolves (removes) their own flag; both are logged.
- ✅ **Needs your OK** (approval; off by default; group settings `requireApproval`, `approvalThreshold`, `editAutoApprove`, all minor units, any member may change them). Two amounts, each with its own job:
  - **Approval threshold** ("Needs an OK above"): a new expense strictly above it is saved with `requiresApproval: true` and is pending (a "Needs OK" pill, excluded from balances) until every charged member with an account other than the author sets `approvals[uid] = true`; at or below it counts straight away. With no saved threshold the group uses its currency's default (`src/lib/approval.ts` `APPROVAL_DEFAULTS`, mirrored in `firestore.rules` `approvalThresholdOf`, a unit test keeps them equal): ₹2,000; $/A$/C$/S$/NZ$/€/£/CHF 100; ¥10,000; ₩100,000; Rp 1,000,000 and so on; the group form shows that figure. A currency off the table gets the flat 10,000 minor units in the rules, and a new group in such a currency stores the INR default converted at today's rate and rounded to 1/2/5 × 10ⁿ.
  - **Edit auto-approve** ("Approve small edits automatically", "Changes of up to", off by default, suggested at a twentieth of the threshold: ₹100, $5, ¥500): decides what an edit does to an expense that needs approval (`editApprovalOutcome` in `src/lib/approval.ts`). New amount at or below the threshold, or approval turned off → `requiresApproval` is cleared and the expense counts at once ("Approved automatically (below the threshold)" in the activity). Otherwise, if the expense was already marked and |new − old| ≤ `editAutoApprove` → the edit is approved automatically: approvals given stay and a pending one stays pending ("Edit approved automatically (within ₹100)"). Otherwise (off, or a bigger change, or an expense crossing the threshold) it is marked and approvals reset to the editor's own, so everyone charged approves again. Edits that keep the amount never ask again; a split or payer change at the same amount still clears other people's approvals, as before.
  - A "Needs your OK" card on Home lists what's waiting on you; the push "needs your approval" goes only to the people who have to approve.
  - **Purely a group setting**, edited by any member in the group form ("More options"). A new group starts with approval off; turning it on fills in the currency's default threshold, and turning on small edits fills in its default (₹100 etc.). Changing the group's currency in the form converts both amounts someone set at today's rate and rounds them to a nice figure (no rate: the new currency's defaults); the form says "Changing the currency converts these amounts." Every change to these settings (and to the group's name, currency or budget) writes a `group.updated` line in the group's Activity and the Inbox Updates, so everyone sees who changed what. **The currency is fixed once the group has any expense** (live or in the trash), since amounts are stored in it: the picker is disabled with "The currency can't change once the group has expenses." (`currencyLocked` in `src/lib/approval.ts`). This is client-side only: the group document has no expense count for the rules to check. There is no personal default in Settings.
- Imports (`bulkImport`) write **one** `expense.imported` summary entry; imported rows never carry trust fields and, like any create, rows above the threshold in a `requireApproval` group are marked `requiresApproval`. Live-table bills are saved through `saveExpense`, so they get an `expense.created` entry and the same trust handling.
- Amounts in activity text are in the group currency; a foreign-currency expense shows its original too. The trust update branches (trash, flag/approval) can't touch `original`.
- Gaps: recurring occurrences are not logged (several clients may generate the same occurrence and an append-only log can't dedupe); receipt attachments aren't logged; only the flagger (not the expense author) can clear a flag; approval is client-side bookkeeping (rules enforce the `requiresApproval` marker and own-key approvals, not the balance exclusion; the reminder job and the nudge callable use the same `isPendingApproval` from `shared/balances-core.ts`, so the server never nags about money the app says isn't owed yet).

### 3.4 Balances, simplification, settling up
- ✅ Per-group net balances (`countable()` drops malformed expenses once per group; single-payer fast path)
- ✅ Pairwise debts (raw) vs **simplified debts** (greedy min-cash-flow, O(n log n), ≤ n−1 transfers)
- ✅ **Debt graph** visual: raw vs simplified (collapsed under Balances; debts spelled out in its `aria-label`)
- ✅ **Balances** (`/settle`, `src/pages/SettleAll.tsx`, `src/lib/settleAll.ts`; replaces the old Friends screen, `/friends` redirects): every pending settlement by person or by group, settle each row; archived groups are left out. The Home balance card's cheque button opens it
- ✅ **Settle up** (`src/pages/SettleUp.tsx`): pick who pays whom, `MoneyInput` labelled "Amount in <CUR>", chips for the full amount and rounded figures (`roundSuggestions`: ₹1,247 → ₹1,200 / ₹1,250), a **"Waive the rest"** switch for part payments (records a second settlement with `method: 'waived'` so the history shows what was paid and what was let go; `methodLabel()` renders it as "Waived"), the method as a labelled radiogroup, then the payee's handles and deep links. `?from&to&amount` prefills it (the Pay me link)
- ✅ **Remind → Pay me link and card** (`src/lib/share-card.ts`, `RemindActions` on a group's Balances tab): Remind creates a `payLinks/{code}` document (24 random characters, 30 days) and the share sheet gets a text with `https://<origin>/r/{code}` and, where `navigator.canShare({ files })`, a 1080×1080 PNG card (brand gradient, "Rahul → Priya", amount, group, a UPI QR when the payee has a UPI ID and the group is INR); clipboard fallback
- ✅ **Pay me link works signed out** (`/r/{code}`, `src/pages/PayLink.tsx`, `src/lib/paylinks.ts`, `shared/paylinks.ts`): anyone with the link, no account needed (anonymous sign-in, as live tables do), sees the amount, the payee, the group, the payee's UPI QR, app buttons and handles (UPI ID, UPI number, PayID, PayPal, Revolut; never bank account numbers), pays, and taps **"I've paid"** with the method and an optional screenshot (`payproofs/{code}/`). That flips the link open → paid; the `onPayLinkPaid` function records the settlement in the group (id `pl_{code}`, method from the claim, note "Marked paid from a Pay me link", a `settlement.created` activity line) and pushes the payee "Rahul marked ₹1,240 paid · Goa trip". A false claim is undone by deleting the payment in the group, as any other. A signed-in member of the group who opens the link goes to the prefilled Settle up (`?from&to&amount&link`); recording there marks the link paid with its own settlement id, so nothing is recorded twice. The payee opening their own link sees its status, the screenshot, Share again and Cancel; group payments recorded from a link show "Pay me link" in the list. Paid, expired and cancelled links say so. Demo mode records the payment at once (the toast after Remind offers "Open as <name>"). Recording never depends on the flag: the flag `payLinks` off stops new links (Remind shares the members-only Settle up link, finished tables make no guest links) and hides the `/r/` pay page and "I've paid"; a claim on a link that already exists is still recorded at once, and the payee can still confirm one
- ✅ **Nudge** (callable `nudge`, §4.0): a push to the debtor "Priya reminded you: you owe ₹1,240 in Goa trip. Pay in one tap." with the settle link; one per (sender, debtor, group) per day (`config/limits.nudgePerDay`), honours the debtor's "reminders" preference, amount computed server-side from the group's balances and clamped, `settlement.nudged` activity entry. The button reads "already nudged today" from the feed or this device's memory; demo mode answers like the server (no push) and writes the activity entry
- ✅ **Nudge and Remind on Balances** (`/settle`, `SettleAll.tsx`): every row where someone owes you has Remind (share sheet; a Pay me link for one group) and Nudge (people with an account), as on a group's Balances tab, with the same "already nudged today" state (read from the groups' merged feeds, `lastNudgeAt(…, groupId)`). On those rows the amount sits under the name to make room for the round buttons
- ✅ **Cross-group nudge**: a "by person" row spanning several groups sends one nudge (`repo.nudgeAcross`, the callable with `{ items: [{ groupId, memberId, amount? }] }`, at most 20): the server works out each group's amount, nets out groups where you owe them, skips other currencies, placeholders and groups you can't nudge in, and sends ONE push "Priya reminded you: you owe ₹3,240 across Goa trip and Flat. Pay in one tap." opening the debtor's cross-group Settle up (`/settle/with/u:{senderUid}|{currency}`); a `settlement.nudged` entry in each group they owe in; once per (sender, debtor account) per day (`rateLimits/nudgep_{uid}_{debtorUid}`) and not on top of a single-group nudge in those groups that day. Remind on such a row shares the total (text, UPI, card) with the cross-group Settle up link, since a Pay me link records a payment in one group only. Pure parts: `parseNudgeRequest`, `crossGroupPlan` (functions/src/lib/nudge-core.ts), `personNudgeItems`, `canNudgePerson` (src/lib/settleAll.ts)
- ✅ **Nudge when their notifications are off**: the callable answers `{ sent: false, reason: 'no_push', amount }` but still writes the activity entry and uses the day; the app opens the Remind share sheet straight away with the toast "Rahul has notifications off, so share it instead" (its Share action is the fallback where the browser won't open a share sheet after the wait)
- ✅ **Reminder card for the debtor** (works without push): `src/lib/nudge-inbox.ts` picks the unseen `settlement.nudged` entries naming you (last 7 days, while you still owe there, newest first, one card per sender and currency) and Home (top) and the Inbox ("To sort" → Reminders, counted in the badge) show "Meera reminded you · You owe ₹4,500.00 in Coldplay Night · Settle up" (the prefilled Settle up; several groups → the cross-group one). Dismissed per nudge on this device, with Undo. When this device could get pushes but hasn't turned them on, the card offers "Turn on notifications" (the Settings → Notifications flow, `useTurnOnPush`; iPhone browser tabs get the install-first copy, `pushOffer` in src/lib/push.ts). Demo: Ananya (Goa) has an account so Nudge can be tried, and Meera's nudge in a seeded "Coldplay Night" group shows the card
- ✅ **Whose turn** (`src/lib/fairness.ts`): over the last 90 days, the person who has fronted the least relative to their share (ties by who paid longest ago) → a private chip on the group page ("Rahul's turn to pay?") and a line in Insights; nothing when nobody stands out, never pushed
- ✅ **UPI** (`src/lib/payments.ts`): `upi://pay?pa=&pn=&am=&cu=INR&tn=` per NPCI's UPI linking spec, plus app links `tez://upi/pay?…` (Google Pay), `phonepe://pay?…`, `paytmmp://upi/pay?…`. Android shows a chooser for `upi://`; iOS has none and opens whichever app it registered (or nothing), so the app buttons are the reliable path there. The same `upi://` string is shown as a **QR code** for the exact amount. When the recipient is you, the card says "show this to <payer>". If the payee hasn't joined, the payer can paste their UPI ID to get the same QR/buttons. Some UPI apps cap or warn on link-initiated person-to-person payments to unverified VPAs; the QR and manual UPI ID still work
- ✅ Method chips by currency: INR → UPI, Cash, Bank transfer, Other; AUD → PayID, Bank transfer, Cash, PayPal, Other
- ✅ **Push notifications** (FCM web push, §4.0): new expense (to the people in it), payment recorded (to the payee, and to the payer when someone else recorded it), captured payments, daily settle-up reminders, nudges, budget alerts. Preferences per kind in Settings → Notifications; the app icon badge shows captures to sort plus approvals waiting plus table guests' payments to confirm
- ✅ **Settle with one person across groups** (`/settle/with/:key`, `SettleWithPerson` in `src/pages/SettleUp.tsx`, `src/lib/settleMulti.ts`): the net total with that person, a live per-group split of the payment (`allocateAcrossGroups`), and shared payment options; one settlement per group so every group's balance clears. Round-down and "Waive the rest" stay on the per-group Settle up

### 3.4b Import from Splitwise
- ✅ Pure parser `src/lib/import-splitwise.ts` (unit-tested). Splitwise's *Export as spreadsheet* CSV is `Date,Description,Category,Cost,Currency,<one column per person>`, usually a blank line after the header, then a `Total balance` row per currency. Each person column is their **net** for the row (paid − share; + is owed, − owes). Payments have Category `Payment`.
- ✅ Tolerant: BOM, quoted fields with commas/quotes/newlines, `,` `;` or tab delimiters, decimal commas, ISO / d/m/y / m/d/y (decided per column) / month-name dates, blank lines, duplicate names, names containing ";" or starting with `=+-@` (un-formula'd), translated headers (falls back to Splitwise's column order). Rows in other currencies, rows that move no balance, and unreadable rows are skipped with a note.
- ✅ **Reconstruction.** Nets alone can't recover the original payer/share split, so each row is rebuilt to keep every net exactly: owers (net < 0) get a share of −net; creditors (net > 0) paid net + x with share x, where the x's add up to `cost − Σ positive nets`, spread in proportion to their nets (largest remainder). With one creditor that is "they paid the bill and had a share", which is how most Splitwise expenses were entered. If the cost is smaller than Σ positive nets, the amount is raised to that sum. Stored as `splitType: 'exact'`.
- ✅ Balances after import are compared with Splitwise's `Total balance` row in the preview (✓ per person) and tested to match exactly.
- ✅ Splitwise subcategories map to ours (Dining out → food, Taxi → transport, Hotel → stay, Plane → travel, TV/Phone/Internet → utilities…); "General"/unknown falls back to the description keyword guess, then `other`.
- ✅ Preview → map each person to *me* / an existing member / a new placeholder → new group or an existing group → `repo.bulkImport` writes ≤450-write batches in order after `createGroup`/`addMember`, with progress per batch. Imported docs carry `importedFrom: 'splitwise' | 'csv'`.
- ⏳ Splitwise API import (OAuth) to bring comments, receipts and exact payer splits

### 3.5 Scan: reading bills and payment screenshots
- ✅ **On the device by default** (`src/lib/ocr.ts` + `src/lib/ocr-parse.ts`): Tesseract.js in one reused worker pulls out the total, merchant, date and line items, then pre-fills the expense form (Split by items available). Payment screenshots (Google Pay / PhonePe / Paytm / BHIM success screens, bank/PayID/PayPal confirmations) give amount + payee → a prefilled settlement
- ✅ **AI reading is optional** (`src/lib/ai.ts` → callable `parseReceiptAi`, §4.0, §5d of FIREBASE_SETUP): when the user's "Read bills and SMS with AI" switch is on and a key can serve the account (the project's shared Gemini key per `config/ai`, or the user's own key), Gemini reads the photo first and the on-device path is the fallback. When AI can't be used the server answers `{ unavailable: true, reason }` and the screen shows a calm "Read on this phone instead" line, never an error. "That doesn't look like a bill" is its own card. Nothing is ever saved without the user confirming
- ✅ Currency from the bill, else the profile, shown as a small picker next to the total and carried into the form; Cancel during OCR/AI; progress labelled for assistive tech; images shared over 15 MB get a plain message instead of a parked file
- ✅ **Indian bills**: ₹ / Rs. / INR amounts with lakh grouping, whole-rupee amounts when a currency marker is present, CGST/SGST/IGST/cess/service charge/round-off lines treated as tax (not items), "Grand Total" / "Net Amount" / "Amount Payable" as the total, qty × rate columns stripped from item names
- ✅ **Category guessing** for Indian merchants: Swiggy/Zomato (food), Instamart/Zepto/Blinkit/BigBasket/DMart (groceries), Ola/Uber/Rapido/petrol/FASTag (transport), IRCTC/RedBus/MakeMyTrip/Goibibo/IndiGo (travel), OYO (stay), BookMyShow/PVR (entertainment), Jio/Airtel/BESCOM/broadband/maintenance (utilities), PG rent, Apollo/PharmEasy, Flipkart/Myntra; merchant memory (§3.3) wins over all of it

### 3.5a Live table
- ✅ From a Split-by-items draft (expense form) or a scanned receipt, the payer taps **Split at the table**: a live bill `tables/{code}` with a QR code (generated on the device, `src/lib/qr.ts`), an 8-character code and a `/t/<code>` link
- ✅ Guests open the link, type a name (Firebase **anonymous auth**, no account) and tap what they had; shared items split equally or by portions; everyone sees live totals with tax/fees and tip shown separately, unclaimed items highlighted, "Everything claimed"
- ✅ **Tip is always split equally** between the people who have claimed something (everyone at the table before anyone has). **Tax & fees** (and any discount) is a table option, `taxSplit`: *By items* (default; in proportion to what each person had, unclaimed items holding their share in reserve) or *Equally* (between the same people as the tip). Set before Start table and in the host's Edit bill. On a scanned bill, a total that matches without the tip reads "Tip added on top of the bill"; otherwise "Fix with tax" closes the gap measured without the tip (never folding the tip into tax); a mismatch never blocks starting the table
- ✅ The host can claim for anyone, add people without a phone, edit items/tax/tip/discount, and split leftovers between everyone
- ✅ **Finish** → pick a group, participants auto-matched to members (uid → exact name → unique first name; host confirms or adds them as new members) → one expense that sums exactly to the bill: itemised (portions on the item) when there is no tip and tax is by items; otherwise exact amounts, each member getting exactly the totals their people saw at the table (receipt items kept on the split input). No group → create one from the table, or close and send each person their total; guests on a closed table get the host's UPI app buttons, an exact-amount QR and copy rows
- ✅ **"I've paid" at the table**: finishing gives each guest their own Pay me link (`tables/{code}.payLinks[pid]`; into a group: one per member who owes the host, for exactly their share of the expense; without a group: their table total). The closed table shows the guest "I've paid"; a guest who joined with a phone has a link locked to them (`forUid`) and it counts at once, as for any Pay me link. A link not locked to one guest (someone the host added by hand, or a member several guests were matched to) goes open → **claimed**: the guest sees "Waiting for <host> to confirm", the host gets a push ("Gran says they've paid ₹250 · confirm") and a "Says they've paid · Confirm" pill on the table, a card in the **Inbox** under "to sort" (every claim, group or no group; counted in the to-sort number and the app badge) and a card on the group (its own claims), with the screenshot. The Inbox and group cards read one live query of the payee's own claimed links (`repo.watchClaimedPayLinks`, `useClaimedPayLinks`); the server still logs a `settlement.claimed` activity line; **Confirm** → paid (recorded as above), **Dismiss** → open again (the claim cleared). The host sees "Paid" next to a guest live; the host's share button sends the link
- ✅ Tables expire after 24 h. Logic in `src/lib/table.ts` (unit-tested); demo mode syncs tabs via the `storage` event, and the host's "open as another phone" link simulates a guest. The admin flag `liveTables` hides `/split` and `/t/*` for everyone

### 3.5b Trip mode & auto-capture (see [AUTO_CAPTURE.md](AUTO_CAPTURE.md))
- ✅ Optional group `startDate`/`endDate`; "Live trip" badge; new expenses default to the live trip
- ✅ **Bank/UPI debit SMS → phone automation → `/api/capture` webhook → push** (the primary path): the Cloud Function verifies the capture key, parses the SMS with `shared/sms-parse.ts`, applies the user's filters, matches trip windows, dedupes and saves a pending **captured payment** to the user's **Inbox**, then pushes "You spent ₹840 at Swiggy — add to Goa Trip?". Nothing is added without the user
- ✅ Three-screen setup wizard (`/settings/auto-capture`): pick the platform, get the key (one-tap copy; a prefilled `.macro` download for Android when the owner hosts a template, the shared Shortcut link for iPhone), then a live "Waiting for your phone…" screen that flips to "Got it: ₹250 at Swiggy" on the first message. Manual steps, the on-phone regex, a browser test, scope and keys sit in collapsibles underneath
- ✅ **Inbox** (`/inbox`): captures honour the server's suggested group; one tap "Add all N to <live trip>" for pending captures that fall in a trip window; "Ignore <merchant>" writes an ignore keyword; Undo toasts instead of permanent deletes; "Says they've paid" cards (table guests' claims on your Pay me links, Confirm / Dismiss, counted in "To sort"); "To sort" and "Updates" counts; skeleton rows and an offline pill; "Checking for new captured payments…" while the list is only from cache
- ✅ **Capture prompt** (`/capture/{id}`): "Split equally in <group>" saves at once (equal split, you paid) with Undo; "Edit details first" opens the form; a group in another currency goes through the form so the rate is visible
- ✅ **Trip auto-capture is per person**: each person pauses a trip for their own captures (`pausedTrips`, Settings → Automation → Trips, or the group page). The webhook, the Inbox and capture-prompt suggestions and the demo wizard skip the person's paused trips (`pickTrip` / `rankGroupsForCapture` / `matchScoped` take them); the group-wide `captureOff` is ignored. The group page shows one line under Settle up / Invite for a shared trip with dates that hasn't ended: "Trip auto-capture is on for you · Pause" / "Paused for you · Resume" (Undo toast, no group activity), "Auto-capture is paused for you · Settings" when their capture is paused altogether, or "Add payments from your phone automatically during this trip · Set up" (the wizard scoped to the trip) when no key covers it (`tripCaptureNotice`)
- ✅ `/capture` URL contract v=1 and the signed-out `captureInbox` drop box for the iOS Apple Pay Transaction automation; Android Web Share Target (images → Scan, text through the same SMS parser, masking and filters as the webhook)
- ⏳ Open banking (Basiq), email forwarding

### 3.5c Statement import
- ✅ Screenshots of a payment app's history (up to six) → `parseReceiptAi({ kind: 'statement' })` → transactions, each flagged against the chosen group by `src/lib/statement.ts` (`in_trip`, `outside_trip`, `maybe_added`, `received`, `own_transfer`, `refund`) → tick rows, fix names and categories → expenses. Lives on the Scan screen (`src/components/StatementImport.tsx`), needs AI: when nothing can read for the account the button is replaced by the reason and the right link, so nobody picks six screenshots and then fails. Progress stages, Cancel, offline check

### 3.6 Insights (charts)
- ✅ Hand-rolled SVG charts (`src/components/charts`: `Donut`, `AreaChart`, `Bars`; no charting dependency) with pointer tooltips and text alternatives (`aria-label` summaries, a visually hidden table, printed values on bars)
- ✅ Spending by category (donut), trend by week or month (area), paid vs share per member (bar), "with people", biggest expenses, totals (your share, group total, biggest category) and a delta against the previous period
- ✅ Periods **4 weeks** (four full weeks, labelled by the week's first day), 3 months, 12 months, all, kept in the URL (`?p=1m|3m|12m|all`), basis "my share" / "group total" (`?b=`, hidden for personal groups). Months are keyed by the calendar month on the expense (local dates, never `Date` objects: `src/lib/insights.ts`), so an IST evening expense lands in the right month; year labels appear across a year boundary
- ✅ Group budget card with the 80 % / 100 % marks and words the push alert uses (`shared/budget.ts`); "Whose turn" line for a single shared group; archived groups left out of "All groups"
- ✅ CSV export per group (expenses + payments, one share column per member) from the group's ⋯ menu or Settings → Data; shared via the native share sheet on mobile, downloaded elsewhere
- ✅ CSV re-import of our own export (round-trip; same import screen, detected from the `Type`/`Paid by` columns)
- ⏳ Year-in-review

### 3.7 PWA & UX
- ✅ Installable: web manifest (`id`, `lang`, `dir`, `display_override`, `launch_handler: navigate-existing`, no orientation lock, shortcuts Add expense / Scan receipt / Inbox, a monochrome icon for themed launchers), service worker (`clientsClaim`, update prompt without `skipWaiting`), icons generated by `npm run icons` (§5)
- ✅ **Install banner** (`src/lib/install.ts`): offered after the second visit or the first expense, dismiss is permanent, Settings → Data keeps an Install row; native prompt on Android/desktop Chrome, step-by-step "Share → Add to Home Screen" on iOS
- ✅ Offline: app shell and fonts precached; Firestore persistent local cache; a slim offline pill (`useOnline`) on the Inbox and import screens; sign-out never deletes a cache with pending writes
- ✅ First paint: a CSS-only splash in `index.html` (inside `#root` until React renders), then the app; `Suspense` sits inside the layout so the tab bar never disappears; skeletons instead of spinners; route chunks prefetched on idle and on pointerdown (§4.6)
- ✅ Push taps and shortcuts land in the open window (`{ type: 'navigate', url }` from the service worker); the app badge (`navigator.setAppBadge`) shows captures to sort plus approvals waiting
- ✅ Dark / light / system theme, seven accents (Violet, Ocean, Neon, Berry, Lime, Gold, Graphite) in a one-row picker with a dual-tone switch; the desktop favicon follows the accent at runtime
- ✅ Frosted notch in the tab bar around the + button, active-tab pill, toasts rising above the tab bar, the Aurora "smoke" blend on the + button and the Home card (paused while off-screen or in a hidden tab, stopped under reduced motion), 16 px inputs on touch screens so iOS never zooms
- ✅ Accessibility baseline: 44 px targets (or 24 px with spacing), labels on every control, `aria-pressed` / radiogroups instead of colour-only state, `text-muted` (4.5:1) for secondary text, one `h1` per screen, `document.title` per route, focus moved on route change, skip link, error toasts as `role="alert"`
- ✅ Version string `pkg.version+<git sha>` (`__APP_VERSION__`) shown in Settings → Data; a failed chunk load after a deploy reloads once
- ⏳ Haptics (Android only; iOS Safari has no Vibration API)

### 3.8 Admin console and app configuration
- ✅ `/admin` (tabs Overview, Flags & app, Limits, AI, Users), visible only to accounts with an `admins/{uid}` document (the same check the rules make; `aiStatus().admin` is the single client signal). Demo mode shows one explanatory card
- ✅ **Overview**: `adminStats` → accounts (Auth list), groups, groups active in 7 days, blocked accounts, today's counters and 14-day sparklines for AI, captures, pushes and nudges (`stats/{kind}_{day}`)
- ✅ **Flags & app** (`config/app`, world-readable, admin-written): maintenance mode (everyone but admins sees a screen and the rules refuse their writes), minimum app version ("Update Split Now" for older builds; admins exempt), announcement banner (text, info/warn, optional end; dismissed per device), **feature flags** `aiImages`, `aiSms`, `liveTables`, `autoCapture`, `quickAdd`, `nudges`, `statementImport`, `payLinks`, `duplicates`, `merchantMemory`, `whoseTurn`, `budgetAlerts` (a missing document or key means on; `useFlag()` in the app, `flagOn()` in the functions; `aiImages`, `aiSms`, `autoCapture`, `nudges`, `budgetAlerts` are enforced server-side, `liveTables` and `autoCapture` redirect their routes, the rest hide UI) and the sign-up mode
- ✅ **How the switches look**: maintenance, update required and a paused account are full-screen notices on the Aurora surface (`src/components/GateScreen.tsx`: icon, title, the admin's message or “We’re making Split Now better. Your data is safe.”, “Checking again automatically”, one action); the console previews the maintenance screen with the typed message. Admins instead get a one-line sticky strip (“Maintenance mode is on · only admins can use the app”, with a confirmed **Turn off** and a link to Flags & app). The strip and the announcement sit in one sticky band that owns the notch inset (`--banner-h`, `--safe-top` in `src/index.css`) and loop overlong text sideways (`Marquee`, `src/lib/marquee.ts`; still and wrapped with reduced motion)
- ✅ **Limits** (`config/limits`): captures per key per hour/day, AI calls on an own key, nudges per day, FX refreshes per user; defaults and ranges in `shared/limits.ts`, read by the functions with a 60 s cache. The shared Gemini key's limits stay in `config/ai`
- ✅ **AI** (`config/ai`, `private/geminiAppKey`): the project key (Secret Manager or set in-app, sealed), who may use it, model, per-person limits and the daily budget for everyone
- ✅ **Users** (`adminUsers`, `adminBlockUser`): find an account by email, uid or name; **block** writes `blocked/{uid} = { reason, at, by }`, disables the Auth user, revokes sessions and deletes push and capture keys; the rules refuse every write from that account and the app shows "This account is paused" with the reason
- 🟡 Invite-only sign-ups (`config/app.signups = 'invite'`): the helper `signupsOpen()` exists in `src/lib/flags.ts`, but the sign-in screen does not read it yet, so the setting has no visible effect. Hard enforcement would need an Identity Platform blocking function

---

## 4. Architecture

```
React 19 + TypeScript + Vite 8
  ├─ Tailwind CSS v4           (design tokens in src/index.css; self-hosted Inter in src/fonts.css)
  ├─ React Router v7           (routes in src/App.tsx; lazy chunks + prefetch in src/routes.ts)
  ├─ src/components/charts     (hand-rolled SVG donut / area / bars; no charting library)
  ├─ Tesseract.js              (on-device OCR, lazy-loaded, one reused worker)
  ├─ vite-plugin-pwa / Workbox (manifest + service worker; public/push-sw.js, public/share-target-sw.js)
  └─ Data layer (src/data/)
       ├─ repo.ts       — the one interface every screen talks to (watch* callbacks carry SnapMeta)
       ├─ store.ts      — shared, refcounted live queries (one Firestore listener per key)
       ├─ firebaseRepo  — Firestore + Storage + callables
       ├─ localRepo     — localStorage implementation (demo mode)
       └─ index.ts      — `#repo-impl` is chosen at build time (impl.firebase.ts | impl.local.ts)
Hooks (src/hooks/) — auth, data (useSyncExternalStore over the store), groupData (all-groups view once), inbox, app config, AI status
Pure domain logic (src/lib/) — splits, balances, simplify, FX, OCR parsing, SMS parsing, drafts, duplicates, NL parsing … — unit-tested with Vitest
shared/ — code both the app and functions/ import (SMS parser, capture filters, trip matching, balances core, money core, AI config, limits, budget)
functions/ — Cloud Functions (asia-south1): webhook, triggers, schedules, callables
```

**Why compute balances on the client?** A group's expense list is small (hundreds, not millions). Computing balances from the expense list removes a whole class of bugs (denormalized balance drift) and needs no server; Cloud Functions (§4.0) only do what a browser can't. The server-side jobs that need balances (reminders, nudges) use the same maths from `shared/balances-core.ts`. If groups ever grow past ~5k expenses, add a Cloud Function that maintains a `balances` doc.

### 4.0 Backend (Cloud Functions, Blaze plan)

The project is on **Blaze**. Balances are still computed on the client; the backend receives bank SMS from automations, sends push notifications, runs daily jobs, keeps the shared exchange rates, talks to Gemini, and serves the admin console. Code in `functions/` (TypeScript, Node 22, firebase-functions 2nd gen, firebase-admin), bundled with esbuild together with the `shared/` modules. One region constant, **`asia-south1` (Mumbai)**, in `functions/src/config.ts`, matching the Firestore location.

| Function | Kind | Notes |
|---|---|---|
| `capture` | HTTPS (`/api/sms`, `/api/capture` via Hosting rewrites, both sites) | Per-IP limit, 16 KB body cap and a negative cache of unknown keys before any read; capture-key auth; per-key limits from `config/limits` (60/h, 300/day by default); parse, filters, trip match, dedupe, save `users/{uid}/captures/{id}`, push. Gemini only for bank-looking messages the parser couldn't read, masked. Outcomes counted in `stats/capture_{day}`; `flags.autoCapture` off → `paused`. No App Check (automations can't). See AUTO_CAPTURE.md §3.1 |
| `onExpenseCreated` | Firestore create trigger | "Sarah added Dinner · ₹840 · your share ₹210" to the other people in it (only uids in `memberUids`; "needs your approval" only to approvers); skips imports, recurring copies, trashed. Also the **budget alert**: when live spend crosses 80 % or 100 % of `group.budget`, one push per threshold per budget figure to members with expense pushes on (`reminderState/{gid}.budget`, flag `budgetAlerts`) |
| `onSettlementCreated` | Firestore create trigger | "Rahul paid you ₹500" to the payee, and to the payer when someone else recorded it (not for one `onPayLinkPaid` recorded: it sends its own) |
| `onPushTokenCreated` | Firestore create trigger | Deletes the same browser token under every other account (collection-group index on `pushTokens.token`) |
| `onGroupDeleted` | Firestore delete trigger | `recursiveDelete` of expenses, settlements, comments, activity, profiles, plus `receipts/{gid}/` in Storage |
| `dailyReminders` | Scheduler, 10:00 Asia/Kolkata | Settle-up reminder when owed > ₹500 (10 major units elsewhere) for 7 real days, at most weekly per group. Reads only groups changed in the last 36 h or with a remembered candidate (`reminderState/{gid}`), ten at a time with field masks; skips personal and archived groups |
| `fxDaily` / `fxMorning` | Scheduler, weekdays 17:15 Europe/Berlin / daily 09:00 IST | Fetch the latest ECB rates into `fxRates/{date}` + `fxRates/latest` (§4.1a) |
| `refreshFx` | Callable, any signed-in user (anonymous: latest only) | `{ date? }` → fetch + store ECB rates; latest throttled to one external fetch per 10 min, stored past dates final; per-user limits from `config/limits` (30/h, 200/day) |
| `parseReceiptAi` | Callable (signed in, not anonymous) | `{ kind: 'receipt', images ≤ 3 }`, `{ kind: 'statement', images ≤ 6, today }` or `{ kind: 'text', text ≤ 300, members, currency, today }` (Quick add) → Gemini with the user's own key first, then the project key if `config/ai` allows; JSON-schema constrained, validated again, retried once on 429/5xx, model fallbacks; `{ unavailable: true, reason }` otherwise. Usage in `stats/ai_{day}` |
| `aiKey`, `aiModels`, `aiStatus` | Callables | Save / test / remove a user's own Gemini key (sealed at rest, §4.3) or, for admins, the in-app project key; list usable models; report availability per feature (admins also get the key source and `globalPerDay`) |
| `onPayLinkPaid` | Firestore update trigger | `payLinks/{code}` → paid ("I've paid", or the host confirming a claim): records the settlement `pl_{code}` in the group as the payee (+ `settlement.created` activity) in one transaction that stamps the link, so a re-run never records twice; pushes the payee (`settlements` preference); a link without a group only pushes; skipped when a member already recorded it (`settlementId`). Open → claimed (a table link not locked to one guest): a `settlement.claimed` activity entry (`plc_{code}_{paidAt}`, targetId = the code) and a push to the host to confirm. Never checks the `payLinks` flag: a claim is always honoured |
| `nudge` | Callable | `{ groupId, memberId, amount? }` → push to the debtor with the settle link; one per (sender, debtor, group) per day. Or `{ items: [{ groupId, memberId, amount? }] }` (≤ 20) → one push with the net total across those groups, once per (sender, debtor account) per day. `{ sent: true, amount, groups? }` or `{ sent: false, reason: 'no_push', amount }` (no device: the in-app reminder is still written) or `{ sent: false, reason: 'rate_limited' \| 'not_owed' \| 'not_member' \| 'off' }`; writes `settlement.nudged` (per group) and `stats/nudge_{day}` (`sent`, `in_app`, `denied`) |
| `adminStats`, `adminUsers`, `adminBlockUser` | Callables (`admins/{uid}` only) | Counters + totals for the console, account lookup, block / unblock (§3.8) |

Server-only collections (rules deny all client access): `rateLimits/*` (`{tokenHash}` for capture keys, `ai_{kind}_{uid}`, `fx_{uid}`, `nudge_{gid}_{uid}_{memberId}`, `nudgep_{uid}_{debtorUid}`), `reminderState/{gid}`, `private/geminiAppKey`, `users/{uid}/secrets/*`. Server-written, client-readable: `fxRates/*` (any signed-in user), `users/{uid}/captureLog/recent` and `users/{uid}/aiState/status` (owner), `stats/*` and `config/limits`, `config/ai` (admins), `config/app` and `blocked/{own uid}` (everyone / the account). Pure logic (trip matching, idempotency, masking, rate limiting, reminder maths, nudge maths, notification text with `Intl` en-IN, Gemini prompts and validation) is unit-tested next to the code; `npm run test:functions` runs the webhook and the admin callables against the emulators.

**Costs on Blaze for a small group** (say 10 people, 5 trips a year, ~30 SMS captures and ~50 expenses a week) [Likely]: everything stays inside the no-cost tiers. Cloud Functions/Cloud Run: 2M invocations and 180k vCPU-seconds free per month vs. a few thousand invocations. Firestore: 50k reads / 20k writes free per day; the daily reminder job used to read every group's expenses and now reads only groups that changed in the last day or had someone over the threshold, so an idle group costs nothing. FCM is free. Cloud Scheduler: 3 jobs free per billing account (we use exactly 3: `dailyReminders`, `fxDaily`, `fxMorning`). Gemini on the project key is the one line item that can grow; `config/ai.globalPerDay` (default 2000 calls/day) caps it and `stats/ai_{day}` shows it. Artifact Registry stores the function images (~0.5 GB free). Expect **$0–1/month** without AI; set a budget alert anyway.

### 4.1 Money
- All amounts are **integer minor units** of the group's currency. No floats touch stored data. Every money field in the UI is a `MoneyInput` (string draft inside, minor units outside).
- The number of minor-unit digits comes from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`: 2 for AUD/USD, **0 for JPY/KRW/VND**, 3 for BHD (IDR is 2 in Intl/ISO 4217). `formatMoney`, `parseMoney` and `centsToInput` all take the currency (`src/lib/money.ts`; `shared/money-core.ts` carries the same digit logic and the "which currency does `A$12.50` imply" rule for the functions). INR is stored in paise.
- `formatMoney` formats in the app locale (`appLocale()` from `src/lib/locale.ts`, set once in `main.tsx`, always `-u-nu-latn`; `opts.locale` overrides it, which keeps it pure for tests): en-IN gives `₹1,00,000.00` lakh/crore grouping. Dates go through the cached formatters `formatDate(iso, style)` / `formatDateTime` / `formatTime` ("7 Oct").
- Dates are local ISO `yyyy-mm-dd` strings: `todayISO()` (`src/lib/id.ts`) is the one "today", and `fx.ts`'s `isoToday()` agrees with it, so an expense never lands on the UTC date.
- Each group has one currency. Formatting uses `Intl.NumberFormat`.

### 4.1a Multi-currency expenses (locked FX)
- An expense may be **entered** in another currency. Everything balances read stays in the **group currency**: on save the total is converted once (`convertMinor`, rounding to the group's minor unit), then `paidBy` and `splits` are re-allocated from that converted total with largest-remainder rounding, weighted by the entered amounts — so both still sum to `amount` exactly and `balances.ts` / `simplify.ts` are unchanged (`src/lib/fx.ts`, unit-tested in `fx.test.ts`).
- The original is kept on the expense as `original: { currency, amount (minor units of that currency), rate (group-currency units per 1 original unit), rateDate, source: 'ecb' | 'manual' }`. `splitInput` amounts (exact / adjust / items) are in the original currency so the form re-opens as typed. The rate is **locked**: it only changes if a user edits the expense and changes the currency, the date (ECB rates only) or the rate itself. Recurring copies inherit the template's original and rate.
- Rates are **global**: ECB reference rates stored in Firestore so every user sees the same numbers.
  - `fxRates/{yyyy-mm-dd}` and `fxRates/latest`: `{ date (ECB publication date), base: 'EUR', rates: { INR, USD, …, EUR: 1 }, fetchedAt (ms), source: 'ecb' }`. Any pair is `rates[to] / rates[from]`. A past weekend/holiday that was asked for is stored too, as an alias holding the previous business day's rates (only once that day is over in Frankfurt, so "not published yet" is never stored as final). Rules: read by any signed-in user (anonymous guests too), no client writes (`tests/firestore.fx-global.test.ts`).
  - Written by Cloud Functions (`functions/src/fx.ts`, pure parts in `functions/src/lib/fx-core.ts`, unit-tested): `fxDaily` weekdays 17:15 Europe/Berlin (ECB publishes ~16:00 CET), `fxMorning` daily 09:00 IST as a backstop, and the callable `refreshFx({ date? })` — the latest is fetched from outside at most once per 10 min (else the stored doc is returned), a stored past date is never re-fetched; on a fetch error the stored copy is returned if there is one. Upstream: Frankfurter `/v2/rates?providers=ECB[&date=]` (since May 2026 `/v1` answers with a `Deprecation` header pointing at `/v2/rates`, which mixes providers unless filtered), falling back to `/v1/{date|latest}`.
  - Client lookup (`getRate` in `src/lib/fx.ts`): (1) `localStorage` cache (`splitit-fx-v1`, per (date, base); a EUR-based shared entry answers every pair; past dates forever, today's for 6 h) → (2) Firestore `fxRates/latest` for today/future (calling `refreshFx()` if it's older than a day) or `fxRates/{date}` for a past date (calling `refreshFx({date})` when it's missing, which stores it) → (3) Frankfurter `https://api.frankfurter.dev/v1/{date|latest}?base=XXX` directly — demo mode (the local repo's `getFxRates`/`refreshFx` return null), signed out, or Firebase unreachable. Shared lookups time out after 8 s. The repo is injected with `setFxShared(repo)` in `src/data/index.ts`, so `fx.ts` stays testable without Firebase.
  - Weekends/holidays resolve to the previous business day, which is what `rateDate` records; future dates use the latest rate. Offline, unsupported currencies (ECB doesn't publish e.g. AED) or API errors fall back to a typed manual rate.
  - **Settings → Preferences → refresh button** (next to the currency): icon only; the status line below says where the rates came from ("ECB 7 Oct, fetched 10:42", also in its `aria-label`/`title`). Tapping calls `refreshFx()` (updating the shared copy for everyone), then the local cache.
- **Home-currency view**: Home and Insights ("All groups") add groups in other currencies to the user's profile currency at *today's* ECB rate, labelled "≈". The exact per-currency numbers stay on Home ("Exact: …") and on each group. Groups whose rate isn't available are listed, not converted.
- Rules: `original` is optional; if present it must have exactly those keys, a 3-letter `currency`, an int `amount` > 0, a numeric `rate` > 0, a 10-char `rateDate` and `source` in `ecb|manual` (`tests/firestore.fx.test.ts`).
- **Out of scope:** settling up in a currency other than the group's. A settlement is still recorded in the group currency; pay the converted amount in your own bank/wallet. Supporting it would need `original` on settlements and an FX-aware settle sheet.

### 4.2 Firestore data model

Every collection the app or the functions touch. "Server" = written by Cloud Functions with the Admin SDK; the rules deny those writes from clients. Sizes in brackets are what `firestore.rules` enforces.

```
users/{uid}                                   ← private: only the owner reads or writes it (uid field == doc id)
  uid, displayName, email?, photoURL?, photoSource?: upload|google|none, currency, phone?,
  payment?: { upi?, phone?, account?, ifsc?, payid?, bsb?, paypal?, revolut? }
  approvalDefault?, editAutoApproveDefault?: { on: bool, amount (int 1..1e11), currency (3 letters) }  ← legacy, unused: the app no longer reads or writes them (approval is a group setting); the rules still validate them so old documents stay valid

users/{uid}/captures/{id}                     ← the Inbox: captured payments waiting to be sorted (owner only)
  amount (int > 0), currency?, merchant, date, ts?, source, card?, raw?, note?, suggestedGroup?,
  status: pending|assigned|dismissed, groupId?, expenseId?, createdAt, updatedAt

users/{uid}/pushTokens/{sha256(token)}        ← one per browser (owner; functions read, send, prune)
  token (≤ 4096), ua? (≤ 300), createdAt, lastSeen       ← lastSeen refreshed at most daily; 90 days unseen → deleted

users/{uid}/settings/notifications            ← push preferences + auto-capture filters + AI switches (owner; merged writes)
  captures, unsorted, expenses, settlements, reminders: bool          push kinds
  outsideTrips: bool                                                 keep debits outside every trip
  capturePaused: bool, minAmount: int paise (≤ 1,00,00,000), ignoreWords: string[] (≤ 20)
  pausedTrips: string[] (group ids, unique, ≤ 100)                  trips this person paused capture for (their own choice)
  aiEnabled, aiImages, aiSms, aiSmsMerchant: bool, aiSource: auto|own|app, aiModel (≤ 80), updatedAt

users/{uid}/settings/merchants                ← merchant memory (owner; whole-document replace)
  categories: { [normalisedMerchant]: Category }, touched: { [normalisedMerchant]: epochMs }   ← ≤ 200 each
  updatedAt

users/{uid}/captureLog/recent                 ← server: what the webhook did (owner reads / deletes)
  entries: [{ at, result, amount?, currency?, merchant?, groupName?, device }]   ← newest first, ≤ 30, never SMS text

users/{uid}/secrets/gemini                    ← server only: the user's own Gemini key, sealed (AES-256-GCM, §4.3)
users/{uid}/aiState/status                    ← server: hint (masked key), models, lastOkAt, lastError { kind, at }, updatedAt (owner reads)

groups/{groupId}                              ← readable/writable by members (uid in memberUids)
  name (≤ 80), emoji (≤ 16), type: trip|outing|home|couple|event|office|other|direct|personal
  currency (3 letters), budget? (int minor units), startDate?, endDate? (yyyy-mm-dd, inclusive trip window)
  simplify?: bool, requireApproval?: bool, approvalThreshold? (int > 0)      ← approval settings: any member; no threshold = the currency's default (approvalThresholdOf)
  editAutoApprove? (int > 0)                                                  ← edit auto-approve amount: any member; absent = off
  captureOff?: bool (legacy group-wide capture pause: ignored, still allowed so old docs stay valid), archived?: bool   ← any member may flip
  memberUids: string[] (≤ 60)                 ← used by security rules & queries
  members: { [memberId]: { name, email?, uid?, color, photoURL? (https ≤ 2048) } } (≤ 60)
                                              ← a member with an account keeps their own name + photo in step with their profile (isOwnMemberEdit, src/lib/memberSync.ts)
  inviteCode (≥ 8 chars), createdBy, createdAt, updatedAt
  memberOpId                                  ← the single members key the last membership write touched (rules)
  joinCode, joinMemberId                      ← set by the last join (rules)

groups/{groupId}/profiles/{uid}               ← what a member shares with ONE group; written only by the owner
  displayName, payment, photoURL? (https)

groups/{groupId}/expenses/{expenseId}
  groupId, description (≤ 200), amount (int > 0), category, date (ISO), notes? (≤ 2000)
  paidBy:  { [memberId]: minor } (≤ 60 keys, member ids only)   ← sums to amount
  splits:  { [memberId]: minor } (≤ 60 keys, member ids only)   ← sums to amount
  splitType: equal|exact|percent|shares|adjust|itemized
  splitInput: raw user input for re-editing (selected, exact, percent, shares, adjust, items)
  receiptUrl? (https, ≤ 1024), receiptPath? (receipts/<groupId>/<file>), createdBy, createdAt, updatedAt
  original?: { currency, amount, rate, rateDate, source: ecb|manual }   ← foreign-currency entry (§4.1a)
  recurrence?: { freq: weekly|fortnightly|monthly|yearly, nextDate, until? }   ← on a template
  recurringFrom?: templateId                                                  ← on a generated copy
  importedFrom?: 'splitwise' | 'csv'                                          ← set by the import (also on settlements)
  deletedAt?, deletedBy? (uid)                                                ← in "Recently deleted"
  dispute?: { [uid]: { byUid, memberId, reason (≤ 500), at } }                ← open flags
  requiresApproval?: true, approvals?: { [uid]: true }                        ← approval workflow; an edit may drop requiresApproval only when the new amount no longer needs approval; an amount change that still needs it resets approvals to the editor's own unless within the group's editAutoApprove

groups/{groupId}/expenses/{expenseId}/comments/{commentId}
  text (≤ 2000), authorUid, authorName, createdAt

groups/{groupId}/settlements/{settlementId}
  groupId, from: memberId, to: memberId (≠ from), amount (int > 0), method? (≤ 40; 'waived' for a let-go remainder),
  note? (≤ 500), date, createdBy, createdAt, importedFrom?, payLink? (≤ 40, the Pay me link it cleared), deletedAt?, deletedBy?  ← only these keys (rules whitelist)

groups/{groupId}/activity/{activityId}        ← append-only; same batch as the change
  type: expense.created|updated|deleted|restored|purged|disputed|resolved|approved|imported
        settlement.created|deleted|restored|purged, member.added|removed,
        group.updated (targetId = the group id)                              ← the 16 a client may write
        settlement.nudged                                                     ← server only (nudge callable)
        settlement.claimed                                                    ← server only (onPayLinkPaid; targetId = a Pay me link code)
  actorUid, actorName (≤ 100), targetId (≤ 200), summary (≤ 500), before?, after? (maps), createdAt

invites/{inviteCode}                          ← readable by any signed-in (non-anonymous) user
  groupId, groupName? (≤ 80), emoji?, placeholders? (≤ 60)

captureTokens/{token}                         ← token = 28 random chars (≥ 24 enforced); owner creates/lists/revokes, never updates
  uid, createdAt, groupId? (a group the owner is in), label? (≤ 60), lastUsedAt (server, at most once a minute)

captureInbox/{id}                             ← signed-out drop box for the Apple Pay Shortcut (token must exist and match uid)
  token, uid, merchant (≤ 100), amount? (int > 0) | raw (string), currency?, ts?, src?, card?, createdAt? (for a TTL policy)

tables/{code}                                 ← live table; the doc id is the share code (6–12 chars, no list)
  code, hostUid, groupId?, merchant, currency, date, status: open|closed, createdAt, expiresAt (≤ 24 h)
  items:        { [itemId]: { name, amount, pos } } (≤ 200)
  extras:       { tax, tip, discount }                       ← tip split equally; tax − discount per taxSplit
  taxSplit?:    'items' | 'equal'                            ← absent = 'items' (by item subtotals); host may change it
  participants: { [pid]: { name (≤ 40), uid?, joinedAt } }   ← pid = uid for people with a phone
  claims:       { [pid]: { [itemId]: shares } }              ← per participant so rules can scope writes
  hostPayment?, expenseId?, closedGroupId?, payLinks?: { [pid]: payLinkCode }   ← set by the host on Finish

payLinks/{code}                               ← Pay me link; code = 20–40 lowercase letters/digits (24 random), get by anyone signed in (anonymous too); list: the payee's own only
  groupId? | tableCode (no group: a live table the creator hosts), groupName (≤ 80), emoji? (≤ 16), from, to (member ids; participant ids without a group),
  amount (int > 0), currency (= the group's), payeeName, payerName (≤ 80), payment: { upi?, phone?, payid?, paypal?, revolut? } (≤ 100 each),
  forUid? (only this uid may mark it paid), createdBy (the payee), createdAt, expiresAt (≤ 31 days), status: open|claimed|paid|cancelled (claimed: a table link without forUid waiting for the host),
  paidAt?, paidBy? (uid that tapped "I've paid"), method? (≤ 40), proofPath? (payproofs/{code}/<name>.jpg), cancelledAt?,
  settlementId? (a member's own from Settle up, or the server's pl_{code}), recordedAt? (server)

fxRates/{yyyy-mm-dd | latest}                 ← server; any signed-in user reads (§4.1a)

config/app                                    ← admin-written, readable by everyone, signed out included (§3.8)
  maintenance, maintenanceMessage? (≤ 300), minVersion (x.y.z), announcement?: { text (≤ 300), level: info|warn, until? } | null,
  flags: { aiImages, aiSms, liveTables, autoCapture, quickAdd, nudges, statementImport, payLinks, duplicates, merchantMemory, whoseTurn, budgetAlerts },
  signups: open|invite, version? (the version shown in Profile, e.g. 2.1.1; set in /admin), updatedAt, updatedBy
config/limits                                 ← admin read/write; functions read (60 s cache); ranges in shared/limits.ts
  capturePerHour (60), capturePerDay (300), aiOwnPerHour (120), aiOwnPerDay (600), nudgePerDay (1),
  fxPerUserPerHour (30), fxPerUserPerDay (200), updatedAt, updatedBy
config/ai                                     ← admin read/write; everyone else asks the aiStatus callable
  mode: off|everyone|allowlist, allowEmails (≤ 200), images, sms: bool, model (≤ 80), perHour (30), perDay (100), globalPerDay (2000), updatedAt, updatedBy
private/geminiAppKey                          ← server only: the admin's in-app project key, sealed (overrides Secret Manager)

admins/{uid}                                  ← created by hand in the console; a user may read only their own entry
blocked/{uid}                                 ← server (adminBlockUser): { reason, at, by }; the account reads its own, admins any
stats/{ai|capture|push|nudge}_{yyyy-mm-dd}    ← server counters, admins read (ai: calls per key kind and feature, tokens, errors, denied_*;
                                                 capture: received + each outcome + ai; push: sent, failed, dead; nudge: sent, in_app, denied)
rateLimits/{id}                               ← server only: { hourStart, hourCount, dayStart, dayCount }
                                                 ids: <capture key hash>, ai_{own|app|keycheck}_{uid}, fx_{uid}, nudge_{gid}_{uid}_{memberId}, nudgep_{uid}_{debtorUid}
reminderState/{groupId}                       ← server only: lastSent { uid: ms }, candidates { memberId: ms }, hasCandidates, evaluatedAt,
                                                 budget?: { at: budget minor units, alerted: [80, 100] }
```

A **member id** is stable and separate from a Firebase uid. A placeholder member has no `uid`. When someone joins via invite and claims a placeholder, `members[id].uid` is set and their uid is added to `memberUids`. No expenses are rewritten.

Firestore indexes: one field override, a collection-group index on `pushTokens.token` (`firestore.indexes.json`). Recommended console settings (not in code): TTL policies on `captureInbox.createdAt` and `rateLimits/*`.

### 4.3 Security model (summary — see `firestore.rules`, `storage.rules`, `firebase.json`, `tests/`)
- **Who is a user.** `isUser()` = signed in **and** not anonymous (`sign_in_provider != 'anonymous'`), used everywhere except `tables/*`, `payLinks/*`, `fxRates/*` and the token-authenticated `captureInbox` path. Anonymous accounts exist only for live tables and Pay me links: they can read a table whose code they have and write their own participant entry and claims, read a Pay me link by its code and mark it paid, and read the shared rates; they can't read invites or groups, join or create anything, or read any user document (`tests/firestore.anonymous.test.ts`).
- **Writes can be frozen.** Every write rule carries `writesOpen()` = `(!maintenanceOn() && !isBlocked()) || isAdmin()`: maintenance mode (`config/app.maintenance`) and blocked accounts (`blocked/{uid}`) stop every write except an admin's. Deletes under `users/{uid}/*` stay open so a frozen account can still sign out cleanly (`tests/firestore.admin.test.ts`).
- **Document shapes are validated, not just membership.** Group create/update check the whole document (`validGroupShape`: key whitelist incl. `archived` and `captureOff`, name ≤ 80, emoji ≤ 16, a known `type`, a 3-letter currency, ≤ 60 members and memberUids, typed dates/budget/threshold); any member may change the approval settings and the currency (owner decision, Oct 2026); invite codes are ≥ 8 characters on the group and as the `invites/{code}` id; expenses cap `description` ≤ 200, `notes` ≤ 2000, `paidBy`/`splits` ≤ 60 keys that must be member ids, `receiptUrl` https ≤ 1024, `receiptPath` matching `receipts/<gid>/[A-Za-z0-9_.-]+`; settlements `method` ≤ 40, `note` ≤ 500, `from ≠ to`; comments ≤ 2000; `settings/notifications` and `settings/merchants` have key whitelists, types, ranges and map-size caps (`pausedTrips` a list of ≤ 100); `pushTokens` keys and sizes; `captureTokens` only `uid, createdAt, groupId?, label?` with `groupId` a group the owner is in; `captureInbox` typed and sized; every `config/*` document field by field (`validAppConfig`, `validLimits`, `validAiConfig`; `validFlags` must match `FLAG_NAMES` in `src/lib/flags.ts`, a test keeps them equal).
- **Private profile vs shared handles.** A user can read/write only their own `users/{uid}` doc (it holds their email). Payment handles shown in settle-up live in `groups/{groupId}/profiles/{uid}`: readable by that group's members, writable only by `uid` (via `getAfter`, so create-group and join can write it in the same batch). *Why not `members[id].payment`?* Any co-member can write the group doc, and rules can't stop one member editing another's map entry without iterating the map.
- **Membership integrity** (member updates): existing `members` entries are never edited in place (so a `uid` can't be reassigned); every add/remove names its single key in `memberOpId`; added entries are placeholders (no `uid`); `memberUids` never grows here and only shrinks when you remove yourself or the creator removes someone (the entry and the uid go together). New groups start with `memberUids == [creator]`. This is exactly what Leave group and Remove member do. One more path, `isOwnMemberEdit()`: a member with a uid may change only `name` and `photoURL` of their own entry, named in `memberOpId` (tests in `tests/firestore.hardening.test.ts`).
- **Deleting a group** is creator-only: the app deletes sub-collections in ≤ 450-write batches, then activity + invite + group in the last batch (the creator may delete any comment, so a big group needs no per-expense `existsAfter`; `tests/firestore.delete-group.test.ts`); `onGroupDeleted` sweeps anything left.
- **Join**: a non-member may update a group only to add *their own uid* to `memberUids` and exactly one member entry carrying it, and only when they supply a `joinCode` that matches `inviteCode`. Already-members can't re-join.
- **Invites**: written only by a member of the group they point at, only if that group's `inviteCode` equals the doc id, `groupId` never changes, keys restricted. `isLeaverCleanup()` lets someone leaving (a member before the batch, not after) remove placeholder entries from the invite in the same batch, and nothing else.
- **Expenses/settlements**: members only; `createdBy` must be the writer on create and is immutable (exception: a recurring occurrence `<templateId>_<date>` keeps its template's `createdBy`); comments are deleted in the same batch as their expense (or after it is gone). The client also ignores any expense whose `paidBy` or `splits` don't add up to `amount` (`countable()`).
- **Trust fields** (`tests/firestore.trust.test.ts`): an update is exactly one of (a) a normal edit, which may not touch `dispute`/`deletedAt`/`deletedBy`, may only *remove* `approvals` keys and can drop `requiresApproval` only when the new amount no longer needs approval; an amount change that still needs approval must leave at most the editor's own approval (`approvalsResetOk`) unless the expense was marked and the change is within the group's `editAutoApprove` both ways (`withinEditAutoApprove`) (`tests/firestore.approvals.test.ts`); (b) a trash change: only `deletedAt`/`deletedBy`, with `deletedBy == auth.uid` when trashing, both removed when restoring; (c) a flag/approval: only `dispute`/`approvals` change and `diff().affectedKeys()` of each map is at most `[auth.uid]`; a flag must be `byUid == auth.uid` with a `memberId` that is the caller's and is in the expense; an approval value must be `true`. Creates can't carry trust fields. With `requireApproval`, an expense above the group's threshold (`approvalThresholdOf`: `approvalThreshold`, else the currency default) must carry `requiresApproval` when created or when its amount changes. The legacy, unused `users/{uid}.approvalDefault` and `editAutoApproveDefault` are still shape-checked (`validAmountSetting`); `editAutoApprove` may be changed by any member. **Hard delete**: only `deletedBy` or the group creator.
- **Activity**: create-only by members with `actorUid == auth.uid`, a whitelist of the 15 client-written types (so no client can fake a `settlement.nudged`), whitelisted keys, summary ≤ 500; no update; delete only by the group creator in the batch that deletes the group (`!existsAfter(group)`); the `onGroupDeleted` trigger removes the rest.
- **Admin documents** (§3.8): `admins/{uid}` is console-managed and readable only by that user; `config/app` is world-readable (no secrets), `config/limits` and `config/ai` admin-read, every `config/*` write admin-only and validated; `blocked/*`, `stats/*`, `rateLimits/*`, `reminderState/*`, `private/*` and `users/{uid}/secrets/*` have no client write at all.
- **Keys at rest.** Gemini keys (`users/{uid}/secrets/gemini`, `private/geminiAppKey`) are sealed with AES-256-GCM under a 32-byte key-encryption key from Secret Manager (`AI_KEY_KEK`; `functions/src/lib/seal.ts`): a Firestore export or a console reader sees only ciphertext. Legacy plaintext keys are read and re-sealed on next use; rotation is `"<new>,<old>"` for a week, then `"<new>"`. The allow-list in `config/ai` is matched against the email only when `email_verified`.
- **What reaches Gemini**: downscaled images the user chose; bank SMS only masked (`maskSms()`: account, card and phone digits, balances removed), only for bank-looking messages, only when the parser failed (or found no payee and the user opted in); prompts are system instructions with the untrusted text wrapped and labelled as data; answers are JSON-schema constrained and validated again.
- **Capture webhook**: a 140-bit bearer key per user, per-IP limit (60/min/instance), 16 KB body cap, a 5-minute negative cache of unknown keys, per-key rate limit, idempotent ids; a scoped key whose group vanished is dead (`bad_scope`), never widened to every trip. No App Check (automations can't).
- **Live tables**: any signed-in user (anonymous included) who knows the code can `get` an open, unexpired table (no `list`); the host and participants can still read it after it closes. A guest may only add/rename *their own* participant entry and replace *their own* claims (keys limited to existing items), and only while it's open. The host may change anything except `hostUid`, `code`, `createdAt` and `expiresAt`; `taxSplit`, when present, is `'items'` or `'equal'` (on create and update). Share values are validated on the client (`sanitizeClaims`) because rules can't iterate a map.
- **Pay me links** (`tests/firestore.paylinks.test.ts`, `tests/storage.payproofs.test.ts`): the code is the secret (120 bits); anyone signed in, anonymous included, may `get` a link; only the payee may `list`, and only their own (the query must filter `createdBy == uid`). Only the payee creates one (their own member entry as `to`, in a group they are in and in its currency, or a live table they host), cancels it while open, or deletes it; its keys, sizes, handles (no bank account numbers) and 31-day life are checked. Anyone else may make exactly one change, once, while it is open and unexpired: `status` open → paid with `paidAt` (now), `paidBy` (themselves), optional `method` and a `proofPath` in that link's folder; `forUid` limits it to one guest; only a group member may add `settlementId`; `recordedAt` is the server's. A live table link without `forUid` can't go straight to paid: the same change makes it `claimed`, and only the payee may then move it claimed → paid (nothing else changed) or claimed → open (every claim field removed). **Accepted exposure (owner's decision):** a link shows the payee's chosen handles (UPI ID, UPI number, PayID, PayPal, Revolut) and the names and amount to anyone who has the link. A false "I've paid" records a payment the payee can delete in the group (said in the push and the activity line). Screenshots (`payproofs/{code}/{file}`): created by whoever has an open link (or only its guest), `image/jpeg` under 5 MB, never overwritten; read by the payee and the group's members; deleted by the payee.
- **Storage** (`storage.rules`): `receipts/{groupId}/{file}` readable, creatable and deletable by that group's members only (a Firestore `memberUids` lookup), `image/(jpeg|png|webp|heic|heif)` under 10 MB, never overwritten in place; `avatars/{uid}/{file}` written by that user, under 2 MB, same types, readable by any user; `payproofs/{code}/{file}` as above. The client deletes a receipt only when its path starts with `receipts/<groupId>/`.
- **Hosting headers** (`firebase.json`, identical on both sites): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (so `/join/<code>` and `/t/<code>` never leak), `X-Frame-Options: DENY`, `Permissions-Policy` allowing only the camera, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google popup sign-in), and a `Content-Security-Policy-Report-Only` listing every origin the code uses (Firebase, Google sign-in, reCAPTCHA Enterprise, FCM, Frankfurter, jsDelivr for Tesseract language data). It reports only until a week of console checks is clean, then becomes enforcing. Service-worker files are `Cache-Control: no-cache`.
- **App Check** (reCAPTCHA Enterprise) is wired but in monitor mode; `firebase/app-check` loads lazily after `initializeApp`, which can let the very first request go out without a token. Before enforcing, make the first repo call await `initAppCheck` (or revert to a static import), and move the Apple Pay Shortcut off the REST `captureInbox` path (it carries no token). The `capture` webhook and the Firestore triggers are unaffected.
- Known gaps: rules can't iterate maps, so the *creator* could seed fake `uid` entries when first creating a group (that only affects their own group); `members[*].email` is still written by the Join screen (forbidding it in rules would break joining today); Firebase web API keys are public by design, security lives in the rules.

### 4.4 Algorithms
- **Split engine** (`src/lib/splits.ts`): each split type becomes `{memberId: minor}`. Rounding uses the largest-remainder method, with ties broken by member order, so results are deterministic. Negative, non-finite and over-100 % inputs throw `SplitError`; the final allocation is checked against the total.
- **Balances** (`src/lib/balances.ts`, `shared/balances-core.ts`): `net[m] = Σpaid − Σshare + Σsettlements_sent − Σsettlements_received`, over countable, live, approved expenses.
- **Pairwise debts**: for each expense, each non-payer owes each payer in proportion to what that payer paid (single payer: a direct loop).
- **Simplify** (`src/lib/simplify.ts`): greedy — repeatedly match the largest creditor with the largest debtor (sorted once, remainders re-inserted). It produces at most n−1 transfers and never changes anyone's net position. A truly minimal transfer count is NP-hard; greedy is what Splitwise does too.
- **Trip matching** (`shared/trips.ts`): the groups whose window contains the date, ranked by the shortest window, then a matching currency, then the most recently active; paused and archived trips never match. The webhook and the Inbox card use the same function, so the prompt and the card agree.
- **Duplicates** (`src/lib/duplicates.ts`), **merchant memory** (`merchants.ts`), **Quick add grammar** (`nl-expense.ts`), **whose turn** (`fairness.ts`) and the **reminder clock** (`functions/src/lib/balances.ts`: a debt counts from the day it went over the threshold) are described in §3.

### 4.5 Reading a bill: OCR and AI
1. User picks or takes a photo (`<input type="file" accept="image/*" capture="environment">`) or shares one from Android.
2. The image is downscaled on a canvas (max 1600px).
3. **AI first when it can run** (`readReceipt` in `src/lib/ai.ts`): the user's AI switch is on, the device is online, not in demo mode, and `aiStatus` says a key can serve the account → `parseReceiptAi` (Gemini, JSON schema, server-validated). Any decline (`off`, `not_listed`, `not_configured`, `quota`, `bad_key`, `server`) or failure falls through to step 4 with a quiet line, once per session for the quiet reasons.
4. **On-device OCR**: Tesseract.js in one worker reused across scans (terminated after 60 s idle; `warmOcr()` starts it early when OCR is the likely path). The worker, the Emscripten glue and the `.wasm` core (relaxed-SIMD, SIMD or basic, picked by `WebAssembly.validate`) are self-hosted under `/tesseract/` (`scripts/vite-tesseract.ts`) and cached by the service worker on first use; the English model comes from jsDelivr once and is cached.
5. `src/lib/ocr-parse.ts` heuristics:
   - Amounts: with a currency marker (₹, Rs., INR, $ …) whole numbers and lakh grouping count; without one a figure needs two decimals, so phone numbers and UPI reference numbers aren't read as money
   - Total: GRAND TOTAL / NET AMOUNT / AMOUNT PAYABLE / TOTAL / AMOUNT DUE / BALANCE lines (not SUBTOTAL or TOTAL QTY), else the largest currency amount
   - Date: several numeric and month-name formats
   - Merchant: first non-trivial line
   - Line items: `<text> <amount>` lines above the total
   - Payment screenshots: "Paid / Sent / Paid Successfully / Transfer to <Name>" or "To: <Name>" + the first ₹ amount (cashback lines ignored); UPI app names, UTR or a VPA mean method UPI
6. The result **pre-fills** a form (currency from the reader, then the profile). Nothing is saved without the user confirming.

### 4.6 Performance architecture (what keeps first paint and tab switches cheap)
- **One listener per query** (`src/data/store.ts`): every hook in `src/hooks/data.ts` reads a shared, refcounted live query through `useSyncExternalStore`; the last value is replayed synchronously to a late subscriber (no loading flash on a tab switch), a listener lingers five minutes after its last subscriber leaves, a failed query is restarted on the next subscribe, and `clearSharedStore()` runs on sign-out. `GroupDataProvider` (`src/hooks/groupData.tsx`) computes the all-groups view once for the whole app; `computeGroupData` is memoised per group on snapshot identity. Repo watchers pass `SnapMeta` (`fromCache`, `hasPendingWrites`, `error`), so an empty cached snapshot never counts as "all settled" (up to a 4 s grace for the server) and a metadata-only change reuses the previous array.
- **Data layer chosen at build time**: `#repo-impl` (`vite.config.ts`) resolves to `src/data/impl.firebase.ts` when `VITE_FIREBASE_API_KEY/PROJECT_ID/APP_ID` are set for the mode, else `src/data/impl.local.ts`. Both are static imports, so the browser downloads the data layer with the entry instead of discovering it after React started; a Firebase build ships no demo code and the demo build (`vite --mode e2e`, a checkout without `.env.local`) ships no Firebase SDK. `initRepo()` is synchronous. First-paint JS went from 351 kB gzip in two serial stages to 306 kB in one.
- **CSS-only splash**: `index.html` paints the splash (dark, the manifest's `background_color`, with a faint accent glow; the logo pops in and slides up, then the tagline arrives in two lines) as markup inside `#root`, so the first contentful paint is HTML + CSS, not React. `<Splash/>` in `App.tsx` renders the same markup offset by the time already elapsed, so the animation continues through the hand-over. Opening the installed app holds it over the loading app until the animation has played (about 1.8 s from page start, once per session, never with reduced motion; `src/lib/splash.ts`); a browser tab never waits.
- **Self-hosted Inter**: `src/fonts.css` (from `@fontsource-variable/inter`, variable 100–900, Latin + Latin Extended, `font-display: swap`, preloaded by a build plugin, precached) replaced the render-blocking Google Fonts stylesheet; `'Inter Fallback'` is Arial sized to Inter's metrics so the swap doesn't reflow.
- **`re2js` stub** (`src/stubs/re2js.ts`): Firestore imports a 43 kB-gzip regex engine for pipeline expressions the app never issues; the alias replaces it with a class whose `compile` throws. Re-check after every `firebase` upgrade (`grep -l re2js node_modules/@firebase/firestore/dist/*.esm.js`).
- **Lazy `firebase/app-check`**, and `firebase/storage` loaded on the first upload or delete.
- **Route prefetch** (`src/routes.ts`): one `import()` thunk per lazy screen shared by `lazy()` and the prefetchers; GroupDetail, ExpenseForm, Insights and Profile are fetched on idle after the first signed-in paint (not under Data Saver), and a `pointerdown` on any same-origin link fetches that route's chunk. `Suspense` sits inside the layout so the tab bar stays.
- **Cached `Intl` formatters** (`src/lib/locale.ts`) for every date in lists.
- **Hand-rolled charts**: the Insights chunk fell from 119 kB to 7 kB gzip when `recharts` left.
- **OCR**: one Tesseract worker reused across scans; glue + `.wasm` instead of the base64 single-file build (`dist/tesseract` 12 MB → 8.6 MB, one pair fetched per device, compiled while streaming).
- **Aurora** animates with transform and opacity only and pauses while off-screen or in a hidden tab.
- Measured per-chunk before/after sizes from the audit are in the audit notes (§9).

### 4.7 Icon pipeline
- `public/favicon.svg` is the one source (the original mark; the design is unchanged). `npm run icons` (`scripts/generate-icons.mjs`, sharp) regenerates `pwa-192.png`, `pwa-512.png` (the whole tile), `pwa-maskable-512.png` (the tile's gradient full-bleed with square corners and the mark at 46% of the width, so Android's circle / squircle crop looks like the iOS icon rather than a tile in a box), `apple-touch-icon.png` (180, square corners, no alpha), `badge-96.png` (white silhouette on transparent: the notification badge and the manifest shortcut icons, since Android keeps only the alpha) and `pwa-mono-512.png` (`purpose: 'monochrome'`). `ICON_BG='#rrggbb' npm run icons` overrides the colour behind the Apple icon. The script assumes only that the first shape after `</defs>` is a `<rect … rx>` background and that the gradient has two stops.
- At runtime `applyIconTint()` (`src/lib/accent.ts`) fetches `/favicon.svg` once and sets a tinted `data:` URL on `<link rel="icon">` for the active accent (desktop tabs). Home-screen icons are minted from the PNGs at install time and cannot follow it.

---

## 5. Design system
- Mobile first. Bottom tab bar: Home · Groups · **+** (opens the Create sheet: Add expense first and primary, then Split by items, Scan, New group, Settle up) · Insights · Profile. Inbox is reached from Home's header (with the to-sort / updates badge).
- Colour: a brand → duo gradient per accent; seven accents (Violet default; Ocean; Neon, highlighter lime → aqua with dark text on its fills; Berry, berry → teal; Lime, yellow-green → petrol cyan; Gold, gold → amber; Graphite) as `--color-brand-*` / `--color-duo-*` scales in `src/index.css`, keyed on `<html data-accent>`, with a dual-tone switch. Accent fills that carry text or icons (buttons, chips, the Home card, the + button, toggles, badges) use separate `--color-fill` / `--color-fill-to` / `--color-on-fill` tokens (utilities `bg-fill`, `from-fill to-fill-to`, `text-on-fill`), which every preset but Neon points at brand-600 / duo-600 / white. A stored retired Saffron or Amber becomes Gold, Indigo becomes Ocean; Emerald and Rose become Violet. Emerald and Rose are reserved for "owed to you" / "you owe" and are not accents, and no accent's 500/600 hue sits within 25° of either (a test checks it; Lime is a yellow-green, hue ~129 against emerald's ~166); every accent's on-fill colour reads at ≥ 4.5:1 on its fill and fill-to, and its brand-600 reads as text on white at ≥ 4.5:1 (tests enforce both). Secondary text uses `text-muted` (slate-600 / slate-400), never slate-400-as-text; `text-slate-400` stays for decorative glyphs only.
- Rounded-2xl cards, soft glass surfaces in dark mode, a frosted notch under the + button, tappable targets ≥ 44px, labelled controls, state never by colour alone.
- Typeface: Inter, self-hosted and variable (§4.6), with a metrics-matched Arial fallback.
- Charts: `src/components/charts` with the colour-blind-checked palette in `src/lib/chartPalette.ts`; category colours elsewhere are decorative.
- Motion: subtle sheet slide-ups (drag down to close), the Aurora smoke blend on the + button and the Home card, number transitions; everything stops under `prefers-reduced-motion` and infinite animations pause off-screen.
- Copy: plain English, no exclamation marks, the glossary in §8.

---

## 6. Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo, tooling, docs, Firebase config, rules, PWA shell | ✅ |
| 1 | Auth, groups, members, invites, expenses (all split types), balances, simplify, settle-up | ✅ |
| 2 | OCR receipts + payment screenshots, insights charts, install banner, debt graph | ✅ |
| 3 | Recurring expenses, CSV export, comments, Splitwise/CSV import, activity/history/trash/flags/approval, push notifications, archive/leave/remove member | ✅ |
| 4 | Multi-currency with FX ✅, AI reading of bills, statements and SMS ✅, auto-capture webhook ✅, live tables ✅; Apple sign-in ⏳ | 🟡 |
| 5 (Oct 2026 audit) | Data layer and bundle work, rules and functions hardening, Settings IA, Pay me link / Nudge / Quick add / duplicates / merchant memory / whose turn / budget alerts, admin console, lint + CI + e2e | ✅ (§9) |
| 6 | Year-in-review, Splitwise API import, settling in another currency, open banking / email capture, Identity Platform sign-up gate, Apple sign-in | ⏳ |

---

## 7. Known risks & decisions
- **Name: "Split Now" — trademark not yet checked.** Search app stores and the Indian trademark registry (and WIPO for later global use) before launch; the code keeps `split-it` ids so a rename is copy-only.
- **UPI deep links are best-effort.** NPCI and the UPI apps have tightened link-initiated P2P payments over time; the QR (scan from another phone) and copying the UPI ID are the fallbacks and always work. Scheme names should be rechecked periodically.
- **No real in-app money movement.** That needs a licensed payment provider and KYC. Settle-up records the payment and helps the user pay through their own bank or wallet.
- **iOS install** cannot be triggered from JavaScript. The banner shows instructions instead.
- **iOS PWA storage** can be evicted if the app isn't opened for weeks. Firestore is the source of truth, so only the offline cache is lost.
- **OCR accuracy** on crumpled or thermal receipts is mediocre; the UI always shows parsed values for confirmation. Gemini is the better reader, and it is the one feature that sends user data to a third party: off by default (`config/ai.mode`), one switch per user, masked SMS only, a project-wide daily budget, and keys sealed at rest.
- **Offline-first writes.** Every save is a `writeBatch` (e.g. the expense plus the group's `updatedAt` bump) that the repo commits *without awaiting the server*: Firestore applies it to the local cache immediately, so screens never hang offline. If the server later rejects it, `repo.onError` fires and `App` shows a toast through `errText()`. Edits write only the changed fields (with the server's copy as "before" when it answers within 1.5 s). Receipts upload after the expense is saved (downscaled to 1600px JPEG, skipped offline, 60 s retry cap) and then patch `receiptUrl`/`receiptPath`. Maintenance mode rejects queued offline writes when they sync, so keep windows short.
- **Sign-out** waits briefly for pending writes, then terminates Firestore and clears its IndexedDB cache before reloading, so the next person on a shared device can't read the previous user's data. When writes are still pending (offline, or not acknowledged within 5 s) the cache is kept, with a warning, rather than deleting the queued writes; the app itself cannot show it to another account.
- **Fresh groups.** A group created a moment ago may be refused by the first server listen (the rules read a doc that hasn't landed); `src/lib/fresh.ts` retries, and the shared store keeps that behaviour.
- **Data layer by build.** `.env.production` holds the Firebase keys, so `npm run build` is a Firebase build; `vite --mode e2e` and a checkout without `.env.local` are demo builds. A `.env.e2e.local` with Firebase keys would point the Playwright suite at a real project: don't create one.
- **CSP is report-only** until a week of console checks is clean; App Check is in monitor mode (§4.3).
- **OCR offline.** The Tesseract worker and cores are self-hosted under `/tesseract/` and cached by the service worker on first use; the English language data comes from jsDelivr once and is cached in IndexedDB + the SW.
- **Firebase web API keys are not secrets.** Security lives in the rules. Still, enable App Check before going public.
- **Admins are exempt** from maintenance mode and "Update required", so a typo in the console can always be undone from the console.

---

## 8. Glossary (the words the UI uses)

| Term | Meaning |
|---|---|
| **Add expense** | Creating an expense (never "create" or "new expense" in copy) |
| **Record a payment** / **Settle up** | Entering a payment between two people; "Settle up" is the screen and the balances action |
| **Split by items** | The itemised split: receipt lines assigned to people, tax/tip spread proportionally (at a live table the tip is split equally and tax & fees by items or equally) |
| **Live table** | The QR-shared bill at the restaurant (`/t/<code>`), where everyone claims their items |
| **Live trip** | A group whose trip dates include today |
| **Captured payment** | A payment that arrived from outside the app (bank SMS, Apple Pay Shortcut, share sheet) and waits in the **Inbox** |
| **Capture key** | The per-user bearer secret an automation sends (`captureTokens/{token}`); never "token" in copy |
| **Scan** | Reading a photo of a bill or payment screenshot, on the device or with AI |
| **Needs your OK** | An expense above the group's approval threshold waiting for your approval (pill: "Needs OK") |
| **Flagged** | An expense someone disputed with a reason (never "disputed" in copy) |
| **Quick add** | The natural-language / voice line in the Create sheet that opens the expense form prefilled |
| **Remind** | The share sheet with a reminder text, the **Pay me link** (`/r/{code}`: opens without an account, pays by UPI and "I've paid" records it; a group member lands in their prefilled Settle up) and a PNG card |
| **Nudge** | The push notification to someone who owes you, one per day per group |
| **Not shared** | A captured payment you chose not to add to any group |
| **Recently deleted** | The 30-day trash of expenses and payments |
| **Archived** | A group kept but out of totals, pickers and capture matching |
| **Waived** | The remainder of a part payment that was let go (a settlement with `method: 'waived'`) |

---

## 9. What changed in the October 2026 audit

An audit of the codebase produced sixteen reports (data layer, security, functions, domain logic, UX, design system, performance, auto-capture, AI, PWA, testing, code quality, product); the fixes landed as seven parallel tracks, then two phase-2 tracks and this docs pass, on top of the owner's own feedback round (`docs/REQUESTS-2026-10-08.md`, 26 items, all kept). Facts, not marketing:

- **Data layer**: shared refcounted store, `SnapMeta` on every watcher, partial-field expense edits that no longer clobber concurrent flags, cache fallback for a hanging captures listen, lazy Storage import, sign-out that never deletes pending writes, receipt deletes confined to the group's folder. Splits reject bad input and check the sum; `countable()` runs once; the single-payer pairwise path; Splitwise import survives names with `;` and leading `=+-@`; one local "today".
- **Bundle and first paint**: build-time `#repo-impl`, CSS splash, self-hosted Inter, `re2js` stub, lazy App Check, route prefetch, cached formatters, OCR worker reuse and glue+wasm cores, manifest and workbox fixes, version string. First-paint JS 351 → 306 kB gzip in one stage; Firestore chunk −43 kB gzip; Insights 119 → 7 kB gzip; `dist/tesseract` 12 → 8.6 MB.
- **Security and backend**: `isUser()`, full document shape validation and key whitelists, creator-only approval settings, the leave-group batch, Storage content types, hosting headers and report-only CSP, push-token dedupe trigger, server-side recursive group delete, member-filtered push recipients, debtor-side settlement push, cheaper reminders with candidate memory, webhook pre-auth guards and a single capture-log document, masked and gated Gemini SMS reading, sealed Gemini keys with rotation, `{ unavailable, reason }` contract, retries and model fallbacks, per-user vs keycheck AI limits, a project-wide daily AI budget, usage counters.
- **UX**: the expense form decomposed into a tested state machine and cards with draft persistence; Settle up with round-figure chips and "Waive the rest"; Settings IA (Preferences / Notifications / Automation / AI features / Data / Admin) with autosave; Profile as identity only; first-run card, People section, Groups with direction labels and Archived; GroupDetail ⋯ menu with Archive / Leave / Remove member / Export; Insights rebucketed on local dates with hand-rolled charts and the period in the URL; Inbox bulk add, Ignore merchant, Undo everywhere, skeletons, offline pill; one-tap capture prompt; the three-screen auto-capture wizard; Scan with AI as a quiet option and a currency picker; statement import gated up front; install banner engagement gating; five accents that pass contrast; `text-muted`; headings, labels, 44 px targets, `document.title`, focus on route change.
- **Phase 2 features**: Pay me link + card, Nudge, duplicate warning, merchant memory, Quick add (text and voice, AI assist), whose turn, budget alerts; the admin console (`/admin`) with `config/app` (maintenance, min version, announcement, flags, sign-ups), `config/limits`, `blocked/*`, `stats/*`, `adminStats` / `adminUsers` / `adminBlockUser`, maintenance / update / blocked screens and `writesOpen()` in the rules.
- **Tooling**: Biome 2.5 config matching the house style, `typecheck:all` (app + tooling + functions), a Vitest coverage config, a Playwright smoke suite in demo mode (7 tests, Pixel 7), a four-job CI workflow with emulator jar caching, Dependabot, `CLAUDE.md`. At the end of the pass: 897 unit tests in 65 files, 192 rules tests in 15 files, 18 emulator tests for the functions, `tsc -b` and `typecheck:all` clean.
- **Second pass (9 Oct)**: the owner's UI rounds 2 to 7 (requests 27 to 71: Balances at `/settle`, settle with one person across groups, scan history, member photos and first names, Insights charts with motion and filters, group flow graph, greeting icons, card fireworks, toast deck, + button and tab bar, app version from `config/app`, the group-delete fix) merged in unchanged on screen, with the audit's engineering under it. Fixed on the way: the version editor and the admin console both overwrote `config/app` (now one document, merge writes, one listener, `version` whitelisted); the member-photo sync and seven per-component listeners (capture keys, AI key state) now share the store; the owner's Aurora loop stops while off-screen. Also: Inbox "Add all" flags likely duplicates, the receipt photo survives a reload of the expense form (IndexedDB, `src/lib/draft-blob.ts`), Cancel in Scan really stops the read (`src/lib/abortable.ts`), Statement import says why AI is unavailable.
- **Left for a later pass**: flip the hook-dependency and button-type lint rules from warn to error once the warnings are gone; TTL policies on `captureInbox` and `rateLimits`; drop `members[*].email` once Join stops writing it; an Auth `onDelete` cascade; settling in another currency; year-in-review.
