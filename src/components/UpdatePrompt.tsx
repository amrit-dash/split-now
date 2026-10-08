import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Loader2, Sparkles } from 'lucide-react'
import { APP_NAME } from '@/lib/brand'

/**
 * "New version" banner, shown just above the bottom tab bar.
 *
 * Update does the skip-waiting handshake itself instead of relying on workbox-window's
 * `controlling` event, which is unreliable in installed iOS PWAs: tell the waiting worker to
 * take over, reload on `controllerchange`, and reload anyway after a short timeout.
 */
export function UpdatePrompt() {
  const regRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const [updating, setUpdating] = useState(false)
  const { needRefresh: [needRefresh, setNeedRefresh] } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      regRef.current = reg
      // Check for updates hourly while the app is open, and whenever it comes back to the foreground.
      if (reg) {
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
      }
    },
  })

  const update = async () => {
    setUpdating(true)
    let reloaded = false
    const reload = () => { if (!reloaded) { reloaded = true; window.location.reload() } }
    try {
      const reg = regRef.current ?? (await navigator.serviceWorker?.getRegistration())
      navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true })
      const waiting = reg?.waiting
      if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
      else reload() // already activated (e.g. by another tab): just load the new files
    } catch {
      reload()
    }
    setTimeout(reload, 3000)
  }

  // The install banner sits in the same spot; hide it while this one is up.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-update-ready', needRefresh)
  }, [needRefresh])

  const withNav = useHasNav()
  // Only on screens with the tab bar, rising from behind it; on forms and full-screen flows it
  // waits (an update is never urgent, and it must not cover Save buttons or bottom bars).
  if (!needRefresh || !withNav) return null
  return (
    <div className="animate-[rise_0.45s_cubic-bezier(0.2,0.9,0.3,1)] fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 mx-auto max-w-md" role="status" data-testid="update-banner">
      <div className="flex items-center gap-2.5 rounded-3xl bg-gradient-to-r from-brand-600 to-duo-600 p-2 pl-3 text-white shadow-xl shadow-brand-900/30 ring-1 ring-white/20">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Sparkles size={16} aria-hidden /></span>
        <div className="min-w-0 flex-1 truncate text-sm font-bold" title={`A new version of ${APP_NAME} is ready`}>New version ready</div>
        <button className="shrink-0 rounded-2xl px-2 py-2 text-sm font-semibold text-white/85" onClick={() => setNeedRefresh(false)} disabled={updating}>Later</button>
        <button className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-brand-700 shadow disabled:opacity-70" onClick={update} disabled={updating}>
          {updating && <Loader2 size={14} className="animate-spin" />} Update
        </button>
      </div>
    </div>
  )
}

/** Whether the tab bar (Layout) is on screen: html[data-nav]. */
function useHasNav() {
  return useSyncExternalStore((cb) => {
    const mo = new MutationObserver(cb)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] })
    return () => mo.disconnect()
  }, () => document.documentElement.hasAttribute('data-nav'))
}
