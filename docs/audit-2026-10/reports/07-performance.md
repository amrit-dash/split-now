# 07 — Frontend performance, lazy loading and bundle size

Repo: `/home/user/split-it` (branch `claude/codebase-audit-optimization-k2uyfs`). Build: `npx vite build` (Vite 8.3.3 / rolldown 1.2.12), log at `scratchpad/build.log`; a second sourcemapped copy was built into `scratchpad/dist-sm/` and every chunk was attributed to source modules with `@jridgewell/trace-mapping` (`scratchpad/attrib.mjs`). Sizes below are raw / gzip -9 bytes; `brotli` is not installed in this container so Brotli was not measured (Firebase Hosting compresses responses itself; Brotli is typically 12–17% smaller than the gzip numbers). The build ran without a `.env`, so `firebaseConfigured` is `false` in this `dist/`; chunk contents are identical to a Firebase build except for the inlined env object, because `firebaseRepo` is always emitted as a dynamically imported chunk.

## 1. Summary

I built the app, measured every chunk, mapped the import graph of `dist/`, and read the start-up path (`index.html`, `main.tsx`, `App.tsx`, `data/index.ts`, `firebaseRepo.ts`), the eagerly-loaded screens (`Login`, `Home`, `Groups`, `Layout` and children), the hooks (`hooks/data.ts`, `auth.tsx`, `useInbox`, `useFx`), the heavy lazy screens (`Insights`, `GroupDetail`, `ExpenseForm`, `Profile`), the OCR path, the service worker config and the font loading. Verdict: route-level code splitting is already done well (19 lazy pages, tesseract/functions/messaging dynamically imported, recharts confined to the Insights chunk, lucide tree-shaken per icon), so the remaining problem is not *what* is split but *when the first paint happens*. Nothing is painted until **≈346 KB gzip / 1.13 MB raw of JavaScript** has downloaded in **two serial waterfall stages** (React + app, then Firebase Auth + Firestore), because `main.tsx` awaits `initRepo()` before `createRoot().render()` and `index.html` has no inline splash and no preload hint for the Firebase chunks. Secondary costs on that same path: a render-blocking cross-origin Google Fonts stylesheet that the service worker never caches, 43 KB gzip of `re2js` inside the Firestore chunk for a feature the app does not use, and ~15 KB gzip of demo-mode / storage / app-check code shipped eagerly. Beyond start-up: `useAllGroupData` re-subscribes every Firestore listener on each tab switch, lazy-route taps give no feedback (React Router 7 wraps navigation in `startTransition` by default), uncached `toLocaleDateString` calls run per list row per render (89 µs each measured vs 1 µs cached), and the OCR path re-creates a Tesseract worker per scan and ships a 3.9 MB base64 wasm instead of a 2.9 MB binary.

## 2. Measurements

### 2.1 Build output (JS, sorted by gzip)

| Chunk | raw | gzip | What is in it (sourcemap attribution) |
|---|---:|---:|---|
| `index.esm-CXKVKAV5.js` (Firestore) | 555,908 | 159,467 | `@firebase/firestore` 361 KB, **`re2js` 144 KB**, `@firebase/webchannel-wrapper` 50 KB |
| `Insights-*.js` | 417,331 | 117,233 | `recharts` 281 KB, d3-* 60 KB, `@reduxjs/toolkit`+`immer`+`redux`+`reselect`+`react-redux` 27 KB, `es-toolkit` 14 KB, `decimal.js-light` 13 KB, `Insights.tsx` 9 KB |
| `index-*.js` (entry) | 288,061 | 89,069 | `react-dom` 207 KB (72%), `scheduler` 3.5 KB, lucide icons 5.9 KB (~20 icons), app code ≈71 KB: `Trust.tsx` 9.6, `Home` 6.3, `Login` 6.0, `App` 5.4, `InstallBanner` 3.9, `hooks/data` 3.6, `push.ts` 3.3, `greeting` 2.3, `CreateSheet` 2.2, `capture-filters` 2.2, `UpdatePrompt` 2.1, `Groups` 2.1, `CaptureAlert` 1.9, `Layout` 1.9, … |
| `firebaseRepo-*.js` | 136,207 | 41,455 | `@firebase/auth` 80 KB, `@firebase/storage` 22 KB, `firebaseRepo.ts` 18 KB, `@firebase/app-check` 13.6 KB |
| `Profile-*.js` | 61,961 | 18,287 | `AutoCapture.tsx` 17 KB, `Profile.tsx` 11 KB, `AiSettings` 7.8 KB, `ProfileCards` 7.7 KB, `AdminAi` 4.5 KB, `NotificationSettings` 3.6 KB |
| `Misc-*.js` | 52,979 | 18,943 | `react-router` 38.9 KB, `react` 8.2 KB, lucide runtime 3.2 KB, `Misc.tsx` 2.6 KB |
| `AutoCaptureSetup-*.js` | 47,195 | 16,612 | page 28.6 KB, `shared/sms-parse.ts` 12.5 KB, `sms-setup.ts` 3.9 KB |
| `index.esm-D9aHykFL.js` | 32,402 | 10,494 | `@firebase/app` 12.7, `@firebase/util` 10.2, `component` 4.2, `idb` 3.2, `logger` 2.2 |
| `ExpenseForm-*.js` | 33,888 | 10,344 | `ExpenseForm.tsx` 32.4 KB |
| `repo-*.js` (eager) | 23,022 | 9,581 | `activity.ts` 5.9, `categories.ts` 4.2, **`table.ts` 4.1**, `splits.ts` 2.2, `repo.ts` 2.1, `trust.ts` 1.8, `recurrence.ts` 1.6, `image.ts` 1.0 |
| `ImportGroup-*.js` | 23,288 | 8,839 | page 12.6 KB, `import-splitwise.ts` 9.9 KB |
| `data-*.js` (eager) | 22,691 | 8,678 | **`localRepo.ts` 10.9 KB, `seed.ts` 3.7 KB**, `fx.ts` 5.3 KB, `data/index.ts` 1.7 KB |
| `index.esm-CZh3HNze.js` | 27,284 | 8,188 | `@firebase/messaging` 19.4 KB, `@firebase/installations` 7.7 KB (lazy, push only) |
| `GroupDetail-*.js` | 23,715 | 8,186 | page 17 KB, `export.ts` 2.4, `DebtGraph.tsx` 1.7, `filter.ts` 0.6 |
| `src-*.js` (tesseract.js main thread) | 17,244 | 7,204 | `tesseract.js` 10.5 KB, `regenerator-runtime` 6.6 KB (lazy) |
| `Scan-*.js` | 20,069 | 6,929 | `StatementImport.tsx` 10.9 KB, `Scan.tsx` 7 KB, `statement.ts` 1.3 KB |
| `Table-*.js` | 22,354 | 6,905 | `Table.tsx` 20.4 KB |
| `capture-*.js` (eager) | 14,935 | 6,569 | `ocr-parse.ts` 4.9, `capture.ts` 4.9, `locale.ts` 2.1, `money.ts` 1.3, `id.ts` 0.4 |
| 14 more route/shared chunks | 1–13 KB each | 0.4–4.8 KB | GroupForm, SettleUp, SplitBill, ExpenseDetail, Inbox, Capture, TableFinish, Friends, Join, QrCode (hand-written encoder 3.8 KB), Select, IconPicker, DateField, Switch, … |
| **15 micro-chunks** | 145–694 B each | 169–413 B | one lucide icon each (`minus`, `chevron-down`, `search`, `circle-check`, `repeat`, `wallet`, `pencil`, `send`, `triangle-alert`, `camera`, `share-2`, `share`, `message-square-text`), plus `useOcr` (299 B) and `MemberChips` (484 B) |
| `index-*.css` | 89,645 | 14,779 | Tailwind v4 + 8 accent presets (205 `oklch()` values) |
| **Total JS** | **1,952,080** | **582,933** | 57 JS files |

