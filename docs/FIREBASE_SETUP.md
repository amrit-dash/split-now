# Connecting Firebase

Split Now runs in **demo mode** (browser-only storage) until you add Firebase config. Follow these steps once.

## 1. Create the project
1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `split-it-prod`). Google Analytics is optional.
2. **Build → Authentication → Get started**. Enable:
   - **Google**
   - **Email/Password**
   - **Anonymous** — used by *Live table split*: people at the table open `/t/<code>` and claim items without an account. If it's off, guests see "Guest access isn't enabled" (signed-in users can still join). Anonymous users can only read a table whose code they have, and write only their own claims (see `match /tables/{code}` in `firestore.rules`); they can't see any group. Consider enabling App Check (below) and Firebase's automatic clean-up of inactive anonymous accounts (**Authentication → Settings → User account cleanup**).
3. **Build → Firestore Database → Create database** → *production mode* → pick a region close to your users (e.g. `australia-southeast1`). The region can't be changed later.
4. **Build → Storage → Get started** (same region). Note: new projects need the **Blaze** plan to create a Storage bucket. If you stay on Spark, everything except receipt image upload still works — the app falls back to saving the expense without the image.

## 2. Register the web app
1. **Project settings → Your apps → Web (`</>`)** → register "Split It". Tick **Firebase Hosting**.
2. Copy the config values into `.env.local`:

```bash
cp .env.example .env.local
# then fill VITE_FIREBASE_* from the console
```

## 3. Authorised domains
**Authentication → Settings → Authorized domains**: `localhost` and `<project>.web.app` are there by default. Add any custom domain you use.

### Google sign-in in the installed iOS app
Installed iOS PWAs can't use popups, so Split It uses `signInWithRedirect` there. Safari's storage partitioning breaks the redirect if the auth handler lives on a different domain from the app, so **set `VITE_FIREBASE_AUTH_DOMAIN` to the domain the app is served from** (e.g. `<project>.web.app`, or your custom Hosting domain) rather than `<project>.firebaseapp.com`. Firebase Hosting serves the handler at `/__/auth/*` on every Hosting domain; the service worker is configured not to intercept `/__/` URLs (`navigateFallbackDenylist`). If you host elsewhere, proxy `/__/auth/` to `<project>.firebaseapp.com`. Redirect errors are shown as a toast when the app reopens.

## 4. Deploy rules, indexes and the app

```bash
npm i                         # installs firebase-tools locally
npx firebase login
cp .firebaserc.example .firebaserc   # set your project id
npx firebase deploy --only firestore:rules,firestore:indexes,storage
npm run deploy                # builds and deploys hosting + rules
```

The app is then live at `https://<project>.web.app`.

## 5. Local development against emulators (optional)

```bash
# terminal 1
npx firebase emulators:start
# terminal 2 — set VITE_USE_EMULATORS=true in .env.local
npm run dev
```

The Emulator UI is at <http://localhost:4000>. Needs Java 11+.

## 5a. Cloud Functions (Blaze plan)

The backend lives in `functions/` (TypeScript, Node 22, 2nd gen, region **asia-south1**, set once in `functions/src/config.ts`; it must match the Firestore location). It bundles `shared/sms-parse.ts` with esbuild, so always build through npm:

```bash
npm ci --prefix functions
npm --prefix functions run build          # typecheck + bundle to functions/lib/
npm run test:functions                    # emulator integration test (POSTs sample SMS)
npx firebase deploy --only functions      # predeploy runs the build
npx firebase deploy --only hosting        # picks up the /api/sms and /api/capture rewrites
```

| Function | Trigger | What it does |
|---|---|---|
| `capture` | HTTPS, public (`/api/sms`, `/api/capture` rewrites on both Hosting sites) | Bank SMS webhook: token auth, rate limit, parse, trip match, save capture, push |
| `onExpenseCreated` | Firestore `groups/{gid}/expenses/{eid}` created | Push to the other members in the expense |
| `onSettlementCreated` | Firestore `groups/{gid}/settlements/{sid}` created | Push to the person who was paid |
| `dailyReminders` | Cloud Scheduler, every day 10:00 Asia/Kolkata | Settle-up nudge (> ₹500 owed for > 7 days, max weekly per group) |
| `fxDaily` | Cloud Scheduler, weekdays 17:15 Europe/Berlin | Fetch the latest ECB exchange rates (Frankfurter) into `fxRates/{date}` and `fxRates/latest` |
| `fxMorning` | Cloud Scheduler, every day 09:00 Asia/Kolkata | Same, as a backstop |
| `refreshFx` | Callable (any signed-in user, anonymous included) | Refresh the shared rates (latest: at most one external fetch per 10 min) or fetch and store a past date. `enforceAppCheck: false` for now — flip it to `true` (TODO in `functions/src/fx.ts`) when App Check enforcement is turned on (§5c) |

The rates are shared: every user reads `fxRates/*` (rules: signed-in read, no client writes), and the app falls back to calling Frankfurter directly if Firestore or the function is unreachable. Cost is negligible: ~35 scheduled runs a week, a handful of callable invocations and Firestore writes, one small read per device per day. The three scheduler jobs (`dailyReminders`, `fxDaily`, `fxMorning`) fit Cloud Scheduler's 3 free jobs per billing account. After deploying, you can seed the collection right away by tapping the refresh button in Profile (or running `fxMorning` from Cloud Scheduler → *Force run*).

