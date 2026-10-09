# Connecting Firebase

Split Now runs in **demo mode** (browser-only storage) until you add Firebase config. Follow these steps once.

## 1. Create the project
1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `split-it-prod`). Google Analytics is optional.
2. **Build → Authentication → Get started**. Enable:
   - **Google**
   - **Email/Password**
   - **Anonymous** — used by *Live table split* and *Pay me links*: people at the table open `/t/<code>` and claim items, and people who owe open `/r/<code>` and tap "I've paid", without an account. If it's off, guests see "Guest access isn't enabled" (signed-in users can still join). The rules treat anonymous accounts as guests, not users (`isUser()` in `firestore.rules` and `storage.rules`): they can read a table whose code they have and write their own claims, and read the shared exchange rates; they can't read invites or groups, join or create groups, create capture keys or read any user document (`tests/firestore.anonymous.test.ts`). Consider enabling App Check (below) and Firebase's automatic clean-up of inactive anonymous accounts (**Authentication → Settings → User account cleanup**).
3. **Build → Firestore Database → Create database** → *production mode* → pick **`asia-south1` (Mumbai)**. The Cloud Functions are pinned to that region (`functions/src/config.ts`), 2nd-gen Firestore triggers must run in the database's region, and the Hosting rewrites in `firebase.json` and the client (`getFunctions(app, 'asia-south1')` in `src/data/firebaseRepo.ts`) name it too; if you must use another region, change all three. The region can't be changed later.
4. **Build → Storage → Get started** (same region). Note: new projects need the **Blaze** plan to create a Storage bucket. If you stay on Spark, everything except receipt image upload still works — the app falls back to saving the expense without the image.

## 2. Register the web app
1. **Project settings → Your apps → Web (`</>`)** → register "Split Now". Tick **Firebase Hosting**.
2. Copy the config values into `.env.local`:

```bash
cp .env.example .env.local
# then fill VITE_FIREBASE_* from the console
```

   For production builds and deploys (`npm run build`, `npm run deploy`), put the same values in `.env.production`:

```bash
cp .env.production.example .env.production
# fill VITE_FIREBASE_*, VITE_FCM_VAPID_KEY, VITE_APPCHECK_SITE_KEY, VITE_IOS_SHORTCUT_URL
```

   Both files are gitignored: never commit them. `npm run deploy` and `npm run deploy:hosting` refuse to build without these values (instead of deploying the demo app); a CI deploy can pass them as `VITE_FIREBASE_*` environment variables instead of the file. The web API key still reaches every visitor in the built JavaScript, so restrict it in Google Cloud → Credentials (§6); keeping it out of the repository stops it being scraped from GitHub.

## 3. Authorised domains
**Authentication → Settings → Authorized domains**: `localhost` and `<project>.web.app` are there by default. Add any custom domain you use.

### Google sign-in in the installed iOS app
Installed iOS PWAs can't use popups, so Split Now uses `signInWithRedirect` there. Safari's storage partitioning breaks the redirect if the auth handler lives on a different domain from the app, so **set `VITE_FIREBASE_AUTH_DOMAIN` to the domain the app is served from** (e.g. `<project>.web.app`, or your custom Hosting domain) rather than `<project>.firebaseapp.com`. Firebase Hosting serves the handler at `/__/auth/*` on every Hosting domain; the service worker is configured not to intercept `/__/` URLs (`navigateFallbackDenylist`). If you host elsewhere, proxy `/__/auth/` to `<project>.firebaseapp.com`. Redirect errors are shown as a toast when the app reopens.

## 4. Deploy rules, indexes and the app

```bash
npm i                         # installs firebase-tools locally
npx firebase login
cp .firebaserc.example .firebaserc   # set your project id
npx firebase deploy --only firestore:rules,firestore:indexes,storage
npm run deploy                # builds and deploys hosting + rules
```

The app is then live at `https://<project>.web.app`.

