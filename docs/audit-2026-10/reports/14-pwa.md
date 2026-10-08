# 14 — PWA, service worker, offline, push and install

## 1. Summary

Examined `vite.config.ts` (VitePWA/Workbox), the generated `dist/sw.js` + precache manifest that is checked into the working tree, `public/push-sw.js`, `public/share-target-sw.js`, `src/components/UpdatePrompt.tsx`, `InstallBanner.tsx`, `NotificationSettings.tsx`, `CaptureAlert.tsx`, `src/lib/push.ts`, `src/data/firebaseRepo.ts` (persistence, sign-out), `src/data/index.ts` (authDomain), `src/App.tsx`, `src/main.tsx`, `index.html`, `firebase.json`, `public/` icons + `scripts/generate-icons.mjs`, `functions/src/{push,triggers,reminders,capture,config}.ts`, `functions/src/lib/{notify-text,prefs,recipients}.ts`, `firestore.rules` (pushTokens/settings), `docs/FIREBASE_SETUP.md`, `docs/PLAN.md`. Verdict: the PWA foundation is solid and above average — the app shell is fully precached (69 entries, 2.04 MiB on disk, ~0.6–0.7 MB on the wire), the OCR cores are correctly kept out of the precache, the update flow is prompt-based with a sane hourly/visibility check, the share-target handler is correct, iOS web-push constraints are explained in the UI, safe areas are handled everywhere, and permission is only requested from a tap. The real gaps are: (a) a shared-device push leak when sign-out happens offline (a token can end up under two accounts), (b) a dead code path in `push-sw.js` so notification taps on uncontrolled windows only focus the app, (c) the Google Fonts stylesheet is render-blocking, cross-origin and not cached by the service worker (so "works offline" is only true for the shell, not the font, and lie-fi networks delay first paint), (d) nothing in the UI says you are offline or that a change is still unsynced, (e) the maskable icon is visibly wrong, (f) manifest is missing `id`, `launch_handler`, `screenshots`, `display_override`, and (g) no Badging API. No Critical finding.

## 2. Findings

### HIGH

#### H1. Signed-out device keeps receiving the previous account's notifications (shared-phone leak) [Likely]
- `src/data/firebaseRepo.ts:225-237` (`signOut`), `src/lib/push.ts:111-132` (`disablePush`), `src/lib/push.ts:68-84` (`saveToken`), `src/App.tsx:55` (`refreshPush` on every open), `functions/src/push.ts:18-55`.
- What happens: `disablePush` queues the `pushTokens/{id}` delete with an un-awaited `batch.commit()` and calls FCM `deleteToken` (needs network, `.catch(() => {})`). `signOut` then does `if (online()) await waitForPendingWrites(...)` — **offline it skips the wait entirely** — and then `terminate(db); clearIndexedDbPersistence(db)`, which discards the queued delete. Result: user A's token document survives on the server and the browser's push subscription survives (FCM delete failed). User B signs in on the same phone → `refreshPush(B)` → `getToken()` returns the *same* token → saved under `users/B/pushTokens/{sameHash}`. The same FCM token is now under both accounts and every push for A ("Sarah added Dinner · ₹840 · your share ₹210", "Priya paid you ₹2,000") shows up on B's phone, in plain text. The same race exists online: `Promise.race([disablePush(me()), sleep(2000)])` + 3 s `waitForPendingWrites` cap can lose on a slow network.
- Why it matters: finance data on a lock screen of another person; shared/family phones are common in the target market.
- Fix (server side is the robust one, since the client can't touch another user's subcollection):
  ```ts
  // functions/src/triggers.ts (new)
  export const onPushTokenWritten = onDocumentCreated({ document: 'users/{uid}/pushTokens/{tokenId}', region: REGION }, async (event) => {
    const token = event.data?.get('token')
    if (typeof token !== 'string') return
    const dupes = await db().collectionGroup('pushTokens').where('token', '==', token).get()
    const batch = db().batch()
    let n = 0
    for (const d of dupes.docs) if (d.ref.parent.parent?.id !== event.params.uid) { batch.delete(d.ref); n++ }
    if (n) { await batch.commit(); logger.info('push token moved to new account', { uid: event.params.uid, removed: n }) }
  })
  ```
  This needs a collection-group single-field index on `pushTokens.token` — add to `firestore.indexes.json`:
  ```json
  "fieldOverrides": [{ "collectionGroup": "pushTokens", "fieldPath": "token", "indexes": [{ "queryScope": "COLLECTION_GROUP", "order": "ASCENDING" }] }]
  ```
  Client side, also make sign-out not drop the delete: in `signOut`, always `await Promise.race([waitForPendingWrites(db), sleep(3000)])` (not only when online — it resolves instantly when the queue is empty anyway), and when `!online()` keep a tombstone in `localStorage` (`splitit-push-revoke = { uid, id }`) that `refreshPush` of the *next* sign-in cannot act on, but a tiny callable `revokePushToken({ id })` (Admin SDK deletes `users/*/pushTokens/{id}` for any uid != caller via the index above) can. Optionally also have `functions/src/push.ts` include `uid` in `data` and have `push-sw.js` compare it to a uid the app stores in `caches.open('splitit-meta')` — but on iOS a push that shows nothing counts against the "3 silent pushes" revocation, so prefer the server fix.