The first deploy enables Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Cloud Run, Cloud Scheduler and Pub/Sub APIs (the CLI prompts). If Cloud Build complains about permissions on a new project, grant the default compute service account the *Cloud Build Service Account* role, then redeploy. `package.json` has an empty `gcp-build` script on purpose: Cloud Build must not rebuild (it doesn't get `../shared`); the CLI uploads the bundled `lib/`.

Set a **budget alert** (Google Cloud Billing → Budgets) before deploying; see `PLAN.md` "Backend" for expected costs.

## 5b. Push notifications (FCM Web Push)

1. **Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair.** Copy the *public* key into `VITE_FCM_VAPID_KEY` (`.env.production` for the deployed app, `.env.local` for dev). The private half stays with Google; the functions send through the FCM HTTP v1 API with the Admin SDK, so there's no server-side secret to configure.
2. If *Firebase Cloud Messaging API (V1)* shows as disabled on that page, enable it.
3. Rebuild and deploy hosting. The Notifications card in Profile only appears when the key is set.

How it works: the app calls `getToken()` with vite-plugin-pwa's service worker registration and stores the token at `users/{uid}/pushTokens/{sha256}` (refreshed on every app start, deleted on sign-out). Functions send **data-only** messages; `public/push-sw.js` (imported into the generated `sw.js`) shows them and opens `data.url` on tap. Preferences live at `users/{uid}/settings/notifications`. Dead tokens are deleted when FCM reports them unregistered.

**iPhone:** web push needs iOS/iPadOS 16.4+ and the app **installed to the Home Screen**, and permission can only be requested from a tap inside the installed app. In Safari tabs the card explains this instead of offering the button.

## 5c. App Check (reCAPTCHA Enterprise)

1. Google Cloud console → **Security → reCAPTCHA Enterprise** → enable the API → **Create key**: type *Website*, add every domain the app is served from (`split-it-prod.web.app`, `split-it-prod.firebaseapp.com`, `split-now.web.app`, `split-now.firebaseapp.com`, `freesplit.web.app`, `freesplit.firebaseapp.com`, any custom domain, and `localhost` only if you want it), *no checkbox challenge*.
2. Firebase console → **App Check → Apps** → the web app → **reCAPTCHA Enterprise** → paste the site key → Save.
3. Put the site key in `VITE_APPCHECK_SITE_KEY` and redeploy hosting. The app then attaches App Check tokens (`src/lib/appcheck.ts`, called from `firebaseRepo`).
4. Dev / emulators: the SDK uses a **debug token**. Run the app once, copy the token it logs (or generate one), add it under **App Check → Apps → ⋮ → Manage debug tokens**, and set it as `VITE_APPCHECK_DEBUG_TOKEN` in `.env.local`. Never ship a debug token in `.env.production`.
5. Watch **App Check → APIs → Cloud Firestore / Cloud Storage** metrics for a week or more. Only when nearly all requests are *verified* (old installs have updated) press **Enforce**, Firestore first, then Storage.

Notes:
- **Enforcing on Firestore blocks the old signed-out Firestore-REST path** (`captureInbox` writes from the iOS Apple Pay Shortcut and the signed-out `/capture` page), because those requests carry no App Check token. Move automations to the `/api/capture` webhook first (the setup wizard already uses it); the `captureInbox` path keeps working until you enforce.
- The `capture` webhook deliberately does **not** require App Check (Shortcuts and MacroDroid can't provide a token); it's authenticated by the capture token and rate-limited. Firestore triggers and the scheduled function aren't affected by App Check.
- reCAPTCHA Enterprise has a free monthly assessment allowance (10,000/month at the time of writing [Likely]); App Check token refreshes count as assessments.

## 5d. AI features (optional)
Set the `GEMINI_API_KEY` secret, make yourself an admin and turn the project key on from the app. See [AI.md](./AI.md).

## 6. Before going public
- [x] **Restrict the browser API key** (Google Cloud → APIs & Services → Credentials → "Browser key (auto created by Firebase)"):
  - *Websites*: every hosting domain, `*.web.app` **and** `*.firebaseapp.com` for each site (Google sign-in finishes on the `firebaseapp.com` domain). Leave `localhost` out unless you run `npm run dev` against the live project; demo mode and the emulators don't use the key.
  - *APIs*: only Identity Toolkit, Token Service, Cloud Firestore, Cloud Storage for Firebase, Firebase Installations, FCM Registration and Firebase App Check. Never Firebase AI Logic or the Gemini / Generative Language API: Split Now calls Gemini only from Cloud Functions with a server-side key.
- **Adding another hosting site** (e.g. `freesplit`): add it to `.firebaserc` targets and `firebase.json`, then add both of its domains to Auth → *Authorised domains*, the reCAPTCHA Enterprise key's domains, the browser key's websites, and `APP_ORIGINS` in `functions/src/config.ts` (then redeploy functions).
- **App Check** (reCAPTCHA Enterprise) on Firestore and Storage, to block scripted abuse of your API key. See §5c; enforce only after checking metrics.
- **Budget alerts** in Google Cloud Billing if you upgrade to Blaze.
- **Custom domain** under Hosting, if you want one.

## Data model and rules
See [`PLAN.md` §4](./PLAN.md#4-architecture), [`firestore.rules`](../firestore.rules) and the rule tests in [`tests/`](../tests/) (`npm run test:rules` runs every `tests/*.test.ts`, including `firestore.tables.test.ts` for live tables).
