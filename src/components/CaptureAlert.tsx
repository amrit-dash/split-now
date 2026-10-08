import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useCaptures, useGroups } from '@/hooks/data'
import type { Capture } from '@/types'
import { formatMoney } from '@/lib/money'

/**
 * In-app banner for a payment captured while the app is open (a push notification isn't shown
 * for the app in front of you): "You spent ₹840 at Swiggy — add to Goa Trip?". Only for captures
 * created after the app started, and not on the capture/inbox screens themselves. Rises above
 * the tab bar, like the update banner.
 */
/** Captures older than this (i.e. from before the app opened) never pop up. */
const APP_START = Date.now()

export function CaptureAlert() {
  const { profile } = useMe()
  const captures = useCaptures()
  const groups = useGroups()
  const loc = useLocation()
  const shown = useRef(new Set<string>())
  const [current, setCurrent] = useState<Capture | null>(null)

  useEffect(() => {
    if (!captures) return
    const fresh = captures.find((c) => c.status === 'pending' && c.createdAt >= APP_START && !shown.current.has(c.id))
    if (fresh) { shown.current.add(fresh.id); setCurrent(fresh) }
    if (current && !captures.some((c) => c.id === current.id && c.status === 'pending')) setCurrent(null)
  }, [captures]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => setCurrent(null), 20_000)
    return () => clearTimeout(t)
  }, [current])

  const visible = !!current && !/^\/(capture|inbox)/.test(loc.pathname)
  // The update banner shares this spot; it steps aside while a capture is up.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-capture-alert', visible)
    return () => document.documentElement.removeAttribute('data-capture-alert')
  }, [visible])
  if (!visible || !current) return null
  const trip = groups?.find((g) => g.id === current.suggestedGroup)
  return (
    <div className="animate-[rise_0.45s_cubic-bezier(0.2,0.9,0.3,1)] fixed inset-x-3 bottom-[calc(var(--nav-h)+2rem)] z-30 mx-auto max-w-md" role="status" data-testid="capture-alert">
      <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-2xl shadow-black/20 ring-1 ring-slate-900/10 dark:bg-ink-800 dark:ring-white/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xl dark:bg-brand-900/40">{trip?.emoji ?? '💸'}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{formatMoney(current.amount, current.currency ?? profile.currency)} at {current.merchant}</div>
          <div className="truncate text-xs text-slate-500">{trip ? `Add to ${trip.name}?` : 'Sort it into a group?'}</div>
        </div>
        <Link to={`/capture/${current.id}`} onClick={() => setCurrent(null)} className="btn-primary !min-h-0 shrink-0 !px-3.5 !py-2 text-sm"><Plus size={16} aria-hidden /> {trip ? 'Add' : 'Sort'}</Link>
        <button onClick={() => setCurrent(null)} className="rounded-full p-1.5 text-slate-400" aria-label="Dismiss"><X size={16} /></button>
      </div>
    </div>
  )
}
