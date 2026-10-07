import { useEffect, useRef, useState } from 'react'
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

  if (!needRefresh) return null
  return (
    <div className="animate-pop fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[90] mx-auto max-w-md" role="status">
      <div className="flex items-center gap-3 rounded-3xl bg-slate-900 p-2.5 pl-4 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10 dark:bg-ink-800">
        <Sparkles size={18} className="shrink-0 text-brand-300" aria-hidden />
        <div className="min-w-0 flex-1 text-sm font-medium leading-tight">A new version of {APP_NAME} is ready</div>
        <button className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-300" onClick={() => setNeedRefresh(false)} disabled={updating}>Later</button>
        <button className="flex items-center gap-1.5 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-70" onClick={update} disabled={updating}>
          {updating && <Loader2 size={14} className="animate-spin" />} Update
        </button>
      </div>
    </div>
  )
}