Also emitted: `dist/tesseract/` 11.7 MB (3 × `*-lstm.wasm.js` at 3.9 MB each + `worker.min.js` 111 KB), excluded from precache; `sw.js` 5.2 KB + `workbox-*.js` 21.8 KB; precache manifest = 73 entries / 2,064 KB raw (≈660 KB over the wire).

### 2.2 What loads before the first paint (Login and Home)

`dist/index.html` references the entry plus `modulepreload` for its 5 static dependencies; `firebaseRepo` and the two Firebase vendor chunks are *not* hinted because `data/index.ts:45` imports them dynamically from inside `initRepo()`.

| Stage | Trigger | Files | gzip | raw |
|---|---|---|---:|---:|
| 0 | HTML | `index.html` 2.8 KB, `index-*.css`, Google Fonts CSS (cross-origin, render-blocking) | 14.8 KB CSS | 89.6 KB |
| 1 | `<script type=module>` + 5 `modulepreload` | `index` 89.1, `Misc` 18.9, `repo` 9.6, `data` 8.7, `capture` 6.6, `rolldown-runtime` 0.7, `auth` 0.5 | **134.1 KB** | 404 KB |
| 2 | `main.tsx:17 initRepo()` executes → `import('./firebaseRepo')` (+ `__vite__mapDeps` preloads) | `firebaseRepo` 41.5, `index.esm-D9aHykFL` 10.5, `index.esm-CXKVKAV5` 159.5 | **211.4 KB** | 724 KB |
| 3 | first `render()` → `<Splash/>` → `repo.onAuth` (IndexedDB) → `<Login/>` or `<AppRoutes/>` | none (Login, Home, Groups, Layout are in the entry) | — | — |
| later | `UpdatePrompt` mount → `workbox-window` (after `load`) | 2.2 KB | | |

So both the signed-out Login screen and a returning user's Home wait for **345.5 KB gzip (1,128 KB raw) of JS before React renders anything**, and stage 2 cannot start until stage 1 has fully downloaded, parsed and executed. From the service-worker cache the network cost disappears but the parse/compile of 1.13 MB (≈0.6–1.2 s on a low-end Android at a typical 1–2 MB/s parse rate) and the two serial module-graph loads remain [Likely on timing, Certain on bytes]. Before stage 0's CSS arrives the page is white; after it, a flat `bg-slate-50`/`ink-950` rectangle; the brand `Splash` only appears at stage 3.

Of the eager app code (~135 KB raw / ~40 KB gzip across `index`, `Misc`, `repo`, `data`, `capture`, `auth`), roughly 30 KB raw / 10 KB gzip is avoidable on a Firebase build: `localRepo.ts` + `seed.ts` (14.6 KB), most of `lib/table.ts` (4.1 KB, kept alive by `localRepo`), `Trust.tsx` (9.6 KB, only `ActivityFeed` is needed by Home) and `Groups.tsx` (2 KB).

### 2.3 Other measured facts used below