#### H2. Google Fonts: render-blocking, cross-origin, never cached by the service worker [Certain]
- `index.html:16-18` (`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter...">`), `vite.config.ts:58-61` (runtimeCaching has only tesseract routes), `dist/sw.js` confirms no fonts route.
- What is wrong: the stylesheet is a render-blocking cross-origin request on every cold start. The SW has no route for `fonts.googleapis.com`/`fonts.gstatic.com`, so offline the app falls back to the system font (acceptable) but on "lie-fi" (the common case on Indian mobile data) first paint waits for a request that neither the SW nor the precache can satisfy. The marketing copy says "works offline"; the typography doesn't.
- Fix (preferred — self-host; the `woff2` glob already precaches it):
  ```bash
  npm i @fontsource-variable/inter
  ```
  ```ts
  // src/main.tsx
  import '@fontsource-variable/inter'   // before './index.css'
  ```
  ```css
  /* src/index.css, inside @theme */
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  ```
  and delete the three `<link rel="preconnect|stylesheet" ... fonts.g...>` lines from `index.html`. Variable Inter is one ~100 KB woff2 instead of five static weights (400/500/600/700/800 ≈ 5 × 20–30 KB), so this is also a size win. If Google Fonts must stay, add:
  ```ts
  runtimeCaching: [
    { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 4, maxAgeSeconds: 365 * 86400 } } },
    { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'google-fonts-files', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20, maxAgeSeconds: 365 * 86400 } } },
  ]
  ```
  and make the link non-blocking (`media="print" onload="this.media='all'"`).

### MEDIUM

#### M1. `push-sw.js` notification-tap fallback posts a message nobody listens for [Certain]
- `public/push-sw.js:30-45`; `grep -rn "serviceWorker.addEventListener('message'" src/` → no results.
- What is wrong: on tap the SW finds an open window, `focus()`es it and tries `win.navigate(target)`. `WindowClient.navigate()` rejects when the client is not controlled by *this* SW — and because the generated SW has **no `clientsClaim`** (see `dist/sw.js`: no `clientsClaim()` call; vite-plugin-pwa only sets it for `autoUpdate`), the first session after install and every hard-reloaded tab are uncontrolled. The code then falls back to `win.postMessage({ type: 'navigate', url })`, which no code in `src/` handles. Net effect: the app is focused but stays on whatever screen it was on; the capture/expense the notification was about never opens. Even in the success path `navigate()` does a full document reload, throwing away SPA state, when an in-app `nav()` would do.
- Fix: make `postMessage` the primary path (SPA navigation, no reload) and `navigate()` the fallback; add the listener once in `App.tsx`; turn on `clientsClaim`.
  ```js
  // public/push-sw.js (notificationclick)
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const same = wins.filter((w) => new URL(w.url).origin === self.location.origin)
  const win = same.find((w) => w.focused) ?? same.find((w) => w.visibilityState === 'visible') ?? same[0]
  if (win) {
    await win.focus()
    const controlled = (await self.clients.matchAll({ type: 'window' })).some((w) => w.id === win.id)
    if (controlled) { win.postMessage({ type: 'navigate', url: target }); return }   // SPA navigation, handled in App.tsx
    // Uncontrolled window (first session without clientsClaim, or a hard reload): real navigation.
    try { if ('navigate' in win) { await win.navigate(target); return } } catch (e) { /* fall through */ }
    await self.clients.openWindow(target)
    return
  }
  await self.clients.openWindow(target)
  ```
  ```tsx
  // src/App.tsx — inside App(), next to the other effects
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'navigate' || typeof e.data.url !== 'string') return
      const u = new URL(e.data.url, location.origin)
      if (u.origin === location.origin) nav(u.pathname + u.search)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [nav])
  ```
  ```ts
  // vite.config.ts workbox:
  clientsClaim: true,
  ```
  (With `clientsClaim`, the first-visit window is controlled immediately, so offline/precache routing, the share-target and `win.navigate()` all work from the first session; `skipWaiting` stays off, as the prompt flow requires.)

