import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LogIn, RefreshCw } from 'lucide-react'
import { repo } from '@/data'
import { parseCaptureParams } from '@/lib/capture'
import { formatMoney } from '@/lib/money'
import { defaultCurrency } from '@/lib/locale'
import { todayISO } from '@/lib/id'
import { stashCapture } from '@/lib/pending'
import { Spinner } from '@/components/Misc'
import Login from './Login'

/** One submission per link, even under StrictMode's double effects. */
const submitted = new Map<string, Promise<void>>()

/**
 * /capture opened while signed out. On iOS this is the usual case: a Shortcut's "Open URL" lands in
 * Safari, which doesn't share storage with the installed app. If the link carries a capture key
 * (t + u) we drop the payment into captureInbox without signing in; otherwise we keep the link and
 * ask the user to sign in. A failed drop says so and offers a retry (the link is kept either way).
 */
export default function CaptureGuest() {
  const search = location.search
  // biome-ignore lint/correctness/useExhaustiveDependencies: today's date is read once per link
  const parsed = useMemo(() => parseCaptureParams(new URLSearchParams(search), todayISO()), [search])
  const canInbox = parsed.ok && !!parsed.token && !!parsed.owner && repo.mode === 'firebase'
  const [state, setState] = useState<'saving' | 'saved' | 'failed' | 'login'>(canInbox ? 'saving' : 'login')
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the drop after a Retry
  useEffect(() => {
    if (!canInbox || !parsed.ok) { stashCapture(search); return }
    const d = parsed.draft
    let p = submitted.get(search)
    if (!p) {
      p = repo.submitToInbox({
        token: parsed.token!, uid: parsed.owner!, amount: d.amount, currency: d.currency, merchant: d.merchant,
        ts: d.ts ?? d.date, src: d.source, card: d.card, raw: d.raw,
      }, d.ref)
      submitted.set(search, p)
    }
    p
      .then(() => setState('saved'))
      .catch((e) => {
        // An existing ref means this exact payment was already saved.
        if ((e as { code?: string }).code === 'permission-denied' && d.ref) setState('saved')
        else { console.warn(e); stashCapture(search); submitted.delete(search); setState('failed') }
      })
  }, [canInbox, parsed, search, attempt])

  const retry = () => { setState('saving'); setAttempt((n) => n + 1) }
  const amount = parsed.ok ? <>{formatMoney(parsed.draft.amount, parsed.draft.currency ?? defaultCurrency())} at {parsed.draft.merchant}</> : null

  if (state === 'login' || state === 'failed') {
    return (
      <>
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex max-w-md items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-xl" role="status" data-testid="guest-capture-banner">
            {state === 'failed' ? (
              <>
                <AlertTriangle size={18} className="shrink-0 text-amber-600" aria-hidden />
                <span className="min-w-0">Couldn’t save this automatically. Sign in and it will be kept{amount ? <>: {amount}</> : ''}.</span>
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={retry}><RefreshCw size={14} aria-hidden /> Retry</button>
              </>
            ) : (
              <>
                <LogIn size={18} className="shrink-0 text-brand-600" aria-hidden />
                {amount ? <>Sign in to save {amount}.</> : <>Sign in to continue.</>}
              </>
            )}
          </div>
        </div>
        <Login />
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6 text-center text-white">
      {state === 'saving' ? <Spinner label="Saving to your Inbox" /> : (
        <>
          <CheckCircle2 size={56} className="text-emerald-400" aria-hidden />
          <h1 className="mt-4 text-2xl font-extrabold">Saved to your Inbox</h1>
          {amount && <p className="mt-2 text-slate-300">{amount}</p>}
          <p className="mt-4 max-w-xs text-sm text-slate-400">Open Split Now from your home screen to choose a group. You can close this tab.</p>
        </>
      )}
    </div>
  )
}
