import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Inbox, Plus, X } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useCaptures, useGroups } from '@/hooks/data'
import type { Capture } from '@/types'
import { formatMoney } from '@/lib/money'
import { targetGroupFor } from '@/lib/inbox-sort'

/**
 * In-app banner for a payment captured while the app is open (a push notification isn't shown
 * for the app in front of you): "₹840 at Swiggy — add to Goa trip?". Only for captures created
 * after the app started, and not on the capture/inbox screens themselves. Arrivals queue up:
 * each is shown in turn, and when several are waiting the banner offers the Inbox instead of
 * dropping any. Rises above the tab bar, like the update banner.
 */
/** Captures older than this (i.e. from before the app opened) never pop up. */
const APP_START = Date.now()
const SHOW_MS = 20_000

export function CaptureAlert() {
  const { profile } = useMe()
  const captures = useCaptures()
  const groups = useGroups()
  const loc = useLocation()
  const queued = useRef(new Set<string>())
  const [queue, setQueue] = useState<string[]>([])

  // New pending captures join the queue once; handled ones leave it wherever they are.
  useEffect(() => {
    if (!captures) return
    const fresh = captures.filter((c) => c.status === 'pending' && c.createdAt >= APP_START && !queued.current.has(c.id))
    for (const c of fresh) queued.current.add(c.id)
    setQueue((q) => [...q.filter((id) => captures.some((c) => c.id === id && c.status === 'pending')), ...fresh.map((c) => c.id)])
  }, [captures])

  const currentId = queue[0]
  const current: Capture | undefined = currentId ? captures?.find((c) => c.id === currentId) : undefined
  const advance = () => setQueue((q) => q.slice(1))

  useEffect(() => {
    if (!currentId) return
    const t = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS)
    return () => clearTimeout(t)
  }, [currentId])

  const visible = !!current && !/^\/(capture|inbox)/.test(loc.pathname)
  // The update banner shares this spot; it steps aside while a capture is up.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-capture-alert', visible)
    return () => document.documentElement.removeAttribute('data-capture-alert')
  }, [visible])
  if (!visible || !current) return null

  const waiting = queue.length
  const tripId = groups ? targetGroupFor(current, groups) : undefined
  const trip = groups?.find((g) => g.id === tripId)
  const several = waiting > 1
  return (
    <div
      className="animate-[rise_0.45s_cubic-bezier(0.2,0.9,0.3,1)] fixed inset-x-3 bottom-[calc(var(--nav-h)+2rem)] z-30 mx-auto max-w-md"
      role="status"
      data-testid="capture-alert"
    >
      <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-2xl shadow-black/20 ring-1 ring-slate-900/10 dark:bg-ink-800 dark:ring-white/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xl dark:bg-brand-900/40" aria-hidden>
          {several ? '📥' : (trip?.emoji ?? '💸')}
        </span>
        <div className="min-w-0 flex-1">
          {several ? (
            <>
              <div className="truncate text-sm font-semibold">{waiting} new captured payments</div>
              <div className="text-muted truncate text-xs">Sort them in your Inbox?</div>
            </>
          ) : (
            <>
              <div className="truncate text-sm font-semibold">
                {formatMoney(current.amount, current.currency ?? profile.currency)} at {current.merchant}
              </div>
              <div className="text-muted truncate text-xs">{trip ? `Add to ${trip.name}?` : 'Sort it into a group?'}</div>
            </>
          )}
        </div>
        {several ? (
          <Link to="/inbox" onClick={() => setQueue([])} className="btn-primary btn-sm shrink-0">
            <Inbox size={16} aria-hidden /> Inbox
          </Link>
        ) : (
          <Link to={`/capture/${current.id}`} onClick={advance} className="btn-primary btn-sm shrink-0">
            <Plus size={16} aria-hidden /> {trip ? 'Add' : 'Sort'}
          </Link>
        )}
        <button
          type="button"
          onClick={several ? () => setQueue([]) : advance}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 dark:text-slate-400"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
