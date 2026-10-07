# Split It

A mobile-first, installable web app (PWA) for splitting shared expenses: a Splitwise alternative with free receipt scanning, visual debt simplification and cross-group settle-ups.

Built with React 19, TypeScript, Vite 8 and Tailwind v4, and backed by Firebase (Auth, Firestore, Storage, Hosting).

> **Works before Firebase is connected.** With no `.env.local`, the app runs in *demo mode*: data stays in your browser and sample groups are pre-loaded.

## Features

| | |
|---|---|
| 👯 **Groups** | Trips, homes, couples, events, 1:1 friends and a personal wallet. Add people before they sign up; they claim their spot via invite link or code. |
| ➗ **Six split types** | Equally (selected people), exact amounts, percentages, shares/ratio, equal + adjustments, and **itemized** (assign receipt lines; tax/tip spread proportionally). Multiple payers per expense. Cent-exact rounding. |
| 🧮 **Simplify debts** | Per-group toggle. The **debt graph** shows the original vs simplified payments side by side. |
| 🔗 **Cross-group netting** | One balance per friend across all groups, plus a "Net out" action that settles every group with one real payment. |
| 💸 **Settle up** | Shows the payee's PayID, BSB/account, PayPal.me, UPI or Revolut with copy buttons and deep links, then records the payment. Share reminders via the native share sheet. |
| 📷 **Smart scan** | On-device OCR (Tesseract.js) reads **receipts** (total, merchant, date, line items → itemized split) and **payment screenshots** (amount + payee → pre-filled settlement). Free, private, no server. |
| 📊 **Insights** | Category donut, spending trend, paid-vs-share per member, biggest expenses, and a group budget bar. "My share" or "group total" views. |
| 📱 **PWA** | Install banner on Android/desktop (native prompt) and iOS (guided *Share → Add to Home Screen*). Offline app shell, update prompt, safe-area aware, light/dark theme. |

The full product and technical plan, including the roadmap, is in **[docs/PLAN.md](docs/PLAN.md)**.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173, demo mode
```

To connect Firebase, follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build (with service worker) into `dist/` |
| `npm run preview` | Serve the production build locally (needed to test install/offline) |
| `npm test` | Unit tests for splits, balances, simplification and OCR parsing |
| `npm run test:rules` | Firestore security-rule tests against the emulator (needs Java 11+) |
| `npm run icons` | Regenerate PWA/Apple icons from `public/favicon.svg` |
| `npm run emulators` | Start the Firebase emulators |
| `npm run deploy` | Build and `firebase deploy` |

## Project layout

```
src/
  lib/          pure logic: money, splits, balances, simplify, OCR parsing, payments (unit-tested)
  data/         Repo interface + Firebase and localStorage (demo) implementations
  hooks/        auth context, live data hooks, OCR hook
  components/   UI primitives, install banner, debt graph, layout
  pages/        screens (Home, Groups, GroupDetail, ExpenseForm, SettleUp, Scan, Insights, Friends, Profile, Join)
tests/          Firestore rules tests
docs/           PLAN.md (product + architecture), FIREBASE_SETUP.md
firestore.rules, storage.rules, firebase.json
```

## Testing install on a phone
Install prompts only appear over **HTTPS** (or `localhost`). To try it on a real device, either deploy to Firebase Hosting, or run `npm run build && npm run preview -- --host` and use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:4173`).

- **Android (Chrome):** the in-app banner's **Install** button triggers the native prompt.
- **iOS (Safari, or Chrome/Edge on iOS 16.4+):** the banner opens step-by-step *Share → Add to Home Screen* instructions. iOS doesn't allow websites to trigger installation.

## Design notes
- All money is stored as **integer cents**. Splits use largest-remainder rounding, so shares always add up to the total.
- Balances are **computed on the device** from the expense list, so no Cloud Functions are needed and the app runs on Firebase's free Spark plan.
- Chart colours come from a colour-blind-checked palette (`src/lib/chartPalette.ts`). Category colours elsewhere in the UI are decorative.

## License
MIT. See [LICENSE](LICENSE).
