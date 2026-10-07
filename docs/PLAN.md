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
- ⏳ Multi-currency expenses inside one group with FX conversion

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
- All amounts are **integer minor units** (cents). No floats touch stored data.
- Each group has one currency. Formatting uses `Intl.NumberFormat`.

### 4.2 Firestore data model

```
users/{uid}
  displayName, email, photoURL, currency,
  payment: { payid?, bsb?, account?, paypal?, upi?, revolut? }
  createdAt

groups/{groupId}
  name, emoji, type: trip|home|couple|event|other|direct|personal
  currency, budget? (cents), simplify: bool
  memberUids: string[]                 ← used by security rules & queries
  members: { [memberId]: { name, email?, uid?, color } }
  inviteCode, createdBy, createdAt, updatedAt

groups/{groupId}/expenses/{expenseId}
  description, amount, category, date (ISO), notes?
  paidBy:  { [memberId]: cents }       ← sums to amount
  splits:  { [memberId]: cents }       ← sums to amount
  splitType: equal|exact|percent|shares|adjust|itemized
  splitInput: raw user input for re-editing (percents, shares, items…)
  receiptPath?, createdBy, createdAt, updatedAt
  recurrence?: { freq: weekly|fortnightly|monthly|yearly, nextDate, until? }   ← on a template
  recurringFrom?: templateId                                                  ← on a generated copy

groups/{groupId}/expenses/{expenseId}/comments/{commentId}
  text, authorUid, authorName, createdAt

groups/{groupId}/settlements/{settlementId}
  from: memberId, to: memberId, amount, method, note?, date, createdBy, createdAt

invites/{inviteCode}
  groupId, groupName, createdBy        ← readable by any signed-in user
```

A **member id** is stable and separate from a Firebase uid. A placeholder member has no `uid`. When someone joins via invite and claims a placeholder, `members[id].uid` is set and their uid is added to `memberUids`. No expenses are rewritten.

### 4.3 Security rules (summary — see `firestore.rules`)
- A user can read/write only their own `users/{uid}` doc. Other members' profile docs are readable so payment handles show up in settle-up.
- A group is readable/writable only if `request.auth.uid in memberUids`.
- **Join**: a non-member may update a group only to add *their own uid* to `memberUids`, and only when they supply a `joinCode` that matches `inviteCode`.
- Expenses/settlements are readable/writable by group members only.
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
| 4 | Multi-currency with FX, server-side AI receipt parsing, Apple sign-in | ⏳ |

---

## 7. Known risks & decisions
- **No real in-app money movement.** That needs a licensed payment provider and KYC. Settle-up records the payment and helps the user pay through their own bank or wallet.
- **iOS install** cannot be triggered from JavaScript. The banner shows instructions instead.
- **iOS PWA storage** can be evicted if the app isn't opened for weeks. Firestore is the source of truth, so only the offline cache is lost.
- **OCR accuracy** on crumpled or thermal receipts is mediocre. The UI always shows parsed values for confirmation. The server-side AI parser is the upgrade path.
- **Firebase web API keys are not secrets.** Security lives in the rules. Still, enable App Check before going public.
