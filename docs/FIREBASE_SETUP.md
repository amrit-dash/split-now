# Connecting Firebase

Split It runs in **demo mode** (browser-only storage) until you add Firebase config. Follow these steps once.

## 1. Create the project
1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `split-it-prod`). Google Analytics is optional.
2. **Build → Authentication → Get started**. Enable:
   - **Google**
   - **Email/Password**
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
See [`PLAN.md` §4](./PLAN.md#4-architecture), [`firestore.rules`](../firestore.rules) and the rule tests in [`tests/firestore.rules.test.ts`](../tests/firestore.rules.test.ts) (`npm run test:rules`).
