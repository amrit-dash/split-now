# Split Now

A mobile-first, installable web app (PWA) for splitting shared expenses: a Splitwise alternative with bill scanning, visual debt simplification, auto-captured bank payments and **UPI-first settle-ups**.

**India-first, global later.** Defaults are INR with en-IN formatting (₹1,00,000.00), UPI QR codes and Google Pay / PhonePe / Paytm buttons for settling up, Indian bank SMS formats for auto-capture, and Indian merchants (Swiggy, Zomato, Zepto, Ola, IRCTC, BESCOM…) in category guessing and bill reading. Other regions get their own currency, locale and payment handles.

> Formerly *Split It*: the repo, npm package and Firebase project ids keep `split-it`; the app is **Split Now** (`split-now.web.app`). The name has **not** been trademark-checked yet.

Built with React 19, TypeScript, Vite 8 and Tailwind v4, and backed by Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions in asia-south1).

> **Works before Firebase is connected.** With no `.env.local`, the app runs in *demo mode*: data stays in your browser and sample groups (a Goa trip and a Bengaluru flat, in INR) are pre-loaded. Which data layer ships is decided at build time, so a demo build contains no Firebase SDK and a Firebase build no demo code.

## Features

| | |
|---|---|
| 👯 **Groups** | Trips, outings, homes, couples, events, offices, 1:1 friends and a personal wallet. Add people before they sign up; they claim their spot via invite link or code. Archive a group, leave one, remove a member at a zero balance. |
| ➗ **Six split types** | Equally (selected people), exact amounts, percentages, shares/ratio, equal + adjustments, and **Split by items** (assign receipt lines; tax/tip spread proportionally). Multiple payers per expense. Rounding that always sums to the total. |
| ⚡ **Quick add** | Type or say "dinner 1200 with Rahul and Priya, I paid" and the expense form opens filled in. A duplicate warning catches the same dinner entered twice; merchant memory remembers the category you pick for a merchant. |
| 🧮 **Simplify debts** | Per-group toggle. The **debt graph** shows the original vs simplified payments side by side. A private "whose turn to pay?" hint on the group page. |
| 🔗 **Cross-group netting** | One balance per friend across all groups, plus a "Net out" action that settles every group with one real payment. |
| 💸 **Settle up (UPI-first)** | A **UPI QR code for the exact amount** that any UPI app can scan, `upi://` plus Google Pay / PhonePe / Paytm buttons, the payee's UPI number and bank A/c + IFSC, all with copy buttons; PayID/BSB, PayPal.me and Revolut for other regions. Part payments with rounded-figure chips and "Waive the rest". **Remind** shares a "Pay me" link that opens the friend's prefilled Settle up screen (plus a PNG card with a UPI QR); **Nudge** sends them a push, once a day. |
| 📷 **Scan** | Reads **bills** (₹ amounts with lakh grouping, CGST/SGST as tax, Grand Total / Net Amount; merchant, date, line items → Split by items) and **payment screenshots** (GPay / PhonePe / Paytm / BHIM: amount + payee → a prefilled UPI settlement). On the device by default (Tesseract.js); Gemini is an optional reader the project owner turns on, with the on-device path as the fallback. **Statement import** turns screenshots of a payment app's history into expenses (needs AI). |
| 🍽️ **Live table** | At the restaurant, show a QR code; everyone opens it on their phone (no account), taps what they had and sees their total with tax/tip. Finish straight into a Split-by-items group expense, or let guests pay the host over UPI. |
| 💳 **Trip mode + Inbox** | Give a trip start/end dates for a *Live trip* badge. **Bank/UPI debit SMS** (iOS Shortcut or MacroDroid → `/api/capture` webhook → push), Apple Pay taps and the share sheet drop **captured payments** into an **Inbox**, which asks "add to Goa trip?" with the trip pre-selected, one tap to split equally, bulk add for a whole trip. Nothing is added without your OK. See **[docs/AUTO_CAPTURE.md](docs/AUTO_CAPTURE.md)**. |
| 🔔 **Push notifications** | New expenses, payments recorded, captured payments, settle-up reminders, nudges and budget alerts (80 % and 100 %), each switchable. The app icon badge counts what waits for you. |
| 💱 **Multi-currency** | Enter an expense in any currency; it's converted to the group's at the day's ECB rate (shared through Firestore, Frankfurter upstream, manual fallback offline) and the rate is locked. Home and Insights show an "≈" total in your home currency. |
| 🔁 **Switch from Splitwise** | Import a Splitwise group's *Export as spreadsheet* CSV (or our own CSV export): preview people, expenses, payments and dates, check every balance against Splitwise's totals, map people to you or placeholders, import. Invite links work for people without an account. |
| 📊 **Insights** | Category donut, weekly or monthly trend, paid-vs-share per member, biggest expenses, a budget card with the 80 % / 100 % marks, and a delta against the previous period. "My share" or "group total" views; the period lives in the URL. |
| 🛡️ **Trust** | Activity feed and per-field edit history, soft delete with Undo and a 30-day trash, **Flagged** expenses, **Needs your OK** approvals above a threshold. |
| ⚙️ **Settings and admin** | Profile is identity; Settings holds Preferences, Notifications, Automation (auto-capture), AI features, Data (export, import, install, version). Admins get `/admin`: maintenance mode, minimum app version, announcements, feature flags, rate limits, AI configuration, usage counters and account blocking. |
| 📱 **PWA** | Install banner on Android/desktop (native prompt) and iOS (guided *Share → Add to Home Screen*), offered after the second visit. Offline app shell and fonts, update prompt, safe-area aware, light/dark theme, five accents. |