#### M2. Shows an OS notification even when the app is in the foreground; contradicts `CaptureAlert` [Certain]
- `public/push-sw.js:9-25` (always `showNotification`), `src/components/CaptureAlert.tsx:10-11` ("a push notification isn't shown for the app in front of you" — it is).
- A capture that arrives while the user is looking at the app produces both the in-app banner and a system notification (and a sound). Chrome/Firefox allow skipping the notification when a window of the origin is focused; iOS does not (3 silent pushes revoke permission), so keep showing on iOS.
  ```js
  self.addEventListener('push', (event) => {
    ...
    event.waitUntil((async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = wins.find((w) => w.focused)
      const ios = /iP(hone|ad|od)/.test(self.navigator.userAgent)
      if (focused && !ios) { focused.postMessage({ type: 'push', data }); return }   // let CaptureAlert/toast handle it
      await self.registration.showNotification(title, { ... })
      if ('setAppBadge' in self.navigator) self.navigator.setAppBadge().catch(() => {})   // see M9
    })())
  })
  ```

#### M3. Maskable icon is visibly broken; badge icon is a colour blob; no monochrome icon [Certain]
- `scripts/generate-icons.mjs:11-17`, `public/pwa-maskable-512.png` (viewed: a 400 px violet→pink gradient square on a flat `#7c3aed` 512 px canvas), `public/push-sw.js:20` (`badge: '/pwa-192.png'`).
- With Android's circular mask (safe radius 204.8 px) the square's edges sit at ±200 px, so the launcher shows a gradient disc with four flat-violet slivers at the edges and clipped corners; with squircle masks the flat corners show. Android renders the notification `badge` as a white silhouette of the alpha channel — a full-colour square PNG becomes a white square. Android 13 themed icons need `purpose: 'monochrome'`.
  ```js
  // scripts/generate-icons.mjs — replace the maskable block
  const square = String(svg).replace('rx="112"', 'rx="0"')               // full-bleed gradient, no corners
  const glyph = String(svg).replace(/<rect[^>]*\/>\s*/, '')               // white strokes only, transparent bg
  const bg = await sharp(Buffer.from(square)).resize(512, 512).png().toBuffer()
  const fg = await sharp(Buffer.from(glyph)).resize(400, 400).png().toBuffer()   // glyph inside the 80% safe zone
  await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toFile(out('pwa-maskable-512.png'))
  await sharp(Buffer.from(glyph)).resize(512, 512).png().toFile(out('pwa-mono-512.png'))   // purpose: monochrome
  await sharp(Buffer.from(glyph)).resize(96, 96).png().toFile(out('badge-96.png'))          // notification badge
  await sharp(Buffer.from(glyph)).resize(96, 96).png().toFile(out('shortcut-96.png'))
  ```
  ```ts
  // vite.config.ts manifest.icons
  { src: 'pwa-mono-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
  // push-sw.js
  badge: '/badge-96.png',
  ```

#### M4. Manifest is missing `id`, `launch_handler`, `display_override`, `screenshots`, `dir`, `prefer_related_applications` [Certain]
- `vite.config.ts:19-50`, `dist/manifest.webmanifest`.
- Without `id`, Chrome keys the installed app on `start_url`; changing `start_url` later (e.g. to `/?source=pwa`) creates a second app. Without `launch_handler`, desktop Chrome opens a *new* window for every shortcut/share/notification launch. Without `screenshots` (narrow + wide) Android shows the small install bar instead of the rich bottom-sheet install UI, and desktop can't show the richer dialog. `orientation: 'portrait'` locks tablets/foldables in portrait (Insights charts are the one screen that benefits from landscape).
  ```ts
  manifest: {
    id: '/',
    dir: 'ltr',
    lang: 'en',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    prefer_related_applications: false,
    orientation: 'portrait-primary',     // or drop it and let tablets rotate
    screenshots: [
      { src: 'screenshots/home-narrow.png',  sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Balances and groups' },
      { src: 'screenshots/group-narrow.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Who owes whom, simplified' },
      { src: 'screenshots/settle-narrow.png',sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Settle up over UPI' },
      { src: 'screenshots/home-wide.png',    sizes: '1920x1080', type: 'image/png', form_factor: 'wide',   label: 'Split Now on desktop' },
    ],
    shortcuts: [ /* use shortcut-96.png 96x96 icons from M3 */ ],
  }
  ```
  (`launch_handler` also complements the share target: a share while the app is open reuses the window.) The `theme_color` in the manifest is fixed violet while the page swaps it per accent — acceptable, but note the Android splash/task-switcher uses the manifest value, so non-violet users get a violet splash. [Certain]

