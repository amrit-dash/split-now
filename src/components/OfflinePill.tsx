import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { usePendingWrites } from '@/hooks/usePendingWrites'
import { SAVING_AFTER_MS, syncNotice, syncText } from '@/lib/sync'

/**
 * A slim "Offline" notice for screens that write or fetch. Saves still work offline (they sync
 * later), so the default text says so; pass `text` where a screen really needs the network.
 */
export function OfflinePill({ text = 'Offline — changes will sync when you’re back', className = '' }: { text?: string; className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      data-testid="offline-pill"
      className={`mb-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 ${className}`}
    >
      <WifiOff size={14} aria-hidden className="shrink-0" /> {text}
    </div>
  )
}

/**
 * The app-wide sync note under the header (Layout): offline, with how many changes are waiting on
 * this phone; or "Saving…" when a save takes longer than a moment. While anything is unsent,
 * closing the tab asks first: in a private window, or a browser that can't keep the app's data,
 * an unsent change would be lost with the tab.
 */
export function SyncPill({ className = '' }: { className?: string }) {
  const online = useOnline()
  const { pending, since } = usePendingWrites()
  const [now, setNow] = useState(() => Date.now())
  // Re-check once the quiet period is over, so a slow save gets its note without polling.
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, since + SAVING_AFTER_MS - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [pending, since])
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [pending])
  const n = syncNotice({ pending, online, waitedMs: pending ? Math.max(now, Date.now()) - since : 0 })
  if (!n) return null
  return (
    <div
      role="status"
      data-testid={n.kind === 'offline' ? 'offline-pill' : 'saving-pill'}
      className={`mb-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${n.kind === 'offline' ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'} ${className}`}
    >
      {n.kind === 'offline' ? <WifiOff size={14} aria-hidden className="shrink-0" /> : <Loader2 size={14} aria-hidden className="shrink-0 animate-spin" />}
      {syncText(n)}
    </div>
  )
}
