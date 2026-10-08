# A2 done — bundle, first paint, lazy loading, PWA shell

## Files changed (all A2-owned unless noted)

- `index.html` — CSS-only splash (`#root:empty`: brand-700 → duo-700 gradient from the stylesheet's variables with violet fallbacks, `/favicon.svg` mark at 5rem, drop shadow, pop animation off under reduced motion); Google Fonts `<link>`s removed; inline accent map trimmed to violet/ocean/indigo/saffron/graphite (matches C2's current `ACCENTS`; `accent.test.ts` passes). The theme/accent inline script is otherwise untouched.
- `vite.config.ts` — function form with `loadEnv`; `#repo-impl` alias (Firebase impl when `VITE_FIREBASE_API_KEY/PROJECT_ID/APP_ID` are set for the mode, else demo impl); `re2js` → `src/stubs/re2js.ts`; `__APP_VERSION__ = pkg.version+git short sha` ('dev' without git); `fontPreload` plugin (`<link rel=preload as=font>` for the Latin Inter file, build only); manifest `id`, `lang`, `dir`, `display_override`, `launch_handler: navigate-existing`, `orientation` dropped; workbox `clientsClaim: true`, `navigateFallbackDenylist` + `/^\/share-target/`, tesseract runtime rule covers `.js|.wasm` with `maxEntries: 10`; `import.meta.dirname` and a `.ts`-suffixed plugin import so Vite's native-config-loader warnings are gone.
- `src/data/index.ts` — `import { createRepo } from '#repo-impl'`; `initRepo()` is synchronous (same name, main.tsx is the only caller); `firebaseProject` / `firebaseConfigured` kept.
- `src/data/impl.firebase.ts`, `src/data/impl.local.ts` (new, 10 lines each) — the two `createRepo(config, useEmulators)` adapters the alias picks between.
- `src/stubs/re2js.ts` (new) — `RE2JS.compile` that throws; Firestore only reaches it from pipeline `like`/`regex_*` evaluators the app never issues (verified against `@firebase/firestore@4.17.2` `common-CLMydGSF.esm.js:15320–15350`, all three inside try/catch).
- `tsconfig.json` — `paths` gained `"#repo-impl": ["./src/data/impl.firebase.ts"]` (the one allowed tsconfig change).
- `src/main.tsx` — imports `./fonts.css`; `initLocale()` without setting `<html lang>` (stays "en"); `vite:preloadError` → reload once per build (sessionStorage guard); logs `Split Now <version>` once; renders immediately after the synchronous `initRepo()`.
- `src/fonts.css` (new) — `@font-face 'Inter'` (variable 100–900, latin + latin-ext from `@fontsource-variable/inter`, `font-display: swap`) + `'Inter Fallback'` (Arial with Inter metrics). Family name 'Inter' so index.css's `--font-sans` works unchanged.
- `src/App.tsx` — lazy screens built from `src/routes.ts`; `usePrefetch()` (idle prefetch of GroupDetail/ExpenseForm/Insights/Profile unless Data Saver; capture-phase `pointerdown` on any same-origin `<a href>` prefetches that route's chunk); SW `message` listener for `{type:'navigate', url}` → in-app `navigate` (same origin only); `<Splash/>` now uses `/favicon.svg` with the same gradient as the HTML splash and no second pop; `repo.onError` toast goes through `errText(e)`.
- `src/routes.ts` (+ `src/routes.test.ts`, new) — the `load` map of import() thunks, pure `routeKey(pathname)`, `prefetch(key)`, `IDLE_PREFETCH`.
- `src/lib/locale.ts` (+ tests) — `withLatinDigits()` pins `-u-nu-latn` on the resolved locale (`appLocale()` → `'en-IN-u-nu-latn'`), `DATE_STYLES`, cached `dateFormatter()`, `formatDate(iso, style | options)`, `formatDateTime()`, `formatTime()`.
- `src/lib/ocr.ts` (+ `src/lib/ocr.test.ts`, new) — singleton Tesseract worker reused across scans, terminated after 60 s idle (not while a recognition is in flight), dropped and recreated after a failed recognition; `warmOcr()`; `coreVariant()` (relaxed SIMD / SIMD / basic via `WebAssembly.validate`, bytes from wasm-feature-detect) and `corePath()` → the glue `.js`, so tesseract.js loads glue + `.wasm` instead of the base64 single-file build. `recognizeImage(file, onProgress)` signature unchanged.
- `scripts/vite-tesseract.ts` — emits `worker.min.js` + the three LSTM `.js`/`.wasm` pairs (no `*.wasm.js`); dev middleware serves `.wasm` as `application/wasm`.
- `src/lib/appcheck.ts` — `initAppCheck()` still returns void but dynamic-imports `firebase/app-check` inside; no-op without a site key.
- `src/lib/push.ts` — `currentToken()` races `serviceWorker.ready` against a 10 s timeout (so `enablePush` can't hang); `saveToken` skips the `lastSeen` write when the cached doc is < 24 h old with the same token; new `setBadge(count)` (clamped to 99, clears at 0, never throws); `disablePush` clears the badge.
- `public/share-target-sw.js` — images over 15 MB redirect to `/scan?shared=toolarge` instead of being parked in Cache Storage.
- Unchanged A2 files: `src/lib/theme.ts`, `src/components/UpdatePrompt.tsx`, `src/vite-env.d.ts` (nothing needed; `__APP_VERSION__` was already declared).

## Verified

- `npx tsc -b` exit 0 (at the end; mid-way the only errors were in C2's `src/lib/insights.ts` and C3's `src/pages/settings/common.tsx`, since fixed by them).
- `npx vitest run` whole repo: 52 files / 794 tests pass; the 2 failing files are B's in-progress `functions/src/lib/functions.test.ts` and `functions/src/lib/gemini.test.ts` (SMS interpret, recipients, Gemini mocks) — nothing A2 touched. My files: `locale`, `ocr`, `routes`, `accent`, `money` tests all green (47 tests).
- `npx vite build` (production, Firebase): see `A2-sizes.md`. First-paint JS 351.1 kB gzip in two serial stages → 306.5 kB gzip in one stage; Firestore chunk −43.35 kB gzip; `dist/tesseract` 12 MB → 8.6 MB; `dist/index.html` carries modulepreloads for the Firebase chunks and the font preload; `dist/sw.js` has `clientsClaim()`, both woff2 files in the precache, the `.wasm` runtime rule and the extended denylist; `manifest.webmanifest` has `id`, `lang`, `dir`, `display_override`, `launch_handler`, no `orientation`; version string `0.1.0+2d165f0` is in the entry.
- `npx vite build --mode e2e` (demo, into scratchpad/dist-e2e): entry set has no Firebase; the Firebase build has no seed/localRepo string. (The demo build still emits a *lazy* Firestore chunk because `src/lib/push.ts` and `src/lib/capture-settings.ts` `import('firebase/firestore')` — never executed in demo mode; it is precached there, which only costs demo/e2e installs.)
- Dev server `vite --mode e2e` smoke: `/` 200, `#repo-impl` → `impl.local.ts`, `/tesseract/*.wasm` served as `application/wasm`, `fonts.css` URLs resolve to `/node_modules/@fontsource-variable/inter/files/*`.
- `re2js` stub: kept — build and vitest pass with it (the stub is only ever reached by Firestore pipeline regex evaluators).

## Deliberately left out / changed from the plan

- **Aurora offscreen pause, Suspense inside Layout, badge from Layout**: C2 had already landed all three (`.aurora-paused` + `usePauseWhenUnseen` in Aurora.tsx, `<Suspense>` around `<Outlet/>`, a local `setBadge` in Layout) by the time A2 got there, so A2 did not touch Aurora.tsx or Layout.tsx. The animations are untouched (ADDENDUM). `setBadge` now also exists in `src/lib/push.ts`; C2 may switch to it (handoff).
- **`--font-sans` 'Inter Fallback'**: needs one token change in index.css (C2's) — requested in `A2.md`; without it the fallback face is simply unused.
- **Pending-navigation progress bar (`useTransition` in Layout)**: Layout is C2's; prefetch on pointerdown + idle makes the frozen-tap case rare, so not requested.
- **Route-level `codeSplitting.groups` for the icon micro-chunks (07 L1)**, **react-router production alias (07 L2)**, **ActivityFeed/aiPrefs split (07 L3)**: low payoff; L3 would touch C-owned files. Not done.
- **Self-hosting `eng.traineddata.gz`**: product question (07 §6.3), not done; the jsDelivr runtime rule stays.
- **`lastSeen` throttle** is client-side only; the server-side pruning of stale tokens (14 M7) is B's.
- **App Check lazy load trade-off**: the production build has a site key, so the chunk is always fetched there; it is deferred by a few ms after `initializeApp`, which can let the very first Firestore/Auth request go out without a token. Enforcement is off (monitor mode), and the SDK restarts the listen streams once a token exists. If enforcement is ever turned on, make the first repo call await `initAppCheck` (A1's `firebaseRepo`) or revert to the static import. Documented in `appcheck.ts`.
- **`capture-settings.ts` / `push.ts` dynamic Firestore imports in demo builds**: harmless at runtime; removing the chunk would need a `repo.mode` guard before the `import()`s in files A2 doesn't own (B's `capture-settings.ts`).

## Decisions the owner should know

- `appLocale()` now carries `-u-nu-latn` (Western digits everywhere, regardless of phone locale); any later code should compare with `startsWith('en-IN')`, not `===`.
- The data layer is chosen at **build time** by the presence of `VITE_FIREBASE_API_KEY`/`PROJECT_ID`/`APP_ID` in the mode's env files. `.env.production` has them → Firebase; `vite` without `.env.local` and `vite --mode e2e` → demo. A `.env.e2e.local` with Firebase keys would flip the Playwright suite to Firebase; don't create one.
- `__APP_VERSION__` is `0.1.0+<sha>`; Profile already prints it. With `clientsClaim` the first visit is controlled by the SW immediately; the update flow is unchanged (prompt, no `skipWaiting`).
- The 15 MB share cap needs one line of copy in Scan (C3, handoff) for `?shared=toolarge`.
- If C2's `C2.md` arrives later with a different accent map, the inline `accents` object in `index.html` is the only thing to update (the ids must match `ACCENTS` in `src/lib/accent.ts`; `accent.test.ts` enforces it).