#### M5. No offline indicator, no "unsynced" signal; some screens mis-report offline as "not found" [Certain]
- `grep -rn "'online'\|'offline'\|navigator.onLine" src/` → only two toasts (`StatementImport.tsx:106`, `ProfileCards.tsx:170`) and the repo's `online()` guard. `src/pages/Join.tsx:22,39` — `getInvite` rejects offline → "Invite not found. The link may be mistyped or the group was deleted." `src/pages/ExpenseForm.tsx:293` — receipt is dropped with a toast and never retried.
- Offline behaviour per screen (verified in `firebaseRepo.ts`): Home/Groups/GroupDetail/Insights read from the Firestore persistent cache (fine, but a group never opened on this device is empty with no hint); saving an expense/settlement/group/profile queues via `fire()` (durable in IndexedDB, synced on next launch — good) but the UI shows it as done with no pending marker and a *later* server rejection surfaces as a toast disconnected from the item; receipt upload is skipped (toast) and lost unless re-attached; AI reading falls back to on-device OCR (good); FX falls back to a stale cached rate or manual entry (good); avatar upload is blocked with a clear message (good); `claimInbox` is a no-op (good); Join/Table/Login need the network and fail with generic errors. Images from Storage (avatars, receipts) are not cached by the SW → broken `<img>` offline (avatars have `max-age=1y` so the HTTP cache may help; receipts are uploaded without `cacheControl` — `firebaseRepo.ts:276` is the only `cacheControl`).
- Fix:
  ```ts
  // src/hooks/useOnline.ts
  export function useOnline() {
    return useSyncExternalStore(
      (cb) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb) } },
      () => navigator.onLine, () => true)
  }
  ```
  Render a small pill in `Layout.tsx` under the header when `!online` ("Offline — changes will sync when you're back"), and use the same hook in `Join.tsx` (`invite === null && !online ? 'You're offline…'`) and `Login.tsx` (disable Google/email buttons with "Sign-in needs a connection"). For receipts, keep the `File` in `pending`/IndexedDB keyed by `expenseId` and retry in `App` on `online` (or at least say "Attach it again from the expense" in the toast). Add a Storage media route:
  ```ts
  { urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//, handler: 'CacheFirst',
    options: { cacheName: 'media', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 300, maxAgeSeconds: 30 * 86400, purgeOnQuotaError: true } } },
  ```
  and `await caches.delete('media')` in `signOut` (see M8). Set `cacheControl: 'private, max-age=31536000'` on receipt uploads too (`attachReceipt`, ~`firebaseRepo.ts:530`).

