# Split Now — End-to-End Product & Technical Plan

> Formerly *Split It*. The repo, npm package and Firebase project ids keep the `split-it` name; the user-facing name is **Split Now** (Hosting: `split-now.web.app`). **Trademark check pending:** "Split Now" has not been cleared against existing app-store listings or Indian / international trademark registrations. Do that before any public launch.

This is the source of truth for what we are building, why, and in what order.
Status markers: ✅ built in v0.1 · 🟡 partially built · ⏳ planned.

---

## 1. Product thesis

**India-first, global later.** The first users are the owner's friend group in India: trips (Goa, Coorg, Manali), shared flats (Bengaluru, Mumbai) and dinners, all paid back over UPI. So the defaults are INR, en-IN formatting (₹1,00,000.00, "7 Oct"), UPI-first settle-up, Indian merchants in category guessing and OCR tuned for Indian bills and UPI screenshots. Everything stays multi-currency and region-aware (AUD/PayID and international handles still work), so going global is a matter of adding regions, not rewriting.

Splitwise solved "who owes whom". Its weak points today are where Split Now goes after:

| Splitwise pain | Split Now answer |
|---|---|
| Daily expense cap and ads on the free tier | No caps. Free on Firebase's Spark plan. |
| Receipt scanning and itemization are paid (Pro) | Receipt **and** payment-screenshot OCR, on-device and free |
| Settling up is "mark as paid" only | **UPI-first settle-up**: a UPI QR for the exact amount (scan with any UPI app), `upi://` + Google Pay / PhonePe / Paytm buttons, UPI number, bank A/c + IFSC; PayID/BSB, PayPal.me and Revolut for other regions |
| Simplify debts is a black box | Before/after **debt graph** shows exactly what simplification changed |
| Simplification stops at the group boundary | **Cross-group netting**: one number per friend, across every group |
| Weak analytics | Insights tab: category donut, monthly trend, who-paid-what, top spenders, per-group budget burn-down |
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

