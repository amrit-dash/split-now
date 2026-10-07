# Connecting Firebase

Split It runs in **demo mode** (browser-only storage) until you add Firebase config. Follow these steps once.

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

## 6. Before going public
- **App Check** (reCAPTCHA Enterprise) on Firestore and Storage, to block scripted abuse of your API key.
- **Budget alerts** in Google Cloud Billing if you upgrade to Blaze.
- **Custom domain** under Hosting, if you want one.

## Data model and rules
See [`PLAN.md` §4](./PLAN.md#4-architecture), [`firestore.rules`](../firestore.rules) and the rule tests in [`tests/`](../tests/) (`npm run test:rules` runs every `tests/*.test.ts`, including `firestore.tables.test.ts` for live tables).