- `firebase@12.19.0` / `@firebase/firestore@4.17.2`: `common-CLMydGSF.esm.js` does `import { RE2JS } from 're2js'`; the only call sites are `__PRIVATE_CoreLike`, `__PRIVATE_CoreRegexContains`, `__PRIVATE_CoreRegexMatch` (pipeline expression evaluators, `common-*.esm.js:15280–15352`). `re2js` minified alone = 145,028 raw / **42,870 gzip** (measured with rolldown).
- `react-router@7.18.4` `package.json` `exports` point every condition at `dist/development/`; the only difference from `dist/production/` is `var ENABLE_DEV_WARNINGS = true` vs `false`. Bundling exactly the 11 router symbols the app imports: development 40,024 / 14,096 gzip vs production 38,647 / 13,617 gzip → **≈0.5 KB gzip** overhead (the `"You rendered descendant <Routes>"` warning text is in `dist/assets/Misc-*.js`).
- `BrowserRouter` (`react-router/dist/development/chunk-OB3PAWPO.mjs:10492–10516`): `useTransitions === false ? setStateImpl(s) : React.startTransition(() => setStateImpl(s))` — navigations are transitions unless the app opts out. `App.tsx` uses `<BrowserRouter>` with no prop.
- `Intl` cost (Node 22 on this box, `hrtime`, 2,000 iterations): `new Intl.NumberFormat(...).format()` 58.6 µs/call vs cached 0.70 µs; `Date#toLocaleDateString(locale, opts)` **88.7 µs/call vs cached `Intl.DateTimeFormat#format` 1.01 µs**. 25 uncached `toLocale*` call sites in `src/` (non-test).
- lucide-react 1.52: `import { X } from 'lucide-react'` resolves to per-icon ESM files (`dist/esm/icons/*.mjs`); 76 distinct icons used across the app total 22.9 KB raw in the output. Tree-shaking works with Vite 8 [Certain].
- recharts and d3 appear **only** in `Insights-*.js` (grep over every chunk); no d3 leaks into shared chunks.
- Tesseract: `lib/ocr.ts:7` → `createWorker('eng', 1, …)` per call, `terminate()` in `finally`. Worker picks `/tesseract/tesseract-core-{relaxedsimd|simd|}-lstm.wasm.js` (3.9 MB raw, **1,462,450 gzip**); the binary `tesseract-core-simd-lstm.wasm` is 2,857,601 raw / **1,058,143 gzip** + 89 KB glue. Language data: `lstmOnly` → `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz` = **2,952,873 bytes** (HEAD request; the comment in `scripts/vite-tesseract.ts:7` says "~2 MB"). Cold OCR ≈ 4.4 MB over the wire before recognition starts.
- Service worker: `useRegisterSW` → `workbox-window` `register({ immediate: false })` waits for `window.load` [Certain]; precache = 73 entries incl. `Insights` (117 KB gzip), all 15 micro-chunks, `firebaseRepo`, Firestore. No runtime-caching rule for `fonts.googleapis.com` / `fonts.gstatic.com`.
- Images: receipts are downscaled to 1600 px / q0.8 before upload (`firebaseRepo.ts:530,548`), AI reads a 1600 px / q0.82 copy (`lib/ai.ts:36`), avatars are `squareJpeg(256)` (`Profile.tsx` via `lib/image.ts:21`), Google photo URLs render at ≤46 px. `ExpenseDetail.tsx:146` renders the receipt `<img>` with no dimensions and no `loading`/`decoding` attributes.

## 3. Findings

### HIGH

#### H1. First paint is blocked behind two serial JS waterfalls (React, then Auth + Firestore) and there is no HTML-level splash [Certain]

- `src/main.tsx:17–29` — `initRepo().then(() => createRoot(...).render(...))`; nothing renders until the repo (and therefore `firebase/app` + `firebase/auth` + `firebase/firestore` + storage + app-check) is downloaded and initialised.
- `src/data/index.ts:42–53` — `await import('./firebaseRepo')` is only reachable after the entry chunk executes, so the browser learns about 211 KB gzip of Firebase only after 134 KB gzip of React/app has arrived and run. `dist/index.html` has no `modulepreload` for `firebaseRepo-*.js`, `index.esm-D9aHykFL.js` or `index.esm-CXKVKAV5.js`.
- `index.html:46` — `<div id="root"></div>` is empty; the brand splash (`App.tsx:136–142`) is a React component, so it paints at stage 3.

Why it matters: this is the dominant start-up cost for every visit. Total before first React paint = 345.5 KB gzip / 1,128 KB raw JS in two round trips; on a 4G connection (≈1–1.5 MB/s, 100–200 ms RTT) that is roughly 0.6–1.2 s of pure transfer plus one extra RTT, plus ~0.5–1 s of parse/compile on a budget Android even when served from the service-worker cache [Likely]. Firestore's 556 KB raw alone is 49% of the parse budget before paint, and the signed-out Login screen does not need it at all.

Fix (three independent steps, cheapest first):

1. **CSS-only splash in `index.html`** (zero JS, paints when HTML arrives). The inline script already knows the accent and dark mode, so set a variable and style the empty root:
   ```html
   <style>
     #root:empty{min-height:100dvh;display:grid;place-items:center;background:linear-gradient(135deg,var(--splash,#6d28d9),#0b0a14)}
     #root:empty::before{content:"";width:5rem;height:5rem;border-radius:1.5rem;box-shadow:0 20px 40px rgba(0,0,0,.35);background:url(/pwa-192.png) center/cover}
   </style>
   <!-- in the existing inline script, after `a` is resolved: -->
   root.style.setProperty('--splash', accents[a])
   ```
   `/pwa-192.png` is already precached. Keep `<Splash/>` in `App.tsx` for the auth wait so the two are visually identical.
2. **Make the repo import static and chosen at build time**, so Vite emits the Firebase chunks as static dependencies of the entry (automatic `modulepreload` in `index.html`, single parallel download stage) and demo builds never ship Firebase while Firebase builds never ship `localRepo`/`seed` (also fixes M5). In `vite.config.ts`:
   ```ts
   import { defineConfig, loadEnv } from 'vite'
   export default defineConfig(({ mode }) => {
     const env = loadEnv(mode, process.cwd(), '')
     const firebase = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)
     return { resolve: { alias: { '@': ..., '#repo-impl': path.resolve(__dirname, firebase ? 'src/data/firebaseRepo.ts' : 'src/data/localRepo.ts') } }, ... }
   })
   ```
   and in `src/data/index.ts` replace the dynamic branch with `import { createRepo } from '#repo-impl'` (export a `createRepo(config, useEmulators)` from both files; `localRepo` ignores the args). `initRepo()` becomes synchronous, so `main.tsx` can render immediately. If you prefer to keep the dynamic import, the alternative is a ~20-line plugin that injects `<link rel="modulepreload">` for the chunk whose `facadeModuleId` ends in `firebaseRepo.ts` and its `imports` during `generateBundle`/`transformIndexHtml`.