### 3.1 Accounts & identity
- ✅ Google sign-in, email/password sign-in and sign-up (Firebase Auth)
- ✅ Demo mode with no Firebase config: data lives in `localStorage`, so the UI runs immediately
- ✅ Profile: display name, default currency (INR for India and unknown regions, else the locale's currency), **payment handles by region**: India: UPI ID, phone number for UPI apps, bank account + IFSC; Australia: PayID, BSB + account; International: PayPal.me, Revolut. "Show all payment options" reveals the rest.
- ✅ **Locale** (`src/lib/locale.ts`): region from `navigator.language` + `Intl` time zone (an Indian time zone wins, so an en-US phone in Asia/Kolkata is still India); numbers and dates use en-IN for India and unknown regions, otherwise the user's locale.
- ⏳ Apple sign-in (needs an Apple developer account), phone OTP

### 3.2 Groups
- ✅ Create a group with a name, emoji, type (Trip, Home, Couple, Event, Other), currency and optional budget
- ✅ Add members by name/email **before they sign up** (placeholder members)
- ✅ Invite by link or code. The person who joins **claims** a placeholder member, so past expenses stay attached
- ✅ Guest-friendly invites: opening `/join/CODE` signed out shows an invite banner on the sign-in screen (sign-up form first, Google one tap), and the app returns to the invite after sign-in (path kept in `sessionStorage`; Google redirect returns to the same URL). Email sign-ups now store the typed name, not the email prefix, so "join as …" shows the right name
- ✅ **Switch from Splitwise in one tap** (`/groups/import`, entry points on Groups and New group): see §3.4b
- ✅ Per-group "Simplify debts" toggle
- ✅ Direct (1:1) expenses use a hidden 2-person group of type `direct` (non-group expenses with a friend)
- ✅ Personal expenses use a hidden 1-person group of type `personal`
- ⏳ Archive a group, leave a group, remove a member (blocked when their balance is non-zero)

### 3.3 Expenses
- ✅ Description, amount, date, category (auto-suggested from the description), notes
- ✅ **Multiple payers** (e.g. A paid $60, B paid $40)
- ✅ Split types:
  - **Equally** among selected people
  - **Exact amounts**
  - **Percentages**
  - **Shares / ratio** (2:1:1)
  - **Adjustments** (equal split plus a +/- per person)
  - **Itemized**: assign receipt line items to people, with tax/tip spread proportionally
- ✅ Cent-exact rounding: leftover cents are distributed deterministically, so splits always sum to the total
- ✅ Edit / delete (creator or any group member). Delete is a **soft delete** (see 3.3b)
- ✅ Receipt image attached (Firebase Storage)
- ✅ Recurring expenses (weekly / fortnightly / monthly / yearly, optional end date) via **client catch-up**: when a member opens a group, missed occurrences are created with deterministic ids (`{templateId}_{yyyy-mm-dd}`) so concurrent clients never duplicate. Month-end dates clamp (Jan 31 → Feb 28/29 → Mar 31). No Cloud Functions.
- ✅ Comment thread on each expense (author-only delete)

### 3.3b Trust: activity feed, edit history, undo/trash, disputes, approval
- ✅ **Activity log** `groups/{gid}/activity`: every expense/settlement create, edit, delete, restore and purge, member add/remove, flag/resolve and approval writes one entry **in the same batch** as the change. Pure diff + wording in `src/lib/activity.ts` (unit-tested), so both repos produce identical text, e.g. *"Sarah changed amount A$80.00 → A$84.00 on “Dinner”"*.
- ✅ **History** card on each expense (per-field before → after, rendered from the stored snapshots with current member names); **Activity** tab on a group; cross-group **Recent activity** on Home (falls back to the latest expenses when no group has activity yet, e.g. data from before this feature).
- ✅ **Soft delete + undo**: deleting an expense or payment sets `deletedAt`/`deletedBy`; balances, lists, insights and export ignore it. A 6 s **Undo** toast replaces the confirm dialog. **Recently deleted** (Activity tab) restores within 30 days; the deleter or the group creator can **Delete forever** (purge: the doc, its comments and its receipt). Items older than 30 days are purged by an allowed member's client when they open the trash. Comments of a trashed expense stay until purge.
- ✅ **Disputes**: anyone who paid or owes on an expense can **Flag** it with a reason → `dispute: { [uid]: { byUid, memberId, reason, at } }` (several flags allowed). Disputed expenses show a badge and still count in balances (labelled on the Balances tab). The flagger resolves (removes) their own flag; both are logged.
- ✅ **Approval** (group setting `requireApproval`, `approvalThreshold` in minor units, default A$100): a new expense strictly above the threshold is saved with `requiresApproval: true` and is **pending** (listed with a badge, excluded from balances) until every charged member with an account other than the author sets `approvals[uid] = true`. A "Needs your OK" card on Home lists what's waiting on you. Editing the money clears other people's approvals.
- Imports (`bulkImport`) write **one** `expense.imported` summary entry ("Sarah imported 12 expenses and 3 payments from Splitwise"); imported rows never carry trust fields and, like any create, rows above the threshold in a `requireApproval` group are marked `requiresApproval` (the rule applies to every create, so imports aren't exempt; a freshly imported group has approval off). Live-table bills are saved through `saveExpense`, so they get an `expense.created` entry and the same trust handling.
- Amounts in activity text are in the group currency; a foreign-currency expense shows its original too, e.g. "฿1,200.00 (A$50.52)". The trust update branches (trash, flag/approval) can't touch `original`; normal edits and creates still pass `validOriginal`.
- Gaps: recurring occurrences are not logged (several clients may generate the same occurrence and an append-only log can't dedupe); receipt attachments aren't logged; only the flagger (not the expense author) can clear a flag; approval is client-side bookkeeping (rules enforce the `requiresApproval` marker and own-key approvals, not the balance exclusion).
- ✅ Search (description/notes), category filter chips and an "involving me" toggle on a group's activity list
- ✅ **Multi-currency expenses with a locked FX rate** (§4.1a): pick a currency next to the amount (remembered per group, e.g. THB for a whole Bangkok trip); the ECB rate for the expense date is fetched from Frankfurter and shown as "≈ ₹6,056.64 at 1 USD = 84.12 INR (ECB, 2026-10-07)", editable, and typed by hand when offline. Captures in a foreign currency prefill the form in that currency. Expense detail shows the original amount and rate.
- ⏳ Settling up in a different currency from the group's (see §4.1a)

### 3.4 Balances, simplification, settling up
- ✅ Per-group net balances
- ✅ Pairwise debts (raw) vs **simplified debts** (greedy min-cash-flow)
- ✅ **Debt graph** visual: raw vs simplified
- ✅ Friends view: **cross-group net** per person
- ✅ Settle-up flow: pick who pays whom and how much, record the settlement, open the payee's handles/deep links
- ✅ Share a reminder via the Web Share API ("You owe me ₹4,210.00 for Goa Trip")
- ✅ **UPI** (`src/lib/payments.ts`): `upi://pay?pa=&pn=&am=&cu=INR&tn=` per NPCI's UPI linking spec, plus app links `tez://upi/pay?…` (Google Pay), `phonepe://pay?…`, `paytmmp://upi/pay?…` (schemes per Razorpay / Juspay / Cashfree UPI-intent docs, Oct 2026). Android shows a chooser for `upi://`; iOS has none and opens whichever app it registered (or nothing), so the app buttons are the reliable path there. The same `upi://` string is shown as a **QR code** for the exact amount, so a friend can scan it from their own phone with any UPI app. When the recipient is you, the card says "show this to <payer>". If the payee hasn't joined, the payer can paste their UPI ID to get the same QR/buttons. Some UPI apps cap or warn on link-initiated person-to-person payments to unverified VPAs; the QR and manual UPI ID still work.
- ✅ Method chips by currency: INR → UPI, Cash, Bank transfer, Other; AUD → PayID, Bank transfer, Cash, PayPal, Other
- ⏳ Push notifications (FCM) for new expenses and reminders

### 3.5 Smart capture (OCR)
- ✅ **Receipt scan**: Tesseract.js runs in the browser and pulls out the total, merchant, date and line items, then pre-fills the expense form (itemized split available)
- ✅ **Payment screenshot scan**: reads Google Pay / PhonePe / Paytm / BHIM success screens ("₹500", "Paid to", "UPI transaction ID", "UTR") as well as bank/PayID/PayPal confirmations, detects amount + payee name (method UPI), matches the payee to a group member and pre-fills a settlement
- ✅ **Indian bills**: ₹ / Rs. / INR amounts with lakh grouping (1,00,000), whole-rupee amounts when a currency marker is present, CGST/SGST/IGST/cess/service charge/round-off lines treated as tax (not items), "Grand Total" / "Net Amount" / "Amount Payable" as the total, qty × rate columns stripped from item names
- ✅ **Category guessing** for Indian merchants: Swiggy/Zomato (food), Instamart/Zepto/Blinkit/BigBasket/DMart (groceries), Ola/Uber/Rapido/petrol (IOCL/BPCL/HPCL)/FASTag (transport), IRCTC/RedBus/MakeMyTrip/Goibibo/IndiGo (travel), OYO (stay), BookMyShow/PVR (entertainment), Jio/Airtel/BESCOM/broadband/maintenance (utilities), PG rent, Apollo/PharmEasy, Flipkart/Myntra
- ⏳ Optional server-side AI parsing (Cloud Function + vision model) for messy receipts — needs the Blaze plan

### 3.5a Live table split
- ✅ From an itemized draft (expense form) or a scanned receipt, the payer taps **Split at the table**: a live bill `tables/{code}` with a QR code (generated on the device, `src/lib/qr.ts`), an 8-character code and a `/t/<code>` link
- ✅ Guests open the link, type a name (Firebase **anonymous auth**, no account) and tap what they had; shared items split equally or by portions; everyone sees live totals including proportional tax/tip, unclaimed items highlighted, "Everything claimed ✓"
- ✅ The host can claim for anyone, add people without a phone, edit items/tax/tip/discount, and split leftovers between everyone
- ✅ **Finish** → pick a group, participants auto-matched to members (uid → exact name → unique first name; host confirms or adds them as new members) → one itemized expense (or exact amounts when portions are uneven) that sums exactly to the bill. No group → create one from the table, or close and send each person their total with the host's payment handles
- ✅ Tables expire after 24 h. Logic in `src/lib/table.ts` (unit-tested); demo mode syncs tabs via the `storage` event, and the host's "open as another phone" link simulates a guest

### 3.5b Trip mode & auto-capture (see [AUTO_CAPTURE.md](AUTO_CAPTURE.md))
- ✅ Optional group `startDate`/`endDate`; "Live trip" badge; new expenses default to the live trip
- ✅ `/capture` URL contract v=1 → pending capture in a per-user **Inbox** → "is this a group expense?" prompt (trip-window match pre-selected) → prefilled expense form. Never auto-adds.
- ✅ iOS Shortcuts Transaction automation writing silently to `captureInbox` via the Firestore REST API, authorised by a per-user capture token
- ✅ Android Web Share Target (images → Scan, text with an amount → capture); Tasker/MacroDroid via `/capture`
- ⏳ Open banking (Basiq), email forwarding, FCM push for new captures (need Cloud Functions / Blaze)

### 3.6 Insights (charts)
- ✅ Spending by category (donut)
- ✅ Monthly spending trend (area)
- ✅ Paid vs share per member (bar)
- ✅ Group budget burn-down
- ✅ Totals: your share, total group spend, biggest category
- ✅ CSV export per group (expenses + payments, one share column per member); shared via the native share sheet on mobile, downloaded elsewhere
- ✅ CSV re-import of our own export (round-trip; same import screen, detected from the `Type`/`Paid by` columns)
- ⏳ Year-in-review

### 3.4b Import from Splitwise
- ✅ Pure parser `src/lib/import-splitwise.ts` (unit-tested). Splitwise's *Export as spreadsheet* CSV is `Date,Description,Category,Cost,Currency,<one column per person>`, usually a blank line after the header, then a `Total balance` row per currency. Each person column is their **net** for the row (paid − share; + is owed, − owes). Payments have Category `Payment`.
- ✅ Tolerant: BOM, quoted fields with commas/quotes/newlines, `,` `;` or tab delimiters, decimal commas, ISO / d/m/y / m/d/y (decided per column) / month-name dates, blank lines, duplicate names, translated headers (falls back to Splitwise's column order). Rows in other currencies, rows that move no balance, and unreadable rows are skipped with a note.
- ✅ **Reconstruction.** Nets alone can't recover the original payer/share split, so each row is rebuilt to keep every net exactly: owers (net < 0) get a share of −net; creditors (net > 0) paid net + x with share x, where the x's add up to `cost − Σ positive nets`, spread in proportion to their nets (largest remainder). With one creditor that is "they paid the bill and had a share", which is how most Splitwise expenses were entered. If the cost is smaller than Σ positive nets, the amount is raised to that sum. Stored as `splitType: 'exact'`.
- ✅ Balances after import are compared with Splitwise's `Total balance` row in the preview (✓ per person) and tested to match exactly.
- ✅ Splitwise subcategories map to ours (Dining out → food, Taxi → transport, Hotel → stay, Plane → travel, TV/Phone/Internet → utilities…); "General"/unknown falls back to the description keyword guess, then `other`.
- ✅ Preview → map each person to *me* / an existing member / a new placeholder → new group (name from the filename, emoji, type, currency) or an existing group → `repo.bulkImport` writes ≤450-write batches in order after `createGroup`/`addMember`. Imported docs carry `importedFrom: 'splitwise' | 'csv'`.
- ⏳ Splitwise API import (OAuth) to bring comments, receipts and exact payer splits

### 3.7 PWA & UX
- ✅ Installable: web manifest, service worker, icons, maskable icon, app shortcuts
- ✅ **Install banner**: real install button on Android/desktop Chrome (`beforeinstallprompt`); step-by-step "Share → Add to Home Screen" sheet on iOS Safari; hidden when already installed (`display-mode: standalone`)
- ✅ Offline: app shell precached; Firestore persistent local cache
- ✅ "Update available" toast when a new service worker is ready
- ✅ Dark / light / system theme
- ✅ iOS safe-area insets and bottom tab bar
- ⏳ Haptics (Android only — iOS Safari has no Vibration API)

---

## 4. Architecture

```
React 19 + TypeScript + Vite 8
  ├─ Tailwind CSS v4           (design tokens in src/index.css)
  ├─ React Router v7           (routes in src/App.tsx)
  ├─ Recharts                  (Insights)
  ├─ Tesseract.js              (on-device OCR, lazy-loaded)
  ├─ vite-plugin-pwa / Workbox (manifest + service worker)
  └─ Data layer (src/data/)
       ├─ repo.ts       — interface every screen talks to
       ├─ firebaseRepo  — Firestore + Storage implementation
       └─ localRepo     — localStorage implementation (demo mode)
Pure domain logic (src/lib/) — splits, balances, simplify, OCR parsing, money — unit-tested with Vitest
```

**Why compute balances on the client?** A group's expense list is small (hundreds, not millions). Computing balances from the expense list removes a whole class of bugs (denormalized balance drift) and needs no server; Cloud Functions (§4.0) are used only for the SMS webhook, push and reminders. If groups ever grow past ~5k expenses, add a Cloud Function that maintains a `balances` doc.

### 4.0 Backend (Cloud Functions, Blaze plan)

The project is on **Blaze**. Balances are still computed on the client; the backend only does what a browser can't: receive bank SMS from automations, send push notifications, and run a daily job. Code in `functions/` (TypeScript, Node 22, firebase-functions 2nd gen, firebase-admin), bundled with esbuild together with `shared/sms-parse.ts` (the SMS parser shared with the client). One region constant, **`asia-south1` (Mumbai)**, in `functions/src/config.ts`, matching the Firestore location.

| Function | Kind | Notes |
|---|---|---|
| `capture` | HTTPS (`/api/sms`, `/api/capture` via Hosting rewrites, both sites) | Token-authenticated, 60/h + 300/day per token, parses the SMS, matches trip windows, saves `users/{uid}/captures/{id}` (idempotent id), pushes. No App Check (automations can't). See AUTO_CAPTURE.md §3.1. |
| `onExpenseCreated` | Firestore create trigger | "Sarah added Dinner · ₹840 · your share ₹210" to other members with an account who paid or owe; skips imports, recurring copies, trashed |
| `onSettlementCreated` | Firestore create trigger | "Rahul paid you ₹500" to the payee (unless they recorded it) |
| `dailyReminders` | Scheduler, 10:00 Asia/Kolkata | Nudge if owed > ₹500 (10 major units in other currencies) both now and 7 days ago; at most weekly per group (`reminderState/{gid}`) |

Server-only collections: `rateLimits/{tokenHash}`, `reminderState/{groupId}` (rules deny all client access). Client-owned: `users/{uid}/pushTokens/{hash}`, `users/{uid}/settings/notifications`. Pure logic (trip matching, idempotency, masking, rate limiting, reminder maths, notification text with `Intl` en-IN) is unit-tested in `functions/src/lib/functions.test.ts`; `npm run test:functions` runs the webhook against the emulators.

**Costs on Blaze for a small group** (say 10 people, 5 trips a year, ~30 SMS captures and ~50 expenses a week) [Likely]: everything stays inside the no-cost tiers. Cloud Functions/Cloud Run: 2M invocations and 180k vCPU-seconds free per month vs. a few thousand invocations. Firestore: 50k reads / 20k writes free per day; the daily reminder job reads every group's expenses once a day, so it's the biggest consumer (≈ groups × expenses, e.g. 20 groups × 200 expenses = 4k reads/day). FCM is free. Cloud Scheduler: 3 jobs free per billing account. Artifact Registry stores the function images (~0.5 GB free, then ~$0.10/GB/month; enable a cleanup policy when the CLI offers it). Expect **$0–1/month**; set a budget alert anyway. If groups grow large, replace the reminder scan with a maintained balance doc.

### 4.1 Money
- All amounts are **integer minor units** of the group's currency. No floats touch stored data.
- The number of minor-unit digits comes from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`: 2 for AUD/USD, **0 for JPY/KRW/VND**, 3 for BHD (IDR is 2 in Intl/ISO 4217). `formatMoney`, `parseMoney` and `centsToInput` all take the currency (`src/lib/money.ts`). INR is stored in paise.
- `formatMoney` formats in the app locale (`appLocale()` from `src/lib/locale.ts`, set once in `main.tsx`; `opts.locale` overrides it, which keeps it pure for tests): en-IN gives `₹1,00,000.00` lakh/crore grouping. Dates use `toLocaleDateString(appLocale(), …)` ("7 Oct").
- Each group has one currency. Formatting uses `Intl.NumberFormat`.

### 4.1a Multi-currency expenses (locked FX)
- An expense may be **entered** in another currency. Everything balances read stays in the **group currency**: on save the total is converted once (`convertMinor`, rounding to the group's minor unit), then `paidBy` and `splits` are re-allocated from that converted total with largest-remainder rounding, weighted by the entered amounts — so both still sum to `amount` exactly and `balances.ts` / `simplify.ts` are unchanged (`src/lib/fx.ts`, unit-tested in `fx.test.ts`).
- The original is kept on the expense as `original: { currency, amount (minor units of that currency), rate (group-currency units per 1 original unit), rateDate, source: 'ecb' | 'manual' }`. `splitInput` amounts (exact / adjust / items) are in the original currency so the form re-opens as typed. The rate is **locked**: it only changes if a user edits the expense and changes the currency, the date (ECB rates only) or the rate itself. Recurring copies inherit the template's original and rate.
- Rates: [Frankfurter](https://frankfurter.dev) `https://api.frankfurter.dev/v1/{date|latest}?base=XXX` (ECB reference rates, free, no key; `api.frankfurter.app` now redirects). One request per (date, base) returns every symbol and is cached in `localStorage` (`splitit-fx-v1`): past dates forever, today's for 6 h; the inverse of a cached pair is used too. Weekends/holidays resolve to the previous business day, which is what `rateDate` records; future dates use the latest rate. Offline, unsupported currencies (ECB doesn't publish e.g. AED) or API errors fall back to a typed manual rate.
- **Home-currency view**: Home and Insights ("All groups") add groups in other currencies to the user's profile currency at *today's* ECB rate, labelled "≈". The exact per-currency numbers stay on Home ("Exact: …") and on each group. Groups whose rate isn't available are listed, not converted.
- Rules: `original` is optional; if present it must have exactly those keys, a 3-letter `currency`, an int `amount` > 0, a numeric `rate` > 0, a 10-char `rateDate` and `source` in `ecb|manual` (`tests/firestore.fx.test.ts`).
- **Out of scope:** settling up in a currency other than the group's. A settlement is still recorded in the group currency; pay the converted amount in your own bank/wallet. Supporting it would need `original` on settlements and an FX-aware settle sheet.

### 4.2 Firestore data model

```
users/{uid}                            ← private: only the owner can read it
  displayName, email, photoURL, currency,
  payment: { payid?, bsb?, account?, paypal?, upi?, revolut? }
  createdAt

groups/{groupId}/profiles/{uid}        ← what a member shares with ONE group
  displayName, payment                 ← written only by the owner; read by co-members

groups/{groupId}
  name, emoji, type: trip|home|couple|event|other|direct|personal
  currency, budget? (cents), simplify: bool
  memberUids: string[]                 ← used by security rules & queries
  members: { [memberId]: { name, email?, uid?, color } }
  inviteCode (8 chars), createdBy, createdAt, updatedAt
  memberOpId                           ← the single members key the last membership write touched (rules)
  joinCode, joinMemberId               ← set by the last join (rules)

groups/{groupId}/expenses/{expenseId}
  description, amount, category, date (ISO), notes?
  paidBy:  { [memberId]: cents }       ← sums to amount
  splits:  { [memberId]: cents }       ← sums to amount
  splitType: equal|exact|percent|shares|adjust|itemized
  splitInput: raw user input for re-editing (percents, shares, items…)
  receiptPath?, createdBy, createdAt, updatedAt
  original?: { currency, amount, rate, rateDate, source: ecb|manual }   ← foreign-currency entry (§4.1a)
  recurrence?: { freq: weekly|fortnightly|monthly|yearly, nextDate, until? }   ← on a template
  recurringFrom?: templateId                                                  ← on a generated copy
  importedFrom?: 'splitwise' | 'csv'                                          ← set by the import (also on settlements)
  deletedAt?, deletedBy? (uid)                                                ← in "Recently deleted"
  dispute?: { [uid]: { byUid, memberId, reason, at } }                         ← open flags
  requiresApproval?: true, approvals?: { [uid]: true }                        ← approval workflow

groups/{groupId}/expenses/{expenseId}/comments/{commentId}
  text, authorUid, authorName, createdAt

groups/{groupId}/settlements/{settlementId}
  from: memberId, to: memberId, amount, method, note?, date, createdBy, createdAt
  deletedAt?, deletedBy?

groups/{groupId}/activity/{activityId}  ← append-only; same batch as the change
  type: expense.created|updated|deleted|restored|purged|disputed|resolved|approved
        settlement.created|deleted|restored|purged, member.added|removed
  actorUid, actorName, targetId, summary (human text), before?, after? (changed fields), createdAt

groups/{groupId}.requireApproval?, approvalThreshold? (minor units)

invites/{inviteCode}
  groupId, groupName, emoji, placeholders   ← readable by any signed-in user (no createdBy)

groups/{groupId}.startDate?, endDate?  ← optional trip window (ISO dates, inclusive)

users/{uid}/captures/{id}              ← owner-only inbox of captured payments
  amount, currency?, merchant, date, source, status: pending|assigned|dismissed, groupId?, expenseId?

tables/{code}                          ← live table split; the doc id is the share code
  hostUid, groupId?, merchant, currency, date, status: open|closed, createdAt, expiresAt (24 h)
  items:        { [itemId]: { name, amount, pos } }
  extras:       { tax, tip, discount }                       ← spread in proportion to item subtotals
  participants: { [pid]: { name, uid?, joinedAt } }          ← pid = uid for people with a phone
  claims:       { [pid]: { [itemId]: shares } }              ← per participant so rules can scope writes
  hostPayment?, expenseId?, closedGroupId?

captureTokens/{token}                  ← { uid, createdAt }; owner-only
captureInbox/{id}                      ← signed-out drop box (token must exist and match uid)
```

A **member id** is stable and separate from a Firebase uid. A placeholder member has no `uid`. When someone joins via invite and claims a placeholder, `members[id].uid` is set and their uid is added to `memberUids`. No expenses are rewritten.

### 4.3 Security rules (summary — see `firestore.rules`)
- A user can read/write only their own `users/{uid}` doc (it holds their email).
- Payment handles shown in settle-up live in `groups/{groupId}/profiles/{uid}`: readable by that group's members, writable only by `uid`. The app copies them there when the user creates or joins a group and every time they save their profile. *Why not `members[id].payment`?* Any co-member can write the group doc, and rules can't stop one member editing another's map entry without iterating the map — so a co-member could swap in their own PayID. A per-user doc makes "only the owner writes it" a one-line rule.
- A group is readable/writable only if `request.auth.uid in memberUids`.
- **Membership integrity** (member updates): existing `members` entries are never edited in place (so a `uid` can't be reassigned); every add/remove names its single key in `memberOpId`; added entries are placeholders (no `uid`); `memberUids` never grows here and only shrinks when you remove yourself or the creator removes someone (the entry and the uid go together). New groups start with `memberUids == [creator]`.
- **Join**: a non-member may update a group only to add *their own uid* to `memberUids` and exactly one member entry carrying it, and only when they supply a `joinCode` that matches `inviteCode`. Already-members can't re-join (no duplicate entries); the Join screen redirects them.
- **Invites**: an invite doc can only be written by a member of the group it points at, only if that group's `inviteCode` equals the invite's doc id, and `groupId` never changes; keys are restricted. Checked with `getAfter`, so create-group and join can write the invite in the same batch.
- **Expenses/settlements**: members only; `createdBy` must be the writer on create and is immutable (exception: a recurring occurrence `<templateId>_<date>` keeps its template's `createdBy`, whichever member's client generates it); comments are deleted in the same batch as their expense (or after it, when a whole group is deleted); `paidBy`/`splits` keys (and settlement `from`/`to`) must be member ids of the group. The client also ignores any expense whose `paidBy` or `splits` don't add up to `amount` (`countable()` in `balances.ts`).
- **Trust fields** (`tests/firestore.trust.test.ts`): an update is exactly one of (a) a normal edit, which may not touch `dispute`/`deletedAt`/`deletedBy`, may only *remove* `approvals` keys and can't drop `requiresApproval`; (b) a trash change: only `deletedAt`/`deletedBy`, with `deletedBy == auth.uid` when trashing, both removed when restoring; (c) a flag/approval: only `dispute`/`approvals` change and `diff().affectedKeys()` of each map is at most `[auth.uid]`; a flag must be `byUid == auth.uid` with a `memberId` that is the caller's and is in the expense's `paidBy`/`splits`; an approval value must be `true`. Creates can't carry trust fields. With `requireApproval`, an expense above `approvalThreshold` must carry `requiresApproval` when created or when its amount changes. **Hard delete** of an expense/settlement: only `deletedBy` or the group creator.
- **Activity**: create-only by members with `actorUid == auth.uid`, whitelisted typed keys, summary ≤ 500 chars; no update; delete only by the group creator in the batch that deletes the group (`!existsAfter(group)`), so `deleteGroup` removes up to ~450 entries with the group (more are left orphaned and unreadable).
- Known gap: rules can't iterate maps, so the *creator* could seed fake `uid` entries when first creating a group. That only affects the creator's own group.
- **Live tables**: any signed-in user (anonymous included) who knows the code can `get` an open, unexpired table (no `list`); the host and participants can still read it after it closes. A guest may only add/rename *their own* participant entry (`participants.{uid}`, carrying their uid) and replace *their own* claims (`claims.{uid}`, keys limited to existing items), and only while it's open. The host may change anything except `hostUid`, `code`, `createdAt` and `expiresAt`, close it, and delete it. Share values are validated on the client (`sanitizeClaims`) because rules can't iterate a map. The host's payment handles are copied onto the table so guests can pay them back.
- Storage receipts: `receipts/{groupId}/...` — signed-in users only, images under 10 MB.

### 4.4 Algorithms
- **Split engine** (`src/lib/splits.ts`): each split type becomes `{memberId: cents}`. Rounding uses the largest-remainder method, with ties broken by member order, so results are deterministic.
- **Balances** (`src/lib/balances.ts`): `net[m] = Σpaid − Σshare + Σsettlements_sent − Σsettlements_received`.
- **Pairwise debts**: for each expense, each non-payer owes each payer in proportion to what that payer paid.
- **Simplify** (`src/lib/simplify.ts`): greedy — repeatedly match the largest creditor with the largest debtor. It produces at most n−1 transfers and never changes anyone's net position. A truly minimal transfer count is NP-hard; greedy is what Splitwise does too.

### 4.5 OCR pipeline
1. User picks or takes a photo (`<input type="file" accept="image/*" capture="environment">`).
2. The image is downscaled on a canvas (max 1600px) to speed up OCR.
3. Tesseract.js (lazy-loaded so it stays out of the main bundle) returns text.
4. `src/lib/ocr-parse.ts` heuristics:
   - Amounts: with a currency marker (₹, Rs., INR, $ …) whole numbers and lakh grouping count; without one a figure needs two decimals, so phone numbers and UPI reference numbers aren't read as money
   - Total: GRAND TOTAL / NET AMOUNT / AMOUNT PAYABLE / TOTAL / AMOUNT DUE / BALANCE lines (not SUBTOTAL or TOTAL QTY), else the largest currency amount
   - Date: several numeric and month-name formats
   - Merchant: first non-trivial line
   - Line items: `<text> <amount>` lines above the total
   - Payment screenshots: "Paid / Sent / Paid Successfully / Transfer to <Name>" or "To: <Name>" + the first ₹ amount (cashback lines ignored); UPI app names, UTR or a VPA mean method UPI
5. The result **pre-fills** a form. Nothing is saved without the user confirming.

---

## 5. Design system
- Mobile first. Bottom tab bar: Home · Groups · **+** (floating action) · Insights · Profile.
- Palette: violet → fuchsia brand gradient; emerald for "owed to you", rose for "you owe".
- Rounded-2xl cards, soft glass surfaces in dark mode, large tappable targets (≥44px).
- Typeface: Inter (system fallback).
- Motion: subtle sheet slide-ups and number transitions; respects `prefers-reduced-motion`.

---

## 6. Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo, tooling, docs, Firebase config, rules, PWA shell | ✅ |
| 1 | Auth, groups, members, invites, expenses (all split types), balances, simplify, settle-up | ✅ |
| 2 | OCR receipts + payment screenshots, insights charts, install banner, debt graph | ✅ |
| 3 | Recurring expenses ✅, CSV export ✅, comments ✅, Splitwise/CSV import ✅, activity/history/trash/disputes/approval ✅, push notifications ✅ (FCM web push, Cloud Functions), archive/leave group | 🟡 |
| 4 | Multi-currency with FX ✅, server-side AI receipt parsing, Apple sign-in | 🟡 |

---

## 7. Known risks & decisions
- **Name: "Split Now" — trademark not yet checked.** Search app stores and the Indian trademark registry (and WIPO for later global use) before launch; the code keeps `split-it` ids so a rename is copy-only.
- **UPI deep links are best-effort.** NPCI and the UPI apps have tightened link-initiated P2P payments over time; the QR (scan from another phone) and copying the UPI ID are the fallbacks and always work. Scheme names should be rechecked periodically.
- **No real in-app money movement.** That needs a licensed payment provider and KYC. Settle-up records the payment and helps the user pay through their own bank or wallet.
- **iOS install** cannot be triggered from JavaScript. The banner shows instructions instead.
- **iOS PWA storage** can be evicted if the app isn't opened for weeks. Firestore is the source of truth, so only the offline cache is lost.
- **OCR accuracy** on crumpled or thermal receipts is mediocre. The UI always shows parsed values for confirmation. The server-side AI parser is the upgrade path.
- **Offline-first writes.** Every save is a `writeBatch` (e.g. the expense plus the group's `updatedAt` bump) that the repo commits *without awaiting the server*: Firestore applies it to the local cache immediately, so screens never hang offline. If the server later rejects it, `repo.onError` fires and `App` shows a toast. Receipts upload after the expense is saved (downscaled to 1600px JPEG, skipped offline, 60 s retry cap) and then patch `receiptUrl`/`receiptPath`.
- **Sign-out** waits briefly for pending writes, then terminates Firestore and clears its IndexedDB cache before reloading, so the next person on a shared device can't read the previous user's data.
- **OCR offline.** The Tesseract worker and LSTM cores are self-hosted under `/tesseract/` (`scripts/vite-tesseract.ts`) and cached by the service worker on first use; the English language data comes from jsDelivr once and is cached in IndexedDB + the SW.
- **Firebase web API keys are not secrets.** Security lives in the rules. Still, enable App Check before going public.
