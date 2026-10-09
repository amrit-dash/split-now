/*
 * Web Push handler, pulled into the Workbox-generated service worker via `workbox.importScripts`
 * (vite.config.ts). Cloud Functions send FCM *data-only* messages:
 *   { data: { title, body, url, tag? } }
 * so this worker shows every notification itself (iOS and Chrome both require a visible
 * notification per push). Clicking focuses an open app window and navigates it to data.url,
 * or opens a new one.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (e) { payload = { data: { body: event.data && event.data.text() } } }
  // FCM wraps fields as { data: {...}, notification?: {...} }; accept a bare object too.
  const data = payload.data || payload
  const n = payload.notification || {}
  const title = data.title || n.title || 'Split It'
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || n.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
    if (win) {
      await win.focus()
      if ('navigate' in win) {
        try { await win.navigate(target); return } catch (e) { /* not controlled yet */ }
      }
      win.postMessage({ type: 'navigate', url: target })
      return
    }
    await self.clients.openWindow(target)
  })())
})