3. **Stop awaiting the repo before `render()`** (only needed if step 2 is not taken): gate with React 19 `use()`:
   ```tsx
   const ready = initRepo()
   function RepoGate({ children }: { children: ReactNode }) { use(ready); return children }
   createRoot(root).render(<StrictMode><Suspense fallback={<Splash />}><RepoGate><BrowserRouter>…</BrowserRouter></RepoGate></Suspense></StrictMode>)
   ```
   This paints the React splash after stage 1 instead of after stage 2.

Expected gain: first contentful paint moves from "after 346 KB gzip of JS" to "after HTML" (step 1); time-to-interactive drops by one RTT plus the serialised transfer of 211 KB gzip (≈200–600 ms on 4G, step 2) [Likely]. A later, larger step (not required for the above) is to create Firestore lazily inside the repo (`const dbReady = import('firebase/firestore').then(f => f.initializeFirestore(app, …))`, subscribe in `watch*` after it resolves using the `let unsub; …; return () => { stopped = true; unsub?.() }` pattern already used in `lib/push.ts:135–145`), which removes 159 KB gzip / 556 KB raw from the signed-out Login path only.

#### H2. The Firestore chunk carries `re2js` (145 KB raw / 42.9 KB gzip) for pipeline regex evaluators the app never uses [Likely]

- `node_modules/@firebase/firestore/dist/common-CLMydGSF.esm.js` imports `RE2JS` from `re2js`; call sites are only `__PRIVATE_CoreLike`, `__PRIVATE_CoreRegexContains`, `__PRIVATE_CoreRegexMatch` (`like` / `regex_contains` / `regex_match` pipeline expressions). The app imports `firebase/firestore` only (`src/data/firebaseRepo.ts:7–12`, `src/lib/push.ts:57`, `src/lib/capture-settings.ts:77,91`), never `firebase/firestore/pipelines`. The bundler keeps `re2js` because it cannot prove the module side-effect free.
- Why it matters: 27% of the largest chunk on the critical path (159 KB gzip) is dead weight; `re2js` also has a sizeable static-initialisation cost at module evaluation.
- Fix: alias `re2js` to a stub in production builds. `src/stubs/re2js.ts`:
  ```ts
  // Firestore only uses RE2JS for pipeline regex expressions (like/regex_contains/regex_match), which this app never issues.
  export class RE2JS {
    static compile(pattern: string): never { throw new Error(`regex evaluation is not bundled (pattern: ${pattern})`) }
  }
  ```
  `vite.config.ts`: `resolve.alias: { re2js: path.resolve(__dirname, 'src/stubs/re2js.ts') }`. Firestore wraps every call in `try/catch` and logs a warning, so even an unexpected call degrades gracefully. Re-check after each `firebase` upgrade (grep `re2js` in `node_modules/@firebase/firestore/dist/common-*.esm.js`); if upstream moves it behind `firebase/firestore/pipelines`, drop the alias. Expected gain: −42.9 KB gzip / −145 KB raw on every first paint and in the precache.

#### H3. Insights pulls recharts + Redux Toolkit + d3 + decimal.js (417 KB raw / 117 KB gzip) for three small charts, and every user precaches it [Certain]

- `src/pages/Insights.tsx:3` imports 13 recharts components; the chunk is 67% recharts (281 KB) plus `@reduxjs/toolkit`/`immer`/`redux`/`reselect`/`react-redux` (27 KB), d3-scale/shape/time/color/format/array/interpolate/path (60 KB), `es-toolkit` (14 KB), `decimal.js-light` (13 KB). The page itself is 9 KB.
- `vite.config.ts:60` `globPatterns: ['**/*.{js,css,html,svg,png,woff2}']` precaches it (117 KB gzip downloaded on install for users who never open Insights); on a first visit the tap on the Insights tab downloads 117 KB gzip and parses 417 KB with no feedback (see M2).
- Why it matters: it is 20% of all shipped JS and 36% of the raw parse cost of the whole app, for a donut, an area chart with a gradient and a horizontal bar chart. The codebase already hand-draws SVG (`components/DebtGraph.tsx`, 1.7 KB) and a QR encoder (`lib/qr.ts`, 3.8 KB).
- Fix, preferred: replace recharts with ~5–8 KB of hand-written SVG in `src/components/charts/` — `Donut` (arcs via `Math.cos/sin`, `stroke-dasharray` or path arcs, `cornerRadius` optional), `AreaLine` (monotone path from a small Catmull-Rom/cubic helper + `<linearGradient>`), `HBars` (rects + text), tooltips as a positioned `<div>` on `pointermove`, sizing via a `ResizeObserver` hook instead of `ResponsiveContainer`. Keep `chartPalette.ts` as is. Expected gain: −115 KB gzip / −410 KB raw from `/insights` and from the precache; Insights becomes an ~10 KB gzip route.
  Fallback if recharts must stay: keep it out of the install precache and cache it on first use — `workbox.globIgnores: ['tesseract/**', '**/Insights-*.js']` plus `runtimeCaching: [{ urlPattern: /\/assets\/Insights-.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'insights', expiration: { maxEntries: 2 } } }]` (hashed filenames are immutable, so CacheFirst is safe); and prefetch it on idle after Home renders (M2).

#### H4. Render-blocking Google Fonts stylesheet on every load, not cached by the service worker [Certain]