The full product and technical plan, including the data model, the security model and the roadmap, is in **[docs/PLAN.md](docs/PLAN.md)**. Working notes for contributors and agents are in **[CLAUDE.md](CLAUDE.md)**.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173, demo mode
```

To connect Firebase, follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (demo mode unless `.env.local` points at a Firebase project) |
| `npm run build` | Typecheck + production build (with service worker) into `dist/` |
| `npm run preview` | Serve the production build locally (needed to test install/offline) |
| `npm run lint` / `npm run lint:fix` | Biome lint; `npm run format` formats, `npm run check` does both |
| `npm run typecheck` / `npm run typecheck:all` | `tsc -b` for the app; `:all` adds tests, configs, scripts, e2e and `functions/` |
| `npm test` | Vitest unit tests beside the code: money, splits, balances, simplification, FX, recurrence, trust, drafts, import/export, OCR and SMS parsing, capture filters, tables, statements, duplicates, Quick add grammar, flags, limits, the shared store |
| `npm run test:coverage` | The same suite with v8 coverage thresholds |
| `npm run test:rules` | Firestore + Storage security-rule tests against the emulators (needs Java 21) |
| `npm run test:functions` | Builds `functions/` and exercises the capture webhook and the admin callables in the emulators |
| `npm run test:e2e` | Playwright smoke suite against the dev server in demo mode |
| `npm run test:all` | Lint, typecheck, unit, rules and functions in one go |
| `npm run icons` | Regenerate PWA/Apple/badge icons from `public/favicon.svg` |
| `npm run emulators` | Start the Firebase emulators |
| `npm run deploy` | Build and `firebase deploy` everything; `deploy:hosting`, `deploy:functions`, `deploy:rules` deploy one part |

## Testing

- **Unit** (`npm test`): pure logic in `src/lib`, `src/data`, `shared/` and `functions/src/lib`, each module with a `*.test.ts` next to it. About 900 tests, around 10 s, no emulators.
- **Rules** (`npm run test:rules`): `tests/*.test.ts` drive `@firebase/rules-unit-testing` against `firestore.rules` and `storage.rules` under the emulators. Needs **Java 21** (firebase-tools 15 refuses older JDKs); the jars download to `~/.cache/firebase/emulators` on first run. Behind an HTTPS proxy run it as `HTTPS_PROXY= https_proxy= npm run test:rules`.
- **Functions** (`npm run test:functions`): `functions/test/` posts to the real `capture` function and calls the admin callables in the Functions + Firestore emulators.
- **End to end** (`npm run test:e2e`): `e2e/smoke.spec.ts` signs in to demo mode, checks the seeded groups, creates a group, adds an expense, records a payment and opens the scan and settings screens, as a Pixel 7 in Chromium. `playwright.config.ts` starts `vite --mode e2e` with the Firebase variables blanked, so it can never touch a real project. First time: `npx playwright install chromium` (or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install).
- **Types** (`npm run typecheck:all`): `tsconfig.tooling.json` covers everything the app tsconfig does not (tests, configs, scripts, e2e).

## CI

`.github/workflows/ci.yml` runs on pull requests, pushes to `main` and by hand (`workflow_dispatch`): lint + typecheck, unit tests, rules + functions under the emulators (jars cached), and a production build whose `dist/` is uploaded as an artefact before the e2e smoke suite runs against it in demo mode. Dependabot opens weekly grouped PRs for npm (root and `functions/`) and GitHub Actions. Node 22 throughout; the root `engines` field requires >= 22.12 because of Vitest 5.

## Project layout

```
src/
  lib/          pure logic: money, splits, balances, simplify, FX, recurrence, trust, drafts (expense-draft),
                OCR + SMS parsing, capture, Quick add grammar (nl-expense), duplicates, merchants, fairness,
                share-card, flags, insights, locale … (unit-tested)
  data/         repo.ts (the interface), store.ts (shared live queries), firebaseRepo.ts, localRepo.ts (demo),
                index.ts + impl.firebase.ts / impl.local.ts (the build-time `#repo-impl` alias), seed.ts
  hooks/        auth, data (live hooks), groupData (all-groups view), inbox, app config, AI status, merchants, online, OCR
  features/     expense-form/: the expense form's cards, sheets and editor
  components/   UI primitives (Sheet, ConfirmSheet, MoneyInput, Switch, Skeleton, Toast…), charts/ (SVG donut, area, bars),
                Layout, CreateSheet, QuickAdd, RemindActions, the auto-capture / AI / notification settings panels
  pages/        screens; settings/ (Preferences, Notifications, Automation, Ai, Data), admin/ (Overview, Flags, Limits, AI, Users)
  routes.ts     lazy route chunks + prefetch; App.tsx routes and the maintenance / update / blocked gates
  stubs/        re2js.ts: a build-time stand-in for a Firestore dependency the app never uses
shared/         code both the app and functions/ import: sms-parse, capture-filters, trips, balances-core, money-core, ai-config, limits, budget
functions/      Cloud Functions (asia-south1): capture webhook, Firestore triggers (push, token dedupe, group delete, budget alerts),
                reminders, ECB rates, Gemini callables, nudge, admin callables; lib/ pure helpers; test/ emulator tests
tests/          Firestore + Storage rules tests          e2e/  Playwright smoke suite          scripts/  icon generator, Tesseract assets
docs/           PLAN.md (product, architecture, data model, security, glossary), FIREBASE_SETUP.md, AUTO_CAPTURE.md, RESEARCH.md
firestore.rules, storage.rules, firestore.indexes.json, firebase.json (hosting rewrites and security headers)
```

## Testing install on a phone
Install prompts only appear over **HTTPS** (or `localhost`). To try it on a real device, either deploy to Firebase Hosting, or run `npm run build && npm run preview -- --host` and use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:4173`).

- **Android (Chrome):** the in-app banner's **Install** button triggers the native prompt.
- **iOS (Safari, or Chrome/Edge on iOS 16.4+):** the banner opens step-by-step *Share → Add to Home Screen* instructions. iOS doesn't allow websites to trigger installation.

## Design notes
- All money is stored as **integer minor units** (paise for INR). Dates are local `yyyy-mm-dd` strings.
- Region, default currency and number/date locale come from `src/lib/locale.ts` (navigator language + time zone; Asia/Kolkata → India; unknown → India/INR/en-IN; always Western digits). Splits use largest-remainder rounding, so shares always add up to the total.
- Balances are **computed on the device** from the expense list, through one shared Firestore listener per query. Cloud Functions (`functions/`) do only what a browser can't: the SMS webhook, push, daily reminders and budget alerts, shared exchange rates, Gemini reading, nudges, the admin console and cleanup after a group is deleted. The server-side jobs that need balances use the same maths from `shared/balances-core.ts`.
- Security lives in `firestore.rules` and `storage.rules` (document shapes, key whitelists and size caps, not just membership), plus hosting headers with a report-only CSP; Gemini keys are encrypted at rest. See `docs/PLAN.md` §4.3.
- Chart colours come from a colour-blind-checked palette (`src/lib/chartPalette.ts`); charts are hand-rolled SVG with text alternatives. Category colours elsewhere in the UI are decorative.
- Copy follows the glossary in `docs/PLAN.md` §8 ("Add expense", "Settle up", "Split by items", "Live table", "Captured payment", "Capture key", "Scan", "Needs your OK", "Flagged", "Quick add", "Remind", "Nudge").

## License
MIT. See [LICENSE](LICENSE).