#### M6. Notification coverage gaps — most importantly the debtor is never told when someone records a payment "from" them [Certain]
- `functions/src/triggers.ts:60-70`: `if (!g || !to || to === s.createdBy) return` — when the *creditor* records "Rahul paid me ₹500", nobody is notified; Rahul finds out only if he opens the group, and the dispute/edit-history features exist precisely for this case. Only `onDocumentCreated` triggers exist: edits that change your share, deletions, approval decisions (the author never learns their expense was approved/rejected), comments, disputes raised/resolved, members joining, and a manual creditor "nudge" are all silent. `requiresApproval` only appends "· needs your approval" to the generic expense note under the `expenses` pref.
- Fix (first slice):
  ```ts
  // triggers.ts onSettlementCreated — after computing `to`
  const from = g?.members?.[s.from]?.uid
  const jobs: Promise<number>[] = []
  if (to && to !== s.createdBy) jobs.push(sendToUser(to, ['settlements'], settlementNote({...})))
  if (from && from !== s.createdBy) jobs.push(sendToUser(from, ['settlements'], {
    title: groupTitle(g.name ?? 'Group', g.emoji),
    body: `${clip(g.members?.[s.to]?.name ?? 'Someone', 30)} recorded that you paid ${formatMoney(s.amount, g.currency ?? 'INR')}. Not right? Open it to flag.`,
    url: `/groups/${groupId}`, tag: `settlement-${settlementId}`,
  }))
  await Promise.all(jobs)
  ```
  Then add `onDocumentUpdated('groups/{g}/expenses/{e}')` diffing `approvals`, `dispute`, `deletedAt`, `splits[me]` and `onDocumentCreated('groups/{g}/expenses/{e}/comments/{c}')`, with new pref keys `approvals`, `comments`, `changes` in both `functions/src/lib/prefs.ts` and `src/lib/push.ts` (and `firestore.rules:73` `hasOnly` list). Quiet hours: store `tz` (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on the token doc in `saveToken` (rules `hasOnly` += `'tz'`), and in `sendToUser` skip non-capture notes between 22:00–08:00 in the token's zone or defer them into a `queuedPush` collection flushed by `dailyReminders`. `reminders.ts` already assumes IST for everyone (`TIME_ZONE`) while the app supports AUD/USD groups.

#### M7. `enablePush` can hang forever; FCM token hygiene [Certain / Likely]
- `src/lib/push.ts:64-67`: `await navigator.serviceWorker.ready` never resolves if registration failed (Firefox private mode, storage blocked, `vite dev` without `devOptions`) → the "Turn on notifications" button spins forever (`busy` never cleared, no error).
- `functions/src/push.ts:25` reads `limit(20)` tokens; nothing prunes tokens by `lastSeen`. A phone that never reopens the app keeps its token until FCM returns `not-registered` (can take months). FCM's own guidance is to drop tokens stale for > 2 months. `saveToken` writes `lastSeen` on *every* open (one write per launch per device) — fine at this scale, but throttle to once a day. All messages, including the weekly reminder, go out with `Urgency: high` (`push.ts:36`), which wakes radios/battery; reminders should be `normal`.
  ```ts
  // push.ts currentToken()
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Notifications aren't ready yet — reload the app and try again.')), 10_000)),
  ])
  // saveToken(): skip the write if cached lastSeen is < 24h old
  // functions/src/push.ts sendToUser(): add `urgency: 'high' | 'normal'` to Note; reminders pass 'normal'
  // reminders.ts: after the group loop, prune: users/*/pushTokens where lastSeen < now - 60d (collectionGroup query, needs the index from H1)
  ```

#### M8. Sign-out leaves data behind: shared image cache, media cache, and the Firestore cache when another tab is open [Certain]
- `firebaseRepo.ts:232-236`: `clearIndexedDbPersistence` throws `failed-precondition` while any other tab has the DB open (`persistentMultipleTabManager`); the code only `console.warn`s and reloads, so on a shared browser the previous user's groups stay on disk. `caches 'splitit-share'` (`share-target-sw.js:17-21`) can hold a shared payment screenshot indefinitely if the share happened while signed out and the user never signs in. Firebase Messaging's own IndexedDB keeps the token when `deleteToken` failed (see H1).
  ```ts
  async signOut() {
    await Promise.race([disablePush(me()), sleep(2000)])
    await Promise.race([waitForPendingWrites(db).catch(() => {}), sleep(3000)])   // always, not only online
    new BroadcastChannel('splitit').postMessage({ type: 'signout' })             // other tabs: terminate(db) + location.reload()
    await signOut(auth)
    await Promise.allSettled([caches.delete('splitit-share'), caches.delete('media')])
    for (let i = 0; i < 3; i++) {
      try { await terminate(db); await clearIndexedDbPersistence(db); break } catch { await sleep(500) }
    }
    location.reload()
  }
  ```
  and in `createFirebaseRepo`: `new BroadcastChannel('splitit').onmessage = (e) => { if (e.data?.type === 'signout') terminate(db).finally(() => location.reload()) }`.

#### M9. No Badging API, although the data for it already exists [Certain]
- `grep -rn setAppBadge src/ public/` → nothing. `src/hooks/useInbox.ts` already computes `count` (captures to sort + approvals awaiting you + unread updates) and `src/pages/Home.tsx:87-92` draws a 99+ bubble on the inbox icon. iOS 16.4+ (installed), Chrome desktop/ChromeOS and Edge support `navigator.setAppBadge`; Android Chrome mirrors notification counts only.
  ```tsx
  // src/pages/Home.tsx (or a tiny <AppBadge/> in Layout) — after `const box = useInbox(data)`
  useEffect(() => {
    if (!('setAppBadge' in navigator) || box.loading) return
    ;(box.count > 0 ? navigator.setAppBadge(box.count) : navigator.clearAppBadge()).catch(() => {})
  }, [box.count, box.loading])
  ```
  and in `push-sw.js` after `showNotification`: `self.navigator.setAppBadge?.().catch(() => {})` (dot badge; the app replaces it with the real count on next open). Clear in `signOut` (`navigator.clearAppBadge?.()`).

#### M10. `share-target-sw.js` is served with Firebase Hosting's default 1-hour cache, so an updated SW can be installed with a stale import [Likely]
- `firebase.json` has `Cache-Control: no-cache` for `/sw.js`, `/push-sw.js`, `/index.html`, `/manifest.webmanifest` — but **not** `/share-target-sw.js`, and the rule set is duplicated verbatim for the `main` and `now` targets. `dist/sw.js` begins with `importScripts("share-target-sw.js","push-sw.js")` — unversioned names. Browsers fetch imported scripts through the HTTP cache during an update check (`updateViaCache: 'imports'`, the default workbox-window uses — `node_modules/vite-plugin-pwa/dist/client/build/register.js:29` passes only `scope`/`type`). So for up to an hour after a deploy, a device that already has the old `share-target-sw.js` in HTTP cache installs the *new* `sw.js` with the *old* share handler baked in until the next build. Also, both SW scripts are plain untyped JS in `public/` with zero tests (only `tests/firestore.push.test.ts` covers rules).
- Fix, minimal: add a header rule `{ "source": "/*-sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }` to both hosting blocks (and drop the two single-file rules). Fix, proper: switch to `injectManifest` so the handlers are TypeScript modules bundled *into* the hashed `sw.js`:
  ```ts
  // vite.config.ts
  VitePWA({
    strategies: 'injectManifest', srcDir: 'src/sw', filename: 'sw.ts', registerType: 'prompt',
    injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], globIgnores: ['tesseract/**'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
    manifest: { ... },
  })
  ```
  ```ts
  // src/sw/sw.ts
  /// <reference lib="webworker" />
  import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
  import { NavigationRoute, registerRoute } from 'workbox-routing'
  import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
  import { ExpirationPlugin } from 'workbox-expiration'
  import { CacheableResponsePlugin } from 'workbox-cacheable-response'
  import { clientsClaim } from 'workbox-core'
  import { handleShareTarget } from './share-target'   // moved from public/share-target-sw.js, typed, unit-tested
  import { onPush, onNotificationClick } from './push'  // moved from public/push-sw.js
  declare let self: ServiceWorkerGlobalScope
  self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })
  clientsClaim()
  self.addEventListener('fetch', handleShareTarget)
  self.addEventListener('push', onPush)
  self.addEventListener('notificationclick', onNotificationClick)
  precacheAndRoute(self.__WB_MANIFEST)
  cleanupOutdatedCaches()
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__\//, /^\/api\//, /^\/share-target/] }))
  // ...tesseract, fonts, media routes from H2/M5
  ```
  `tsconfig` needs a `src/sw` project with `"lib": ["ES2022", "WebWorker"]`. The handlers then get vitest coverage (fake `FormData` → expect `Response.redirect('/scan?shared=1', 303)` and a `caches.open('splitit-share')` put; a push payload → `showNotification` args; a click with/without a focused client).

#### M11. Install banner shows before any engagement and can never be permanently dismissed [Certain]
- `src/components/InstallBanner.tsx:100-104, 24-25` (7-day snooze only), rendered from `Layout.tsx:28` on every tabbed screen. On Android it pops over the tab bar as soon as `beforeinstallprompt` fires (within seconds of the first signed-in screen); on iOS Safari it shows on *every* visit forever (every 7 days after a dismiss), including for users who already installed but opened a link in Safari (undetectable — the check at `:28` is `navigator.standalone`). Chrome's own heuristics (and the `beforeinstallprompt` best practice) favour prompting after a meaningful action. The copy ("Full-screen, faster, works offline") doesn't mention the one thing iOS users *need* install for: notifications (`NotificationSettings.tsx:72-75` explains it, but only in Profile).
  ```ts
  const DISMISS_COUNT = 'splitit-install-dismissed-n'
  function snoozed() {
    try {
      const n = Number(localStorage.getItem(DISMISS_COUNT) ?? 0)
      if (n >= 2) return true                                  // "don't ask again" after two dismissals
      return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_MS * (n + 1)
    } catch { return false }
  }
  // dismiss(): also bump DISMISS_COUNT
  // Layout: <InstallBanner engaged={groups && groups.length > 0} /> — render only after the first group exists or on the 2nd session
  ```
  and on iOS make the subtitle "Add to Home Screen for notifications and offline use".

### LOW

#### L1. `__APP_VERSION__` is a static `0.1.0`; builds are indistinguishable [Certain]
- `vite.config.ts:11`, `package.json:4`, `src/pages/Profile.tsx:214`. Nothing bumps the version per deploy, so support can't tell which build a user runs and the "New version ready" banner can't say what it is.
  ```ts
  import { execSync } from 'node:child_process'
  const sha = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' } })()
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version}+${sha}`), __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  ```
  (`src/vite-env.d.ts`: `declare const __BUILD_TIME__: string`). Show `v0.1.0+ab12cd · 2026-10-08` in Profile and log it once in `main.tsx` so bug reports/console screenshots carry it. The SW precache revision changes per build anyway, so updates are unaffected.

#### L2. Multi-tab update forcibly reloads other tabs; no guard against stale lazy chunks [Certain / Likely]
- `register.js:55-63` (vite-plugin-pwa attaches a `controlling` → `reload()` listener in every tab that saw `waiting`), `UpdatePrompt.tsx:33`. Clicking **Update** in tab A activates the SW; tab B (possibly mid-form) is reloaded by the plugin without consent. Separately, if a tab ever outlives its precache (e.g. `Later` + a later activation), Vite's dynamic imports fail with a blank route; `grep vite:preloadError src/` → unhandled.
  ```ts
  // src/main.tsx
  window.addEventListener('vite:preloadError', () => window.location.reload())
  ```
  For the forced reload, pass `onNeedReload` in `useRegisterSW` that defers the reload while `document.querySelector('form[data-dirty]')` exists (or while `html[data-nav]` is absent — the same "no tab bar = a form is open" rule `UpdatePrompt` already uses).

#### L3. `navigateFallbackDenylist` and share-target hardening [Certain]
- `vite.config.ts:50`. The denylist (`/^\/__\//`, `/^\/api\//`) is complete for GET navigations (`NavigationRoute` tests `pathname + search`, and only GETs reach it, so the POST share target is handled by the imported listener first). Add `/^\/share-target/` defensively so a GET to that path (user refreshes the redirect target chain, or a browser retries) doesn't render the SPA shell with no handler, and in `share-target-sw.js` cap the image at e.g. 15 MB before `cache.put` (a 40 MB photo share can exhaust quota on low-end phones: `if (file.size > 15e6) return Response.redirect('/scan?shared=toolarge', 303)`).