- `index.html:15–17` — `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">`. A cross-origin stylesheet blocks first render until its response arrives (the two `preconnect`s help, but it is still a serial CSS request before paint); `display=swap` then causes a fallback→Inter reflow when the 5 woff2 files land.
- `vite.config.ts:57–71` — no `runtimeCaching` rule for `fonts.googleapis.com` / `fonts.gstatic.com`, so the installed PWA re-fetches the CSS every launch; offline it falls back to system fonts, and on a stalled connection first render waits on the stylesheet.
- Why it matters: ≈100–400 ms of FCP on mobile for first visits [Likely], a visible font swap, and an offline/installed experience that depends on a third-party origin.
- Fix: self-host Inter as a single variable latin-subset woff2 under `src/assets/fonts/` (one file covers 400–800) with `@font-face { font-family: Inter; src: url(...) format('woff2'); font-weight: 100 900; font-display: swap; }` in `index.css`, a fallback with metric overrides to kill the reflow (`@font-face { font-family: 'Inter Fallback'; src: local('Arial'); size-adjust: 107%; ascent-override: 90%; descent-override: 22%; line-gap-override: 0% }` and `--font-sans: 'Inter', 'Inter Fallback', …`), and `<link rel="preload" as="font" type="font/woff2" crossorigin href="...">` injected by Vite (import the font URL in `main.tsx` or reference it from CSS; `woff2` is already in `globPatterns`, so it is precached). Remove the three Google Fonts `<link>`s. Expected gain: one fewer render-blocking request and one fewer origin on the critical path; font available offline; no swap reflow.

### MEDIUM

#### M1. `useAllGroupData` re-subscribes every Firestore listener and re-shows a spinner on each tab switch [Certain]

- `src/hooks/data.ts:188–229` — subscriptions live in a `useRef` inside the hook and `initialLoadDone` is local `useState`. Six screens call it independently: `Home.tsx:22`, `Groups.tsx:9`, `Friends.tsx:29`, `Scan.tsx:20`, `Insights.tsx:21`, `Inbox.tsx:27`. Switching Home → Groups unmounts Home (unsubscribes `watchGroups` + 2×G listeners, plus G `watchActivity` listeners from `useRecentActivity` in `useInbox`), then Groups mounts and subscribes to the same queries again and renders `<Loading />` until every group has reported once (`data.ts:221–227`).
- Why it matters: every tab change costs 1 + 2G (+G) listener registrations and a layout flash; with persistence the data comes from cache quickly, but the watch-stream `addTarget`/`removeTarget` churn and the spinner are visible on mid-range phones with 10+ groups [Likely]. `computeGroupData` also runs for all groups on any single snapshot (`data.ts:224–228`).
- Fix: lift the subscriptions into one provider mounted once per signed-in session and read it through context:
  ```tsx
  // src/hooks/groupData.tsx
  const Ctx = createContext<GroupData[] | null>(null)
  export function GroupDataProvider({ children }: { children: ReactNode }) { return <Ctx.Provider value={useAllGroupDataImpl()}>{children}</Ctx.Provider> }
  export const useAllGroupData = () => useContext(Ctx)
  ```
  Mount `<GroupDataProvider>` in `AppRoutes` (`App.tsx:90`) above `<Routes>` so `Scan` (outside `Layout`) also shares it. Inside the impl, memoise per group: keep a `Map<groupId, {group, exp, set, result}>` and only recompute `computeGroupData` for ids whose three inputs changed identity. Optional React 19 follow-up: render the four tab pages inside `Layout` wrapped in `<Activity mode={active ? 'visible' : 'hidden'}>` so Home keeps its DOM, scroll position and effects while hidden (instant tab return).

#### M2. Lazy-route navigation gives no feedback, and the only `Suspense` boundary sits above the tab bar [Certain on mechanics, Likely on UX impact]

- React Router 7 wraps every navigation in `React.startTransition` (`BrowserRouter`, `chunk-OB3PAWPO.mjs:10507–10513`). When the destination is a not-yet-loaded `lazy()` page inside an already-revealed `<Suspense>` (`App.tsx:93`), React keeps the *old* screen on screen and shows no fallback until the chunk resolves; `NavLink`'s `isActive` does not move either because `location` is part of the transition. On a first visit that is 117 KB gzip for Insights, 18 KB for Profile, 8–10 KB + up to 16 preloaded sibling chunks for GroupDetail/ExpenseForm, with the UI appearing frozen.
- For the non-transition cases (deep link, `<Navigate>`), the boundary at `App.tsx:93` is *outside* `<Layout>`, so the fallback replaces the whole page including the tab bar and `Layout`'s `data-nav` attribute is removed (`Layout.tsx:23–26`), hiding `UpdatePrompt`.
- No prefetching exists: `import.meta.glob` is unused, there is no idle or pointer prefetch.
- Fix:
  1. Put the route loaders in one map and reuse it for `lazy()` and prefetch: `src/routes.ts` → `export const load = { GroupDetail: () => import('./pages/GroupDetail'), ExpenseForm: () => import('./pages/ExpenseForm'), Insights: () => import('./pages/Insights'), Profile: () => import('./pages/Profile'), … }` (or `import.meta.glob('./pages/*.tsx')`).
  2. In `Layout.tsx` tab bar: `onPointerDown={() => prefetch[t.to]?.()}` and, in `Home`, `useEffect(() => { const cb = () => { load.GroupDetail(); load.ExpenseForm(); load.Insights(); load.Profile() }; const id = 'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2000); return () => … }, [])`. Vite dedupes the `import()` with the later `lazy()` call.
  3. Pending indicator: in `Layout`, `const [pending, start] = useTransition()`; tabs navigate via `onClick={(e) => { e.preventDefault(); start(() => nav(t.to)) }}` and render a 2 px top progress bar while `pending` (reuse the existing `indeterminate` keyframes, `index.css:176`).
  4. Move `<Suspense fallback={<Loading />}>` inside `Layout` around `<Outlet />` (keep a second one around the full-screen routes) so the tab bar never disappears.

#### M3. Uncached `Date#toLocaleDateString` per row per render (89 µs each measured) [Certain on code, Likely on magnitude]

