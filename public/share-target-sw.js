/*
 * Web Share Target handler, pulled into the Workbox-generated service worker via
 * `workbox.importScripts` (vite.config.ts). Android shares arrive as a multipart POST to
 * /share-target, which only a service worker can receive in a static PWA:
 *  - an image is parked in Cache Storage and the app opens /scan?shared=1 to OCR it
 *    (/scan?shared=toolarge when it is over MAX_IMAGE_BYTES: a 40 MB photo can exhaust
 *    Cache Storage quota on a low-end phone, and OCR downscales to 1600 px anyway);
 *  - text/links are forwarded to /share?title=…&text=…&url=… as a normal GET.
 * This listener is registered before Workbox's own, and Workbox only routes GETs anyway.
 */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share-target') return

  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      const file = form.getAll('image').find((f) => typeof f !== 'string' && f.size > 0)
      if (file) {
        if (file.size > MAX_IMAGE_BYTES) return Response.redirect('/scan?shared=toolarge', 303)
        const cache = await caches.open('splitit-share')
        await cache.put('/shared-image', new Response(file, {
          headers: { 'content-type': file.type || 'image/jpeg', 'x-file-name': encodeURIComponent(file.name || 'shared.jpg') },
        }))
        return Response.redirect('/scan?shared=1', 303)
      }
      const q = new URLSearchParams()
      for (const k of ['title', 'text', 'url']) {
        const v = form.get(k)
        if (typeof v === 'string' && v) q.set(k, v.slice(0, 2000))
      }
      return Response.redirect('/share?' + q.toString(), 303)
    } catch (e) {
      return Response.redirect('/share', 303)
    }
  })())
})
