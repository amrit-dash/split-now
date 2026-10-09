/*
 * Web Push handler, pulled into the Workbox-generated service worker via `workbox.importScripts`
 * (vite.config.ts). Cloud Functions send FCM *data-only* messages:
 *   { data: { title, body, url, tag?, badge? } }
 * so this worker shows every notification itself (iOS and Chrome both require a visible
 * notification per push). When a window of the app is focused (not on iOS, where a push that
 * shows nothing counts against the permission), the message is handed to that window instead,
 * which shows its own in-app banner. `badge` is the count for the app icon (captures to sort
 * plus approvals waiting). A tap sends { type: 'navigate', url } to an open window (the app
 * navigates in place, keeping its state), or opens a new one.
 */
const APP_NAME = 'Split Now'

/** Only same-origin app paths are ever opened: never a protocol-relative or absolute URL from a payload. */
function safePath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/'
  try {
    const u = new URL(url, self.location.origin)
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : '/'
  } catch (e) {
    return '/'
  }
}

const isIOS = () => /iP(hone|ad|od)/.test(self.navigator.userAgent)

function setBadge(badge) {
  if (!('setAppBadge' in self.navigator)) return
  const n = Number(badge)
  const p = Number.isFinite(n) && n > 0 ? self.navigator.setAppBadge(n) : Number.isFinite(n) ? self.navigator.clearAppBadge() : self.navigator.setAppBadge()
  if (p && p.catch) p.catch(() => {})
}

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (e) { payload = { data: { body: event.data && event.data.text() } } }
  // FCM wraps fields as { data: {...}, notification?: {...} }; accept a bare object too.
  const data = payload.data || payload
  const n = payload.notification || {}
  const title = data.title || n.title || APP_NAME
  const body = data.body || n.body || ''
  const url = safePath(data.url)
  event.waitUntil((async () => {
    setBadge(data.badge)
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const focused = wins.find((w) => w.focused && new URL(w.url).origin === self.location.origin)
    if (focused && !isIOS()) {
      // The app is in front: it shows its own banner (CaptureAlert / toast) for this message.
      focused.postMessage({ type: 'push', data: { title, body, url, tag: data.tag || undefined, badge: data.badge } })
      return
    }
    await self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/badge-96.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safePath(event.notification.data && event.notification.data.url)
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const same = wins.filter((w) => new URL(w.url).origin === self.location.origin)
    const win = same.find((w) => w.focused) || same.find((w) => w.visibilityState === 'visible') || same[0]
    if (win) {
      try { await win.focus() } catch (e) { /* focus can be refused; carry on */ }
      // In-app navigation keeps the SPA's state; src/App.tsx listens for this message.
      win.postMessage({ type: 'navigate', url: path })
      return
    }
    await self.clients.openWindow(target)
  })())
})