- 25 uncached call sites, the hot ones in list rows: `GroupDetail.tsx:294` (month bucket key, once per row) and `:400` (`fmtDay`, once per row) run on every keystroke in the search box (`:301–308`) and on every snapshot; `Home.tsx:158`; `activity.ts:245` (`fmtAgo`, every feed row older than 7 days); `locale.ts:127` (`formatDate` itself is uncached); `Inbox.tsx:20`, `ImportGroup.tsx:340`, `StatementImport.tsx:43`, `ExpenseDetail.tsx:226,234`, `Insights.tsx:205,211,238`, `Select.tsx:218`.
- Why it matters: `formatMoney` already caches `Intl.NumberFormat` (`money.ts:10,34–45`, good), but the date helpers do not. At 300 rows GroupDetail makes 600 uncached calls per render ≈ 53 ms on this desktop CPU, typically 3–5× on a budget phone, i.e. 150–250 ms per keystroke of search [Likely].
- Fix: one cached formatter in `src/lib/locale.ts` and route every call through it:
  ```ts
  const dtf = new Map<string, Intl.DateTimeFormat>()
  export function dateFormatter(opts: Intl.DateTimeFormatOptions, locale = current.locale): Intl.DateTimeFormat {
    const k = locale + '|' + JSON.stringify(opts)
    let f = dtf.get(k); if (!f) { f = new Intl.DateTimeFormat(locale, opts); dtf.set(k, f) } return f
  }
  export function formatDate(iso, opts = { day: 'numeric', month: 'short' }, locale = current.locale) { …; return dateFormatter(opts, locale).format(d) }
  ```
  Replace the 25 call sites with `formatDate(...)`; in `GroupDetail.ActivityList` wrap the filter → sort → bucket pipeline in `useMemo([expenses, settlements, f.q, f.categories, onlyMe])` and feed the search box through `useDeferredValue(filter.q)` so typing stays responsive. `Select.tsx:218` builds a `NumberFormat` per currency option on each open — cache it the same way.

#### M4. OCR cold start: a worker per scan, a 3.9 MB base64 wasm instead of a 2.9 MB binary, and 2.95 MB of language data from a CDN [Certain on code/sizes, Likely on timings]

- `src/lib/ocr.ts:4–22` — every `recognizeImage` calls `createWorker` and `terminate()`s it in `finally`, so each scan re-instantiates the wasm (≈1.5 MB gzip from cache) and re-loads the 12 MB (unzipped) traineddata into Tesseract: typically 1–3 s of CPU per scan on a phone before recognition starts.
- `scripts/vite-tesseract.ts:21–23` ships the `*-lstm.wasm.js` single-file builds (3.9 MB raw / 1.46 MB gzip each); tesseract.js honours a `corePath` that ends in `.js` (`node_modules/tesseract.js/src/worker-script/browser/getCore.js:21–22`), so the 89 KB Emscripten glue + 2.86 MB `.wasm` (1.06 MB gzip) can be used instead, which also lets the browser use streaming compilation instead of base64-decoding 3.9 MB of JS inside the worker.
- Language data defaults to jsDelivr `4.0.0_best_int` (2,952,873 bytes), fetched on first use only; `scripts/vite-tesseract.ts:7` documents it as ~2 MB.
- Note: with Firebase configured and "read bills with AI" on (default), OCR is only the fallback (`lib/ai.ts:33–50`), which limits the blast radius to demo mode, AI-off users and AI failures.
- Fix:
  1. Singleton worker with idle shutdown and a warm-up hook:
     ```ts
     let workerP: Promise<Worker> | undefined, idle: ReturnType<typeof setTimeout> | undefined, progress: ((p: number) => void) | undefined
     export function warmOcr() { return (workerP ??= createWorker('eng', 1, { workerPath, corePath, workerBlobURL: false, logger: (m) => m.status === 'recognizing text' && progress?.(m.progress) })) }
     export async function recognizeImage(file: File, onProgress?: (p: number) => void) {
       clearTimeout(idle); progress = onProgress
       const [w, image] = await Promise.all([warmOcr(), downscale(file, 1600, 0.9)])
       try { return (await w.recognize(image)).data.text }
       finally { progress = undefined; idle = setTimeout(() => { workerP?.then((w) => w.terminate()); workerP = undefined }, 2 * 60_000) }
     }
     ```
     Call `warmOcr()` from `Scan.tsx` on mount (only when `!aiScanEnabled() || !aiScanPossible()`), so the download/compile overlaps the user picking a photo.
  2. Ship glue + binary: in `scripts/vite-tesseract.ts` emit `tesseract-core-{,simd-,relaxedsimd-}lstm.js` and the matching `.wasm`; in `ocr.ts` pick the variant with `wasm-feature-detect` (already a tesseract.js dependency, ~1 KB) and pass `corePath: '/tesseract/tesseract-core-simd-lstm.js'`; widen the SW rule to `/\/tesseract\/[^/]+\.(js|wasm)$/` and add `maxEntries: 10`. Smoke-test once in Chrome and Safari (the glue resolves the `.wasm` relative to the worker script directory, which is also `/tesseract/`). Expected gain: −400 KB over the wire and faster instantiation on every cold OCR; `dist/tesseract` shrinks from 11.7 MB to 8.8 MB.
  3. Optional: self-host `eng.traineddata.gz` under `/tesseract/` (add to `globIgnores`, runtime-cache it) so OCR does not depend on jsDelivr; fix the "~2 MB" comment either way.

#### M5. Demo-mode repo, Storage and App Check are shipped eagerly on the pre-paint path (~15 KB gzip) [Certain]