#### L4. Precache contents and size [Certain]
- From `dist/sw.js`: 69 precached URLs, 2,141,172 bytes on disk (JS/CSS/HTML/SVG/PNG; ~0.6–0.7 MB compressed in transit) + `workbox-63829503.js` (22 KB). Largest: `index.esm-CXKVKAV5.js` 556 KB (Firestore), `Insights-*.js` 417 KB (Recharts), `index-*.js` 288 KB, `firebaseRepo-*.js` 136 KB, CSS 90 KB. Everything, including Insights/ImportGroup/AutoCaptureSetup chunks that most users never open, is downloaded on the first visit in the background. This is within normal PWA budgets and makes every route work offline, so no change is recommended — but note it competes with the first sign-in on slow networks; if that becomes visible in RUM, move `Insights`/`ImportGroup`/`AutoCaptureSetup` to a `StaleWhileRevalidate` runtime route via `globIgnores: ['assets/Insights-*.js', ...]`. `includeAssets: ['favicon.svg','apple-touch-icon.png']` is redundant (the glob already matches them) and `share-target-sw.js`/`push-sw.js` are precached as well as imported (harmless, 3.4 KB). Tesseract: 3 × 3.9 MB cores are correctly excluded; only the SIMD-matching one is fetched at runtime and cached (CacheFirst, `maxEntries: 8`); language data (~2 MB) comes from jsDelivr with `statuses: [0, 200]` — jsDelivr sends CORS headers so responses are 200, not opaque, good.

