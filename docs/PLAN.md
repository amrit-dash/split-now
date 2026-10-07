# Split It — End-to-End Product & Technical Plan

This is the source of truth for what we are building, why, and in what order.
Status markers: ✅ built in v0.1 · 🟡 partially built · ⏳ planned.

---

## 1. Product thesis

Splitwise solved "who owes whom". Its weak points today are where Split It goes after:

| Splitwise pain | Split It answer |
|---|---|
| Daily expense cap and ads on the free tier | No caps. Free on Firebase's Spark plan. |
| Receipt scanning and itemization are paid (Pro) | Receipt **and** payment-screenshot OCR, on-device and free |
| Settling up is "mark as paid" only | Settle-up sheet with the payee's payment handles (PayID, PayPal.me, UPI, Revolut, bank) and one-tap deep links |
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
- ✅ Profile: display name, default currency, **payment handles** (PayID, BSB/account, PayPal.me, UPI VPA, Revolut tag)
- ⏳ Apple sign-in (needs an Apple developer account), phone OTP

### 3.2 Groups
- ✅ Create a group with a name, emoji, type (Trip, Home, Couple, Event, Other), currency and optional budget
- ✅ Add members by name/email **before they sign up** (placeholder members)
- ✅ Invite by link or code. The person who joins **claims** a placeholder member, so past expenses stay attached
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
- ✅ Edit / delete (creator or any group member)
- ✅ Receipt image attached (Firebase Storage)
- ✅ Recurring expenses (weekly / fortnightly / monthly / yearly, optional end date) via **client catch-up**: when a member opens a group, missed occurrences are created with deterministic ids (`{templateId}_{yyyy-mm-dd}`) so concurrent clients never duplicate. Month-end dates clamp (Jan 31 → Feb 28/29 → Mar 31). No Cloud Functions.
- ✅ Comment thread on each expense (author-only delete)
- ✅ Search (description/notes), category filter chips and an "involving me" toggle on a group's activity list
- ✅ **Multi-currency expenses with a locked FX rate** (§4.1a): pick a currency next to the amount (remembered per group, e.g. THB for a whole Bali trip); the ECB rate for the expense date is fetched from Frankfurter and shown as "≈ A$51.23 at 1 THB = 0.04269 AUD (ECB, 2026-10-07)", editable, and typed by hand when offline. Captures in a foreign currency prefill the form in that currency. Expense detail shows the original amount and rate.
- ⏳ Settling up in a different currency from the group's (see §4.1a)

### 3.4 Balances, simplification, settling up
- ✅ Per-group net balances
- ✅ Pairwise debts (raw) vs **simplified debts** (greedy min-cash-flow)
- ✅ **Debt graph** visual: raw vs simplified
- ✅ Friends view: **cross-group net** per person
- ✅ Settle-up flow: pick who pays whom and how much, record the settlement, open the payee's handles/deep links
- ✅ Share a reminder via the Web Share API ("You owe me $42.10 for Bali trip")
- ⏳ Push notifications (FCM) for new expenses and reminders

### 3.5 Smart capture (OCR)
- ✅ **Receipt scan**: Tesseract.js runs in the browser and pulls out the total, merchant, date and line items, then pre-fills the expense form (itemized split available)
- ✅ **Payment screenshot scan**: reads a bank/PayID/UPI/PayPal confirmation screenshot, detects amount + payee name, matches the payee to a group member and pre-fills a settlement
- ⏳ Optional server-side AI parsing (Cloud Function + vision model) for messy receipts — needs the Blaze plan

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
- ⏳ Year-in-review

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

**Why compute balances on the client?** A group's expense list is small (hundreds, not millions). Computing balances from the expense list removes a whole class of bugs (denormalized balance drift) and needs no Cloud Functions, which keeps the project on the free Spark plan. If groups ever grow past ~5k expenses, add a Cloud Function that maintains a `balances` doc.

### 4.1 Money
- All amounts are **integer minor units** of the group's currency. No floats touch stored data.
- The number of minor-unit digits comes from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`: 2 for AUD/USD, **0 for JPY/KRW/VND**, 3 for BHD (IDR is 2 in Intl/ISO 4217). `formatMoney`, `parseMoney` and `centsToInput` all take the currency (`src/lib/money.ts`).
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

groups/{groupId}/expenses/{expenseId}/comments/{commentId}
  text, authorUid, authorName, createdAt

groups/{groupId}/settlements/{settlementId}
  from: memberId, to: memberId, amount, method, note?, date, createdBy, createdAt

invites/{inviteCode}
  groupId, groupName, emoji, placeholders   ← readable by any signed-in user (no createdBy)

groups/{groupId}.startDate?, endDate?  ← optional trip window (ISO dates, inclusive)

users/{uid}/captures/{id}              ← owner-only inbox of captured payments
  amount, currency?, merchant, date, source, status: pending|assigned|dismissed, groupId?, expenseId?

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
- Known gap: rules can't iterate maps, so the *creator* could seed fake `uid` entries when first creating a group. That only affects the creator's own group.
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
   - Total: lines containing TOTAL / AMOUNT DUE / BALANCE (not SUBTOTAL), else the largest currency amount
   - Date: several numeric and month-name formats
   - Merchant: first non-trivial line
   - Line items: `<text> <amount>` lines above the total
   - Payment screenshots: "Paid / Sent / You paid / Transfer to <Name>" + amount
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
| 3 | Recurring expenses ✅, CSV export ✅, comments ✅, push notifications, archive/leave group | 🟡 |
| 4 | Multi-currency with FX ✅, server-side AI receipt parsing, Apple sign-in | 🟡 |

---

## 7. Known risks & decisions
- **No real in-app money movement.** That needs a licensed payment provider and KYC. Settle-up records the payment and helps the user pay through their own bank or wallet.
- **iOS install** cannot be triggered from JavaScript. The banner shows instructions instead.
- **iOS PWA storage** can be evicted if the app isn't opened for weeks. Firestore is the source of truth, so only the offline cache is lost.
- **OCR accuracy** on crumpled or thermal receipts is mediocre. The UI always shows parsed values for confirmation. The server-side AI parser is the upgrade path.
- **Offline-first writes.** Every save is a `writeBatch` (e.g. the expense plus the group's `updatedAt` bump) that the repo commits *without awaiting the server*: Firestore applies it to the local cache immediately, so screens never hang offline. If the server later rejects it, `repo.onError` fires and `App` shows a toast. Receipts upload after the expense is saved (downscaled to 1600px JPEG, skipped offline, 60 s retry cap) and then patch `receiptUrl`/`receiptPath`.
- **Sign-out** waits briefly for pending writes, then terminates Firestore and clears its IndexedDB cache before reloading, so the next person on a shared device can't read the previous user's data.
- **OCR offline.** The Tesseract worker and LSTM cores are self-hosted under `/tesseract/` (`scripts/vite-tesseract.ts`) and cached by the service worker on first use; the English language data comes from jsDelivr once and is cached in IndexedDB + the SW.
- **Firebase web API keys are not secrets.** Security lives in the rules. Still, enable App Check before going public.