- `src/data/index.ts:2` statically imports `createLocalRepo`, so `localRepo.ts` (10.9 KB raw) + `seed.ts` (3.7 KB) + most of `lib/table.ts` (4.1 KB) are in the eager `data`/`repo` chunks of every Firebase build (≈6 KB gzip).
- `src/data/firebaseRepo.ts:13` imports `firebase/storage` (22 KB raw) and `src/lib/appcheck.ts:2` imports `firebase/app-check` (13.6 KB raw) statically; `initAppCheck` returns immediately when `VITE_APPCHECK_SITE_KEY` is unset (`appcheck.ts:11–12`), and Storage is only touched by `uploadAvatar`, `attachReceipt`, `attachTableReceipt`, `deleteFileLater` (≈10 KB gzip together).
- Fix: H1 step 2 removes `localRepo`/`seed` for free. For Storage: `const storageP = () => import('firebase/storage').then((s) => { const st = s.getStorage(app); st.maxUploadRetryTime = 60_000; if (useEmulators) s.connectStorageEmulator(st, '127.0.0.1', 9199); return { s, st } })` memoised, awaited inside the four methods. For App Check: `if (!siteKey) return; const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check')` (make `initAppCheck` async and fire-and-forget it). Expected gain: ≈15–17 KB gzip / 55 KB raw off the first paint.

#### M6. The Home hero animates three 64 px-blurred layers (plus three bubbles) indefinitely with `will-change: transform` [Likely]

- `src/components/Aurora.tsx:17–24` + `src/index.css:160–172` — `blur-3xl` on three large blobs with 7–11 s infinite transform animations, each promoted with `will-change`, under `backdrop-blur` tiles (`Home.tsx:110,114`) and a `backdrop-blur-xl` tab bar (`Layout.tsx:34`). Reduced-motion is respected (`index.css:140`).
- Why it matters: blurred, continuously animated composited layers keep the GPU rasterising/compositing the hero every frame while Home is visible, which costs battery and competes with scroll on low-end Android GPUs. Magnitude not measured here (no device available) [Guessing on numbers].
- Fix: pause when not visible — `IntersectionObserver` on the hero toggling a `data-paused` attribute with `[data-paused] .animate-blob-a,…{animation-play-state:paused}`; also pause on `document.hidden`. Consider two blobs instead of three and `blur-2xl`, or a pre-rendered gradient PNG on `@media (hover: none) and (pointer: coarse)` if profiling shows jank.

### LOW

#### L1. 15 micro-chunks of 145–694 bytes; 57 JS files; ExpenseForm fans out to 17 requests [Certain]

- rolldown's default splitting emits every module shared by ≥2 lazy routes as its own file (13 single-icon chunks plus `useOcr`, `MemberChips`). Each costs a request, a `modulepreload` entry and a precache entry.
- Fix (Vite 8 exposes rolldown options): `build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'icons', test: /node_modules\/lucide-react\//, minShareCount: 2, priority: 10 }, { name: 'ui-shared', test: /src\/(components|hooks|lib)\//, minShareCount: 2, minSize: 2048 }] } } } }` — icons used by ≥2 routes become one ~5 KB chunk, shared tiny components merge into one. Alternatively `codeSplitting: { experimentalInlineCommonChunks: { maxSize: 1024 } }` duplicates ≤1 KB common modules into their importers (check the `preserveEntrySignatures` requirement noted in the rolldown typings). Verify with a rebuild that `Login`'s first-paint set does not grow.

#### L2. `react-router@7.18.4` ships only its development build (`ENABLE_DEV_WARNINGS = true`) [Certain, 0.5 KB gzip]

- `package.json` `exports` map every condition to `dist/development/*`; `dist/production/*` differs only by that constant. Measured overhead for the symbols this app uses: +1.4 KB raw / +0.48 KB gzip plus the runtime warning branches.
- Fix (production builds only): `resolve.alias: [{ find: /^react-router$/, replacement: 'react-router/dist/production/index.mjs' }, { find: /^react-router\/dom$/, replacement: 'react-router/dist/production/dom-export.mjs' }]` guarded by `mode === 'production'`; or wait for upstream to add `development`/`production` conditions. Low payoff; include only if touching the config anyway.

#### L3. Entry-chunk hygiene: `Trust.tsx` (9.6 KB raw) and `lib/ai.ts` are eager for one export each [Certain]

- `Home.tsx:6` imports `ActivityFeed` from `components/Trust.tsx`, which also hosts `TrustBadges`, `TrustPanel`, `HistoryCard`, `RecentlyDeleted`, `useUndoableDelete` used by lazy routes; because the module is in the entry, all of it is. `App.tsx:11` imports `setAiScan` from `lib/ai.ts` (drags `ocr.ts`; `ocr-parse.ts` is already eager via `lib/capture.ts`).
- Fix: move `ActivityFeed` to `components/ActivityFeed.tsx`; move `aiScanEnabled/setAiScan` to `lib/aiPrefs.ts`. ≈3 KB gzip off the first paint.

#### L4. Receipt image has no dimensions or lazy/async hints [Certain]

- `src/pages/ExpenseDetail.tsx:146` — `<img src={e.receiptUrl} className="max-h-96 w-full object-contain">` decodes a 1600 px JPEG on the main thread and shifts layout when it arrives.
- Fix: store `receiptW/H` at upload time (`downscale` knows the output size) and render `width`/`height` or an `aspect-ratio` box; add `loading="lazy" decoding="async"`. Avatars and Google photos are fine.

#### L5. Service-worker precache is "everything" (73 entries, ≈660 KB gzip on install) [Certain]