#### L5. iOS standalone pitfalls [Likely]
- `src/pages/Table.tsx:236` `<a href="/t/CODE?guest=demo" target="_blank">` — an in-scope link with `target=_blank` leaves the installed iOS app for Safari; use `<Link>`/same-tab. `src/pages/ExpenseDetail.tsx:146` opens the receipt image (cross-origin Storage URL) in Safari; an in-app lightbox keeps the user in the app. Google sign-in in standalone correctly uses `signInWithRedirect` and `authDomain()` (`src/data/index.ts:11-19`) pins the handler to the current host for `*.web.app`/`*.firebaseapp.com`; a custom domain must be listed in `VITE_AUTH_HOSTS` **and** in the Google OAuth client's authorized domains — `docs/FIREBASE_SETUP.md:26-27` only mentions `VITE_FIREBASE_AUTH_DOMAIN`, not `VITE_AUTH_HOSTS`. `upi://` links are plain `<a href>` without target (`SettleUp.tsx:259-261`) — correct for both platforms. No `apple-touch-startup-image` set: iOS shows a plain launch screen instead of the brand gradient the in-app `Splash` draws [Guessing on exact iOS behaviour]; `pwa-asset-generator` can emit the set if wanted.

#### L6. `pushsubscriptionchange` not handled [Certain]
- `public/push-sw.js` has no `pushsubscriptionchange` listener; when the browser rotates the subscription the device is unreachable until the app is next opened (`refreshPush` at `App.tsx:55` then repairs it). Acceptable given the per-open refresh; if iOS rotation complaints appear, add a handler that re-subscribes with the VAPID key and posts the new token to a tiny callable.

