# Split Now

**Split bills, not friendships.** A free, open-source, mobile-first app for sharing expenses with friends, flatmates and travel groups: a Splitwise alternative with bill scanning, live table splits, UPI-first settle-ups and optional AI reading of bills and bank SMS.

[**Try it: split-now.web.app**](https://split-now.web.app) · installable on Android, iOS and desktop (PWA) · runs in demo mode with no account

India-first (INR, en-IN number formatting, UPI QR codes, GPay / PhonePe / Paytm), with other currencies, locales and payment handles (PayID, PayPal, Revolut) built in.

Built with React 19, TypeScript, Vite and Tailwind CSS v4, on Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions).

> **Works without Firebase.** With no `.env.local`, `npm run dev` starts in *demo mode*: data stays in your browser and sample groups (a Goa trip, a Bengaluru flat) are pre-loaded.

## Features

| | |
|---|---|
| 👥 **Groups, 1:1s and a personal wallet** | Trips, homes, couples, events. Add people before they sign up; they claim their place through an invite link or code. Profile photos and names follow each person's own profile once they've linked. |
| ➗ **Every kind of split** | Equally, exact amounts, percentages, shares, equal + adjustments, and by item. Several payers per expense. Rounding always adds up to the total. Recurring expenses. |
| 🍽️ **Split by items, live** | At the table, scan the bill and show a QR code: everyone opens it on their phone (no account needed), taps what they had, shares items by portions, and sees their total with tax and tip. Finish into an existing group or a new one. |
| 📷 **Smart scan** | Reads bills, payment screenshots (GPay, PhonePe, Paytm, BHIM) and statement screenshots (many transactions at once, flagged by trip dates). On-device OCR by default; Gemini when AI is on. The last 10 scans of each kind are kept on the device, and a re-scan of the same bill is spotted. |
| 🤖 **AI features (optional)** | Gemini reads bills into items/taxes/total, statements into transactions, and bank SMS the built-in parser can't. Each person can use their own free Gemini key, the project's shared key (admin-controlled per email), or no AI at all. See [docs/AI.md](docs/AI.md). |
| 💬 **Auto-capture** | Bank and UPI debit SMS (iOS Shortcut or Android automation → webhook), Apple Pay taps and the share sheet land in an **Inbox** that asks whether each payment was shared. Nothing is added without your OK. See [docs/AUTO_CAPTURE.md](docs/AUTO_CAPTURE.md). |
| 💸 **Balances and settling up** | One Balances screen, by person (net across all groups) or by group. Settle one person across several groups with one payment, split across the groups automatically. UPI QR for the exact amount, app links, bank / PayID / PayPal details with copy buttons. |
| 🧮 **Simplified debts, visualised** | Per-group simplification, with an animated graph of who pays whom (you-centred or everyone), and the exact list underneath. |
| 💱 **Multi-currency** | Any currency per expense, converted at the day's ECB rate (shared, cached, with a manual fallback) and locked to the expense. |
| 📊 **Insights** | Spending over time, this month vs last, categories, groups, paid vs share, biggest expenses, with collapsible filters (dates, groups, categories, my share / total). |
| 🔁 **Switch from Splitwise** | Import a Splitwise group's CSV export, check balances against Splitwise's totals, map people, import. |
| 📥 **Inbox** | Captured payments and expenses waiting for your OK, plus a log of everything that happened in your groups (other people's actions marked new). |
| 📱 **PWA** | Install prompts (guided on iOS), offline app shell, update banner, push notifications, light/dark themes and accent colours. |

## Quick start

```bash
git clone https://github.com/amrit-dash/split-it.git
cd split-it
npm install
npm run dev            # http://localhost:5173, demo mode (no Firebase needed)
```

To run it on your own Firebase project, follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**, then (optional) **[docs/AI.md](docs/AI.md)** and **[docs/AUTO_CAPTURE.md](docs/AUTO_CAPTURE.md)**.

> `.env.production` and `.firebaserc` point at the maintainer's project (`split-it-prod`). These are public web identifiers, not secrets, but a fork should replace both with its own project before deploying.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build (with service worker) into `dist/` |
| `npm run preview` | Serve the production build (needed to test install / offline) |
| `npm test` | Unit tests (splits, balances, simplification, OCR/SMS parsing, insights, settle allocation, …) |
| `npm run test:rules` | Firestore and Storage security-rule tests in the emulator (needs Java 11+) |
| `npm run test:functions` | Builds `functions/` and runs the capture-webhook tests in the emulators |
| `npm run emulators` | Start the Firebase emulators |
| `npm run icons` | Regenerate PWA / Apple icons from `public/favicon.svg` |
| `npm run deploy` | Build and `firebase deploy` |

Cloud Functions have their own unit tests: `cd functions && npx vitest run src`.

## Project layout

```
src/
  lib/          pure logic: money, splits, balances, simplify, parsing, insights, settle allocation (unit-tested)
  data/         Repo interface + Firebase and localStorage (demo) implementations
  hooks/        auth, live data, AI status, receipt reader, OCR
  components/   UI: sheets, toasts, tab bar, charts, graph, icons, animations
  pages/        screens (Home, Groups, GroupDetail, ExpenseForm, SettleAll, SettleUp, Scan, SplitBill, Table, Insights, Inbox, Profile, …)
shared/         code shared by the app and Cloud Functions (SMS parser, capture filters, AI config)
functions/      Cloud Functions (asia-south1): AI reading, SMS capture webhook, push, reminders, FX rates
tests/          Firestore / Storage rules tests
docs/           setup guides and the product plan
```

## How it works

- **Money** is stored as integer minor units (paise for INR); splits use largest-remainder rounding.
- **Balances are computed on the device** from each group's expenses and payments. Cloud Functions handle only what needs a server: AI calls, the SMS webhook, push notifications, reminders and shared exchange rates.
- **Security** lives in `firestore.rules` and `storage.rules` (with tests). API keys for AI are stored server-side and never sent back to the app.
- **Region, currency and locale** default from the browser's language and time zone (`src/lib/locale.ts`).

More detail: [docs/PLAN.md](docs/PLAN.md) (product and architecture) and [CHANGELOG.md](CHANGELOG.md).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first; for security problems see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Amrit Dash