- Reasonable for an offline-first PWA and registration correctly waits for `load`, but it includes `Insights` (117 KB gzip), `AutoCaptureSetup` (17 KB) and `ImportGroup` (9 KB), which most users never open, and the 15 micro-chunks. Firebase Hosting serves `/assets/**` immutable (good), `/tesseract/**` has no explicit cache header (default `max-age=3600`; the SW's CacheFirst covers it).
- Fix: see H3 fallback (`globIgnores` + `CacheFirst` for rarely-used large chunks) and L1 (fewer entries).

#### L6. Home derives everything on every render [Certain, small today]

- `Home.tsx:29–75` rebuilds `groupsById`, totals, the `recent` flatMap+sort over all expenses, `topCounterparties` and `greeting` on each render (re-renders come from `useTodayRates`, `useInbox`'s `useSyncExternalStore`, toasts, captures). O(total expenses · log n) per render — ~1–5 ms at a few thousand expenses.
- Fix: `useMemo` the block on `[data, rates, home, box]`; combine with M1's per-group memoisation.

## 4. Code-splitting / lazy-loading plan, ordered by payoff ÷ effort

| # | Change | Effort | Expected saving | Ref |
|---|---|---|---|---|
| 1 | CSS-only splash in `index.html` | XS (10 lines) | FCP at HTML arrival instead of after 346 KB gzip JS (≈0.5–2 s earlier on 4G; ≈0.3–0.8 s from SW cache on low-end) | H1 |
| 2 | Build-time repo alias (`#repo-impl`) → static Firebase import, auto `modulepreload`, no demo code in Firebase builds | S | one RTT + serialised 211 KB gzip transfer (≈200–600 ms on 4G); −6 KB gzip eager | H1, M5 |
| 3 | `re2js` stub alias | XS | −42.9 KB gzip / −145 KB raw on first paint and precache | H2 |
| 4 | Self-host Inter variable + preload + fallback metrics; delete Google Fonts links | S | removes a render-blocking cross-origin request (≈100–400 ms FCP), font offline, no swap reflow | H4 |
| 5 | Lazy `firebase/storage` and `firebase/app-check` | S | −10 KB gzip / −36 KB raw eager | M5 |
| 6 | Shared `GroupDataProvider` (+ per-group memo) | M | no re-subscription / spinner on tab switches; fewer listener registrations | M1 |
| 7 | Cached `Intl.DateTimeFormat` + `useMemo`/`useDeferredValue` in GroupDetail list | S | ≈50 ms → ≈1 ms per render at 300 rows (desktop), 3–5× that on phones | M3 |
| 8 | Route loader map + idle/pointer prefetch + `useTransition` pending bar + `Suspense` inside `Layout` | S | first-visit taps no longer "freeze"; tab bar stays mounted | M2 |
| 9 | Replace recharts with hand-rolled SVG (or exclude from precache) | M–L | −115 KB gzip / −410 KB raw from `/insights` and install | H3 |
| 10 | OCR singleton worker + warm-up on Scan; glue+`.wasm` cores; wider SW rule | M | −400 KB per cold OCR, −1–3 s per subsequent scan; `dist/tesseract` −2.9 MB | M4 |
| 11 | rolldown `codeSplitting.groups` for icons/shared UI | XS | −13 requests, −15 precache entries | L1 |
| 12 | Split `ActivityFeed` and `aiPrefs` out of `Trust.tsx` / `ai.ts` | XS | −3 KB gzip eager | L3 |
| 13 | Pause Aurora when offscreen/hidden | S | GPU/battery on Home (unmeasured) | M6 |
| 14 | react-router production alias | XS | −0.5 KB gzip | L2 |
| 15 | Receipt `<img>` dimensions + lazy/async | XS | no CLS, off-main-thread decode | L4 |

Steps 1–5 together take the pre-paint JS from 345.5 KB gzip in two stages to ≈285 KB gzip in one parallel stage behind an immediate HTML splash, with no feature change. React 19 features that fit naturally: `use()` for the repo gate (if step 2 is skipped), `useTransition` for tab pending state, `useDeferredValue` for the GroupDetail search, and `<Activity>` to keep tab pages mounted once M1 is in place.

## 5. Already good (do not "fix")

- Route-level `lazy()` for 19 pages (`App.tsx:16–34`), `TableFinish` lazy inside `Table.tsx:23`; all dynamic imports get `modulepreload` hints for their dependencies via `__vite__mapDeps`.
- `tesseract.js` (`lib/ocr.ts:6`), `firebase/functions` (`firebaseRepo.ts:850`), `firebase/messaging` (`lib/push.ts:57`) and `capture-settings`' Firestore use are all loaded on first use; recharts/d3 exist only in the Insights chunk.
- lucide-react is tree-shaken per icon (76 icons = 22.9 KB raw total); `react`/`react-dom` are the production builds; `formatMoney` caches `Intl.NumberFormat`.
- Images are right-sized before upload (receipts 1600 px, avatars 256 px); Google avatars use `referrerPolicy="no-referrer"` and `decoding="async"`.
- Theme and accent are applied by an inline script before first paint (`index.html:18–34`); `/assets/**` is served `immutable`, `index.html`/`sw.js`/manifest `no-cache`; the SW registers after `load`, excludes the 11.7 MB tesseract assets from precache and runtime-caches them; `navigateFallback` denies `/__/` and `/api/`.
- CSS is 14.8 KB gzip despite eight runtime-switchable accent palettes; `@theme static` is intentional for runtime re-theming.
- `useAllGroupData` subscribes incrementally (adds/removes per group instead of restarting all listeners) and sorts ids so re-ordering does not churn effects.

## 6. Open questions for the product owner

1. **Server-side balances?** Every device downloads every expense and settlement of every group (`watchExpenses` has no `limit`, `firebaseRepo.ts:439–445`) because balances are computed client-side (`docs/PLAN.md:170`). A Cloud Function maintaining `groups/{id}.balances` would let Home subscribe to G group docs instead of 2G collections; this changes the trust/approval model and is a product decision, not a pure perf fix.
2. **Charts fidelity vs size (H3):** replacing recharts with hand-drawn SVG saves 115 KB gzip but gives up recharts' animations/tooltips; is a simpler static look acceptable for Insights?
3. **Self-host OCR language data (M4.3)?** Adds a 2.95 MB file to Hosting (bandwidth cost) in exchange for removing the jsDelivr dependency and enabling precise SW caching.
