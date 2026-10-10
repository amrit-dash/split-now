# Research findings (Oct 2026)

Summaries of the parallel research runs. Confidence tags: [Certain] hard evidence, [Likely] strong inference, [Guessing] gap-filling.

## 1. Auto-capturing payments ("is this a trip expense?")

**A PWA cannot read SMS or notifications on any platform** [Certain]. Practical routes:

| Method | Platforms | Captures | Cost | Server? | Notes |
|---|---|---|---|---|---|
| iOS Shortcut "Transaction" automation | iOS 17+ | Apple Pay / Wallet taps only | Free | No (Firestore REST + capture token) | "Run Immediately" available. "Open URL" opens **Safari, not the PWA** [Likely], so use a silent POST. iOS 18 has a known delay bug. |
| Tasker / MacroDroid | Android | Any bank notification | ~A$6 / free | No | Power users; regex the notification, open `/capture` |
| Web Share Target | Android Chrome (installed PWA) | Manually shared screenshots/text | Free | No | **Not supported on iOS** [Certain] |
| Email forwarding → inbound parse | All | Banks/merchants that email | ~$0–20/mo | Yes (Blaze) | Mailgun free tier 100/day |
| Native Android listener (TWA / Capacitor wrapper) | Android | Any notification | $25 Play fee + dev | No | NotificationListenerService needs prominent disclosure; SMS permission is high policy risk |
| Open banking (Basiq, Fiskil; Plaid in US) | All | Every card/bank txn | Basiq ~A$0.50/user/mo + platform fee, 12-mo min | Yes | Needs CDR representative arrangement; minutes–hours latency |

**Phased plan:** (1) now: trip dates, `/capture` endpoint, per-user capture tokens, unassigned-transactions inbox, iOS Shortcut template, Android share target + MacroDroid guide; (2) Blaze: Cloud Function capture API, FCM push, inbound email; (3) native Android listener, open-banking pilot.

*Status (Oct 2026):* phase 1 and the Cloud Function + FCM parts of phase 2 are built (the `/api/capture` webhook is the primary path, see AUTO_CAPTURE.md §3); inbound email, the native Android listener and open banking are not.

**`/capture` contract v1:** `v, amount (required), currency, merchant (required), ts (ISO 8601 w/ offset), src (ios-shortcut|android-auto|share|email|manual), card (label only), raw, ref (idempotency key), group (override), t (capture token)`. Never auto-add — always confirm.

## 2. Competitors and user complaints

- **Splitwise** free tier capped at ~3–5 expenses/day with ad cooldowns [Certain]; Pro (~US$40/yr) gates currency conversion, charts, receipt scanning, itemization, search. Top complaints: the cap on trips, upsell nagging, confusing split UI, weak edit controls/permissions, settling outside the app (no AU bank integration).
- **Tricount** fully free; bunq card auto-adds expenses. **Settle Up** sells per-group premium passes. **Splid** no-account, offline. **Spliit** open-source PWA, link-based groups. **Tab**-style apps: everyone at the table claims their own receipt items live.

### Ranked proposals (top of the list)
1. **Live table split** via QR/link: everyone claims their own receipt items in real time (Spark-plan OK, anonymous auth).
2. **Recurring bills** + **smart reminders** (reminders need Blaze + FCM; iOS push only for installed PWA).
3. **Per-expense FX with locked rate** + trip mode with home-currency totals (free ECB rates, e.g. Frankfurter).
4. **Activity feed, comments, edit history, undo/trash, dispute/approval flag.**
5. **Splitwise CSV import** + **guest join without account**.

Also: PayID request card with reference code, whose-turn-to-pay, natural-language quick add, shared shopping list, default/income-ratio split presets, shared kitty, bank-statement CSV import, statement export, weekly digest, settlement instalments.

*Status (Oct 2026):* proposals 1–5 are built (live tables, recurring bills and reminders, locked-rate FX with home-currency totals, the trust layer, Splitwise import and guest join). From the longer list: the request card exists as the "Pay me" link and PNG card (UPI, not PayID-specific), whose-turn and natural-language / voice quick add are built, and statement import reads payment-app screenshots with Gemini rather than a bank CSV. Shopping list, split presets, kitty, weekly digest and instalments are not built. PLAN.md §3 has the current inventory.

Sources: splitwise.com/pro, trustpilot.com/review/splitwise.com, getfinny.app/blog/best-splitwise-alternatives-2026, tricount.com/en/what-happened-with-premium, github.com/spliit-app/spliit, basiq.io/pricing, webkit.org/blog/13878, caniuse.com/wf-app-share-targets, support.google.com/googleplay/android-developer/answer/10208820, developer.apple.com/forums/thread/765516.