#### L7. Lock-screen privacy option [Certain]
- `functions/src/lib/notify-text.ts` bodies carry amounts and names ("Rahul paid you ₹2,000"). A `discreet: boolean` pref (body → "New payment in Goa Trip") is a small addition for people who show their lock screen; store next to the other prefs.

## 3. Already good (don't "fix")

- Prompt-style updates with hourly + `visibilitychange` `reg.update()`, a single mount of `UpdatePrompt`, a manual SKIP_WAITING handshake with a 3 s fallback, the banner only on tabbed screens (never over a Save button), and install/update/capture banners that step aside for each other via `html[data-*]` attributes.
- Precache is right-sized: hashed assets with `revision: null`, `index.html` revisioned, `cleanupOutdatedCaches`, OCR cores excluded and runtime-cached, 5 MB cap.
- Firebase Hosting headers: `no-cache` on `sw.js`, `index.html`, `manifest.webmanifest` (with the right content type), `immutable` on `/assets/**`.
- `navigateFallbackDenylist` covers `/__/` (auth handler) and `/api/`; same-host `authDomain()` avoids ITP partitioning for the iOS redirect flow.
- Share target: POST handler before Workbox routes, image parked in Cache Storage with the filename header, 303 redirects, consumed-and-deleted by `Scan.tsx`, works when signed out via `splitit-return`.
- Push: data-only messages so iOS/Chrome always get a visible notification; token ids are `sha256(token)`; dead tokens pruned on `not-registered`/`invalid`; `tag` + `renotify` dedupes; permission only requested from a tap in Profile (no first-open prompt); iOS 16.4+/Home-Screen requirement explained in the card; Notifications card hidden without a VAPID key; prefs merged with `{ merge: true }` so Notification and Auto-capture sections don't clobber each other; rules `hasOnly` the prefs/token fields.
- Firestore `persistentLocalCache` + `persistentMultipleTabManager`, un-awaited batches so saves work offline, `onError` channel for late rejections, `getDocFromCache` reads for optimistic context, `includeMetadataChanges` guard so the captures screen doesn't flash empty.
- Install: `beforeinstallprompt` captured at module scope before React mounts, `appinstalled` handled, `display-mode: standalone` + `navigator.standalone` detection, iOS step-by-step sheet, 7-day snooze, install card also in Profile.
- Safe areas: `viewport-fit=cover`, `black-translucent` status bar with `env(safe-area-inset-top)` on every header/toast, tab bar padding derived from `safe-area-inset-bottom`; theme-colour synced per accent before first paint with a unit test keeping `index.html` and `accent.ts` in sync (verified: `src/lib/accent.test.ts` passes).

## 4. Open questions for the product owner

1. Should a device that is signed out *offline* keep the Firestore cache until it can flush the push-token delete (privacy vs. not leaking notifications), or is the server-side dedupe in H1 sufficient on its own?
2. Which of the missing notification types (debtor-side settlement notice, approval decided, comments, disputes, edits to your share, manual "remind") are wanted, and should quiet hours be per device (token `tz`) or per account?
3. Is a permanent "Don't ask again" for the install banner acceptable, or should it keep reappearing every 7 days on iOS where install can't be detected?
4. Keep Google Fonts (and accept the runtime-cached cross-origin request) or self-host Inter Variable (recommended; one request, precached, ~100 KB)?