**Deploying from GitHub instead** (no laptop login): `.github/workflows/deploy.yml` (Actions → Deploy → Run workflow, or the GitHub API) runs the CI gate, creates `AI_KEY_KEK` if missing (and a `GEMINI_API_KEY` placeholder if missing), then deploys indexes + rules, functions and every hosting site in that order, and checks each site's security headers. It needs one repository secret, `FIREBASE_SERVICE_ACCOUNT`: the whole JSON key of a service account with Firebase Admin, Cloud Functions Admin, Cloud Run Admin, Service Account User, Secret Manager Admin, Cloud Scheduler Admin, Artifact Registry Administrator, Cloud Build Editor and Service Usage Consumer. GitHub only lists the workflow once it is on `main`.

`firestore.indexes.json` holds one field override: a collection-group index on `pushTokens.token`, which `onPushTokenCreated` uses to drop a browser's token from every other account when a shared phone changes hands. Deploy it before the functions.

### Security headers
Every Hosting site in `firebase.json` (`split-it-prod`, `split-now`, `freesplit`) sends the same headers on every response (`src/lib/hosting.test.ts` fails if a site's headers or rewrites drift from the others): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (so `/join/<code>` and `/t/<code>` never leak to third-party referrers), `X-Frame-Options: DENY`, a `Permissions-Policy` that allows only the camera (for Scan) and a `Cross-Origin-Opener-Policy` that still lets the Google sign-in popup talk to the app. The `Content-Security-Policy-Report-Only` header lists every origin the app talks to (Firebase Auth / Firestore / Storage / Functions / FCM / App Check, Google sign-in, reCAPTCHA Enterprise, Frankfurter, jsDelivr for Tesseract language data). It only reports: open the browser console on each flow (sign-in popup and redirect, a scan with and without AI, statement import, a live table, push) for a week; when nothing is reported, rename it to `Content-Security-Policy` in every site's block. If you add a custom domain or a new backend origin, add it to `connect-src` / `frame-src` first. The service worker and the two scripts it imports (`/*-sw.js`) are served with `Cache-Control: no-cache`, so an update never installs a stale import.

## 5. Local development against emulators (optional)

```bash
# terminal 1
npx firebase emulators:start
# terminal 2 — set VITE_USE_EMULATORS=true in .env.local
npm run dev
```

The Emulator UI is at <http://localhost:4000>. Needs **Java 21** (firebase-tools 15 refuses older JDKs). Behind an HTTPS proxy, run the rules tests with `HTTPS_PROXY= https_proxy= npm run test:rules`: the Storage rules runtime fetches Firestore documents over plain HTTP, which a proxy that injects credentials refuses.

## 5a. Cloud Functions (Blaze plan)

The backend lives in `functions/` (TypeScript, Node 22, 2nd gen, region **asia-south1**, set once in `functions/src/config.ts`; it must match the Firestore location). It bundles the `shared/` modules (SMS parser, capture filters, AI config, trip matching, balance maths, money helpers) with esbuild, so always build through npm:

```bash
npm ci --prefix functions
npm --prefix functions run build          # typecheck + bundle to functions/lib/
npm run test:functions                    # emulator integration test (POSTs sample SMS)
npx firebase deploy --only functions      # predeploy runs the build
npx firebase deploy --only hosting        # picks up the /api/sms and /api/capture rewrites
```

| Function | Trigger | What it does |
|---|---|---|
| `capture` | HTTPS, public (`/api/sms`, `/api/capture` rewrites on both Hosting sites) | Bank SMS webhook: per-IP limit and 16 KB body cap before any read, token auth, per-token rate limit, parse, user filters, trip match, dedupe, save capture, push. Masked text to Gemini only for bank-looking messages the parser couldn't read |
| `onExpenseCreated` | Firestore `groups/{gid}/expenses/{eid}` created | Push to the other members in the expense (only uids in `memberUids`; "needs your approval" only to the people who have to approve). Also the budget alert: once per 80 % / 100 % threshold per budget figure (`reminderState/{gid}.budget`), to members with expense pushes on, flag `budgetAlerts` |
| `onSettlementCreated` | Firestore `groups/{gid}/settlements/{sid}` created | Push to the person who was paid, and to the payer when someone else recorded it |
| `onPushTokenCreated` | Firestore `users/{uid}/pushTokens/{id}` created | Deletes the same browser token under every other account (needs the collection-group index in `firestore.indexes.json`) |
| `onGroupDeleted` | Firestore `groups/{gid}` deleted | `recursiveDelete` of expenses, settlements, comments, activity, profiles, plus `receipts/{gid}/` in Storage |
| `dailyReminders` | Cloud Scheduler, every day 10:00 Asia/Kolkata | Settle-up nudge (> ₹500 owed for > 7 days, max weekly per group). Reads only groups changed in the last 36 h or with someone over the threshold (`reminderState/{gid}.hasCandidates`); skips personal and archived groups |
| `fxDaily` | Cloud Scheduler, weekdays 17:15 Europe/Berlin | Fetch the latest ECB exchange rates (Frankfurter) into `fxRates/{date}` and `fxRates/latest` |
| `fxMorning` | Cloud Scheduler, every day 09:00 Asia/Kolkata | Same, as a backstop |
| `refreshFx` | Callable (any signed-in user; anonymous guests only for the latest) | Refresh the shared rates (latest: at most one external fetch per 10 min; 30 calls/hour, 200/day per user) or fetch and store a past date. App Check follows `ENFORCE_APP_CHECK` in `functions/src/config.ts` (off for now; set it to `true` for all four callables when App Check enforcement is turned on, §5c) |
| `parseReceiptAi` | Callable (signed-in, not anonymous) | Reads a bill photo (`kind: 'receipt'`, up to 3 images), statement screenshots (`'statement'`, up to 6) or a Quick add sentence (`'text'`, the group's member names, never uids) with Gemini; answers `{ unavailable: true, reason }` when it can't; see §5d |
| `quickAddAi` | Callable (signed-in, not anonymous) | Quick add with AI: a line the app's grammar can't read ("create a group Goa trip with Rahul and Priya and add dinner 2400") with the caller's groups (ids and names) → an expense, or a new group and an expense (validated; nothing saved; the app confirms before creating the group). Needs the `aiQuickAdd` flag and the person's opt-in; uses the same keys and limits as bill reading; see §5d |
| `aiKey`, `aiModels`, `aiStatus` | Callables | Save / test / remove a user's own Gemini key (sealed at rest), list usable models, report AI availability per feature |
| `onPayLinkPaid` | Firestore `payLinks/{code}` updated (→ paid, or open → claimed) | "I've paid" on a Pay me link: records the settlement `groups/{gid}/settlements/pl_{code}` (method from the claim, note "Marked paid from a Pay me link") with a `settlement.created` activity entry, in one transaction that stamps the link (`settlementId`, `recordedAt`); pushes the payee "Rahul marked ₹1,240 paid · Goa trip" (their *settlements* preference). Idempotent; a link without a group (live table) only pushes. A live table link not locked to one guest goes open → claimed instead: a `settlement.claimed` activity line and a push to the host ("Gran says they've paid ₹250 · confirm"); the host's Confirm makes it paid and it is recorded as above. Never checks the `payLinks` flag: a claim is always recorded (the flag only stops new links and hides the pay page). Needs **Anonymous** sign-in enabled (as live tables do) for signed-out payers |
| `nudge` | Callable (signed-in, not anonymous; no secrets) | `{ groupId, memberId, amount? }` → a push to someone who owes the caller, with a link into their prefilled Settle up screen; one per (sender, debtor, group) per day (`config/limits.nudgePerDay`, `rateLimits/nudge_…`). `{ items: [{ groupId, memberId, amount? }] }` (up to 20, the Balances screen's "by person" row) → ONE push with the net total across those groups ("you owe ₹3,240 across Goa trip and Flat"), opening the debtor's cross-group Settle up; once per (sender, debtor account) per day (`rateLimits/nudgep_…`) and refused if any of those groups was nudged today. Amounts come from the groups' balances (the app's figures are only hints); honours the debtor's *reminders* preference; writes a `settlement.nudged` activity entry in each group the debtor owes in, also when no push could be sent (the debtor sees it as a card in the app), and `stats/nudge_{day}` (`sent`, `in_app`, `denied`). Returns `{ sent: true, amount, groups? }`, `{ sent: false, reason: 'no_push', amount }` or `{ sent: false, reason: 'rate_limited' \| 'not_owed' \| 'not_member' \| 'off' }` |
| `adminStats`, `adminUsers`, `adminBlockUser` | Callables (accounts with an `admins/{uid}` document only) | The admin console's numbers (daily counters + totals), account lookup, block / unblock; see §5e |

The rates are shared: every user reads `fxRates/*` (rules: signed-in read, no client writes), and the app falls back to calling Frankfurter directly if Firestore or the function is unreachable. Cost is negligible: ~35 scheduled runs a week, a handful of callable invocations and Firestore writes, one small read per device per day. The three scheduler jobs (`dailyReminders`, `fxDaily`, `fxMorning`) fit Cloud Scheduler's 3 free jobs per billing account. After deploying, you can seed the collection right away by tapping the refresh button next to the currency in Settings → Preferences (or running `fxMorning` from Cloud Scheduler → *Force run*).

**Secrets.** The AI functions and the capture webhook bind two Secret Manager secrets, so the first deploy prompts for them even while AI is off:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY     # the project's Gemini key (may be any placeholder while config/ai.mode is 'off')
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx firebase functions:secrets:set AI_KEY_KEK
```

`AI_KEY_KEK` encrypts every stored Gemini key (users' own keys in `users/{uid}/secrets/gemini`, the admin's in-app project key in `private/geminiAppKey`) with AES-256-GCM (`functions/src/lib/seal.ts`), so a Firestore export or a console reader sees only ciphertext. Keys stored before this existed (a plaintext `key` field) keep working and are re-sealed the next time they are used. Without the secret the functions log a warning and store keys as before. To rotate: set the secret to `<new-kek>,<old-kek>` (newest first), deploy, wait a week while every use re-seals with the new key, then set it to `<new-kek>` alone and deploy again. Rotation is not needed unless the old value may have leaked.

The first deploy enables Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Cloud Run, Cloud Scheduler and Pub/Sub APIs (the CLI prompts). If Cloud Build complains about permissions on a new project, grant the default compute service account the *Cloud Build Service Account* role, then redeploy. `package.json` has an empty `gcp-build` script on purpose: Cloud Build must not rebuild (it doesn't get `../shared`); the CLI uploads the bundled `lib/`.

Set a **budget alert** (Google Cloud Billing → Budgets) before deploying; see `PLAN.md` "Backend" for expected costs.

## 5b. Push notifications (FCM Web Push)

1. **Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair.** Copy the *public* key into `VITE_FCM_VAPID_KEY` (`.env.production` for the deployed app, `.env.local` for dev). The private half stays with Google; the functions send through the FCM HTTP v1 API with the Admin SDK, so there's no server-side secret to configure.
2. If *Firebase Cloud Messaging API (V1)* shows as disabled on that page, enable it.
3. Rebuild and deploy hosting. Settings → Notifications offers push only when the key is set (it explains why otherwise).

How it works: the app calls `getToken()` with vite-plugin-pwa's service worker registration and stores the token at `users/{uid}/pushTokens/{sha256}` = `{ token, ua, createdAt, lastSeen }` (refreshed on every app start, `lastSeen` written at most once a day, deleted on sign-out; `onPushTokenCreated` drops the same browser token from any other account). Functions send **data-only** messages to the 20 most recently seen registrations and delete ones unseen for 90 days or reported dead by FCM; the payload carries `badge` (captured payments to sort plus approvals waiting) for the app icon. `public/push-sw.js` (imported into the generated `sw.js`) shows the notification, or hands it to a focused window of the app (not on iOS), and on tap sends `{ type: 'navigate', url }` to an open window or opens one. Preferences live at `users/{uid}/settings/notifications` (captures, unsorted, expenses, settlements, reminders; nudges and budget alerts use *reminders* and *expenses*).

**iPhone:** web push needs iOS/iPadOS 16.4+ and the app **installed to the Home Screen**, and permission can only be requested from a tap inside the installed app. In Safari tabs the card explains this instead of offering the button.

## 5d. AI reading (Gemini)

1. Create a project key at <https://aistudio.google.com/apikey> **and link a billing account to it**: on Google's free tier the terms allow human review of what is sent, and the app sends bills and bank SMS. Store it with `firebase functions:secrets:set GEMINI_API_KEY` (above), or paste it in the app's Admin → AI section once you are an admin (the in-app key wins over the secret and is sealed with `AI_KEY_KEK`).
2. Make yourself an admin: create the document `admins/<your uid>` in the Firestore console (any field, e.g. `{ note: 'owner' }`). No client can write it; the rules let a user read only their own entry, which is how the app knows to show the Admin section.
3. Open Settings → Admin (it opens `/admin`) → the **AI** tab and set `config/ai`: `mode` (`off` by default, so nothing reaches Google until you decide; `allowlist` of emails, or `everyone`), the per-feature switches (bills and statements, bank SMS), the model (`gemini-3.5-flash-lite` is the pinned default; `shared/ai-config.ts` lists the fallbacks), the per-user limits (`perHour`, `perDay`) and the project-wide daily budget `globalPerDay` (default 2000 calls; counted in `stats/ai_{day}.app`, after which the shared key is skipped until the next IST day). Only admins can read `config/ai` (it holds the allow-list); everyone else learns what they may use from the `aiStatus` callable.
4. `stats/ai_{day}` (admins read) counts calls per key kind and feature, tokens in and out, errors, and denials (`denied_app`, `denied_app_global`, `denied_own`). Users' own keys: 120 calls/hour, 600/day by default (`config/limits`, §5e); saving or testing a key: 20/hour (`rateLimits/ai_keycheck_{uid}`, separate from the scan counters). Quick add's text reads share the bill reader's switch, allowance and `aiImages` flag and are counted as `*_text`.

What is sent: downscaled bill photos and statement screenshots the user chose, and bank SMS the built-in parser couldn't read, **masked** (account, card and phone digits, balances removed) and only when the message looks like it came from a bank. A readable debit never goes to Gemini unless the user turns on *Also ask Gemini who was paid* (`aiSmsMerchant`). The client gets `{ unavailable: true, reason }` (`off`, `not_listed`, `not_configured`, `quota`, `bad_key`, `server`) when AI can't be used and reads the bill on the phone instead.

## 5e. Admin console (`/admin`)

Being an admin is one thing only: a document at `admins/<uid>` (step 2 of §5d). Admins see **Settings → Admin**, which opens `/admin` with five tabs. Nothing here needs a deploy; the functions re-read their configuration within a minute.

| Tab | Document | What it does |
|---|---|---|
| Overview | `stats/{ai,capture,push,nudge}_{yyyy-mm-dd}` via `adminStats` | Accounts (Auth list), groups, groups active in 7 days, blocked accounts; today's counters; 14-day sparklines |
| Flags & app | `config/app` | **Maintenance mode** (everyone but admins sees a "back in a few minutes" screen and the rules refuse their writes), **minimum app version** (older builds see "Update Split Now" and must reload; admins are exempt so a typo can't lock you out), **announcement** banner (text, info/warn, optional end date; dismissed per device, a changed text comes back), **feature flags** (below) and the **sign-up mode** |
| Limits | `config/limits` | Rate limits the functions read: captures per key per hour/day, AI calls on a user's own key, nudges per sender/debtor/group per day, exchange-rate refreshes per user. Defaults are the constants the code shipped with (`shared/limits.ts`) |
| AI | `config/ai`, `private/geminiAppKey` | The project Gemini key, who may use it, model, per-person limits and the daily budget for everyone (§5d) |
| Users | `adminUsers`, `adminBlockUser`, `blocked/{uid}` | Find an account by email, uid or name (newest sign-ups by default). **Block** writes `blocked/{uid} = { reason, at, by }`, disables the Auth user, revokes their sessions and deletes their push and capture keys; the rules then refuse every write from that account and the app shows "This account is paused" with the reason. Unblock reverses it. Admins can't be blocked here |

**Feature flags** (`config/app.flags`, each a boolean; a missing document or key means *on*, so nothing regresses before the document exists): `aiImages`, `aiSms` (also enforced by the functions: `parseReceiptAi` answers `unavailable: off`, the webhook skips Gemini), `aiQuickAdd` (enforced by `quickAddAi`, which answers `unavailable: off`; the app then reads lines on the phone as before), `autoCapture` (the webhook answers `paused`, the wizard and capture screens are hidden), `liveTables` (`/split`, `/t/*` hidden for members and guests), `statementImport`, `quickAdd`, `nudges`, `payLinks` (stops new Pay me links and hides the pay page; claims on existing links are still recorded), `duplicates`, `merchantMemory`, `whoseTurn`, `budgetAlerts`. The app reads them with `useFlag('name')` (`src/hooks/useAppConfig.ts`); the functions with `flagOn('name')` (`functions/src/lib/limits.ts`). Adding a flag means adding it to `firestore.rules` (`validFlags`) and `src/lib/flags.ts` (a test keeps the two lists equal).

**Rules.** `config/app` is readable by everyone, signed out included (it holds no secrets; the sign-in screen needs `signups`). `config/limits` and `config/ai` are admin-read. Every `config/*` write is by an admin and validated field by field. `blocked/{uid}` is server-written; the account can read its own entry, admins any. `stats/*` are server-written, admin-read. Every write rule in the file carries `writesOpen()`: `(!maintenance && !blocked) || isAdmin()`, two small cached reads per write. Deletes under `users/{uid}/*` (push registrations on sign-out, dismissing a captured payment) stay open so a frozen or blocked account can still sign out cleanly. Tests: `tests/firestore.admin.test.ts`.

**Invite-only sign-ups** (`config/app.signups = 'invite'`) are meant as a *soft* gate: the sign-in screen hides "Create an account" unless the link is an invite (`/join/CODE`). `src/pages/Login.tsx` reads it through `useAppConfig()` + `signupsOpen()` (`src/lib/flags.ts`, tested) and shows "Split Now is invite only right now" instead of the sign-up toggle. Anyone who calls Firebase Auth directly can still create an account (and then sees only empty screens, since every group needs an invite). Hard enforcement needs an Identity Platform **blocking function** (`beforeUserCreated`) that rejects sign-ups without an invite or an allow-listed email: upgrade the project to Identity Platform (free at this scale), add the function, and keep the soft gate for the copy.

**Maintenance mode** rejects writes that were queued offline before it was turned on when they sync, and the app shows "the change was undone" for each: keep maintenance windows short and announce them first.

## 5c. App Check (reCAPTCHA Enterprise)

1. Google Cloud console → **Security → reCAPTCHA Enterprise** → enable the API → **Create key**: type *Website*, add every domain the app is served from (`split-it-prod.web.app`, `split-it-prod.firebaseapp.com`, `split-now.web.app`, `split-now.firebaseapp.com`, `freesplit.web.app`, `freesplit.firebaseapp.com`, any custom domain, and `localhost` only if you want it), *no checkbox challenge*.
2. Firebase console → **App Check → Apps** → the web app → **reCAPTCHA Enterprise** → paste the site key → Save.
3. Put the site key in `VITE_APPCHECK_SITE_KEY` and redeploy hosting. The app then attaches App Check tokens (`src/lib/appcheck.ts`, called from `firebaseRepo`).
4. Dev / emulators: the SDK uses a **debug token**. Run the app once, copy the token it logs (or generate one), add it under **App Check → Apps → ⋮ → Manage debug tokens**, and set it as `VITE_APPCHECK_DEBUG_TOKEN` in `.env.local`. Never ship a debug token in `.env.production`.
5. Watch **App Check → APIs → Cloud Firestore / Cloud Storage** metrics for a week or more. Only when nearly all requests are *verified* (old installs have updated): set `ENFORCE_APP_CHECK = true` in `functions/src/config.ts` and deploy functions (the ai, admin, nudge and refreshFx callables), then press **Enforce**, Firestore first, then Storage.

Notes:
- **Enforcing on Firestore blocks the old signed-out Firestore-REST path** (`captureInbox` writes from the iOS Apple Pay Shortcut and the signed-out `/capture` page), because those requests carry no App Check token. Move automations to the `/api/capture` webhook first (the setup wizard already uses it); the `captureInbox` path keeps working until you enforce.
- The `capture` webhook deliberately does **not** require App Check (Shortcuts and MacroDroid can't provide a token); it's authenticated by the capture token, rate-limited per token, and guarded per client address before any read. Firestore triggers and the scheduled function aren't affected by App Check.
- reCAPTCHA Enterprise has a free monthly assessment allowance (10,000/month at the time of writing [Likely]); App Check token refreshes count as assessments.

## 5d. AI features (optional)
Set the `GEMINI_API_KEY` secret, make yourself an admin and turn the project key on from the app. See [AI.md](./AI.md).

## 6. Before going public
- [x] **Restrict the browser API key** (Google Cloud → APIs & Services → Credentials → "Browser key (auto created by Firebase)"):
  - *Websites*: every hosting domain, `*.web.app` **and** `*.firebaseapp.com` for each site (Google sign-in finishes on the `firebaseapp.com` domain). Leave `localhost` out unless you run `npm run dev` against the live project; demo mode and the emulators don't use the key.
  - *APIs*: only Identity Toolkit, Token Service, Cloud Firestore, Cloud Storage for Firebase, Firebase Installations, FCM Registration and Firebase App Check. Never Firebase AI Logic or the Gemini / Generative Language API: Split Now calls Gemini only from Cloud Functions with a server-side key.
- **Rotating the browser key** (it was in the repository's history until October 2026): Google Cloud → Credentials → **Create credentials → API key**, give it the same website and API restrictions as the old one, put it in `.env.production` as `VITE_FIREBASE_API_KEY`, `npm run deploy:hosting`, check sign-in and a live table on both sites, then delete the old key. Installed apps pick up the new key with the update.
- **Adding another hosting site** (e.g. `freesplit`): add it to `.firebaserc` targets and `firebase.json`, then add both of its domains to Auth → *Authorised domains*, the reCAPTCHA Enterprise key's domains, the browser key's websites, and `APP_ORIGINS` in `functions/src/config.ts` (then redeploy functions).
- **App Check** (reCAPTCHA Enterprise) on Firestore and Storage, to block scripted abuse of your API key. See §5c; enforce only after checking metrics.
- **Budget alerts** in Google Cloud Billing if you upgrade to Blaze.
- **Custom domain** under Hosting, if you want one.

## Data model and rules
See [`PLAN.md` §4](./PLAN.md#4-architecture), [`firestore.rules`](../firestore.rules) and the rule tests in [`tests/`](../tests/) (`npm run test:rules` runs every `tests/*.test.ts`, including `firestore.tables.test.ts` for live tables and `firestore.anonymous.test.ts` for what guests may not do). Beyond membership, the rules enforce document shapes: group fields are whitelisted and sized (name ≤ 80, ≤ 60 members, a known `type`, a 3-letter currency, 8-character invite codes), approval settings change only by the group's creator, expense text is capped (description ≤ 200, notes ≤ 2000) and a receipt must be an `https` URL plus a path inside `receipts/<groupId>/`, settlement `method` ≤ 40 and `note` ≤ 500. Storage accepts only `image/jpeg|png|webp|heic|heif`, receipts under 10 MB and never overwritten, avatars under 2 MB. Per-user settings have key whitelists (`settings/notifications`, `settings/merchants` with ≤ 200 merchants); the activity log accepts only the 15 types the app writes (`settlement.nudged` is the nudge callable's). Admin-managed documents (`config/app`, `config/limits`, `config/ai`, `blocked/*`, `stats/*`) and the maintenance / blocked write freeze are described in §5e. The full field list is `PLAN.md` §4.2; the full rules summary §4.3.
