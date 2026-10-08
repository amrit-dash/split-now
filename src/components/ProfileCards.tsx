import { useEffect, useId, useState } from 'react'
import { Camera, Check, ChevronDown, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { isSynced, loadSharedRates, ratesStatus, refreshRates, type RatesStatus } from '@/lib/fx'
import { appLocale } from '@/lib/locale'
import { Avatar } from './Avatar'
import { useToast } from './Toast'

/**
 * The user card at the top of Profile: photo, name and email; tap to expand and edit the name,
 * mobile number and sign-in methods (link Google / add a password so one email = one account).
 */
export function AccountCard({ name, setName, phone, setPhone, photoURL, email, onPhoto, currencyField }: {
  name: string
  setName: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  photoURL?: string
  email?: string
  onPhoto: () => void
  /** Default-currency picker + rates refresh, shown in the expanded card. */
  currencyField?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const sub = email ?? (repo.mode === 'demo' ? 'Demo account (this device only)' : phone || '')
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <button type="button" className="relative shrink-0 rounded-full transition active:scale-95" onClick={onPhoto} aria-label="Change profile photo" data-testid="profile-photo">
          <Avatar name={name || '?'} photoURL={photoURL} color="accent" size={60} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 dark:bg-ink-800 dark:text-slate-300 dark:ring-ink-700">
            <Camera size={13} />
          </span>
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={bodyId} data-testid="account-toggle">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xl font-bold">{name || 'Your name'}</span>
            <span className="block truncate text-sm text-slate-500">{sub}</span>
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400">
            <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </button>
      </div>
      {open && (
        <div id={bodyId} className="animate-fade space-y-4 border-t border-slate-100 p-4 dark:border-white/5">
          <div>
            <label className="label" htmlFor="acct-name">Name</label>
            <input id="acct-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="acct-phone">Mobile number</label>
            <input id="acct-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Also fills the phone number for UPI apps in “How friends can pay you”.</p>
          </div>
          {currencyField}
          {email && (
            <div>
              <div className="label">Email</div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-500 dark:bg-ink-800">{email}</div>
            </div>
          )}
          {repo.mode === 'firebase' && <SignInMethods />}
          <p className="text-xs text-slate-500">Changes are saved with <b>Save profile</b> at the bottom.</p>
        </div>
      )}
    </div>
  )
}

/** Google + password on one account, so the same email never ends up as two accounts. */
function SignInMethods() {
  const { user } = useMe()
  const toast = useToast()
  const [providers, setProviders] = useState<string[]>(user.providers ?? [])
  const [busy, setBusy] = useState<'google' | 'password' | null>(null)
  const [pw, setPw] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const has = (p: string) => providers.includes(p)

  const run = async (kind: 'google' | 'password', fn: () => Promise<void>, ok: string, add: string) => {
    setBusy(kind)
    try {
      await fn()
      setProviders((p) => [...new Set([...p, add])])
      toast(ok)
      setPwOpen(false)
      setPw('')
    } catch (e) {
      toast(linkError(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="label">Sign-in methods</div>
      <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50 dark:divide-white/5 dark:bg-ink-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 font-medium">Google</span>
          {has('google.com')
            ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={16} /> Linked</span>
            : <button className="btn-ghost !min-h-0 !px-2 !py-1 text-sm" disabled={!!busy} onClick={() => run('google', () => repo.linkGoogle!(), 'Google linked', 'google.com')}>
                {busy === 'google' ? <Loader2 size={14} className="animate-spin" /> : null} Link Google
              </button>}
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex-1 font-medium">Email &amp; password</span>
            {has('password')
              ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={16} /> Set</span>
              : <button className="btn-ghost !min-h-0 !px-2 !py-1 text-sm" disabled={!!busy} onClick={() => setPwOpen((o) => !o)}>Add password</button>}
          </div>
          {pwOpen && !has('password') && (
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run('password', () => repo.addPassword!(pw), 'Password added', 'password') }}>
              <input className="input !py-2" type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
              <button className="btn-primary !min-h-0 shrink-0 !px-4 !py-2 text-sm" disabled={!!busy || !pw}>
                {busy === 'password' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Save
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Link both so you can sign in either way and never end up with two accounts for one email.</p>
    </div>
  )
}

function linkError(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('credential-already-in-use') || code.includes('email-already-in-use')) return 'That Google account already belongs to another Split Now account'
  if (code.includes('provider-already-linked')) return 'Already linked'
  if (code.includes('requires-recent-login')) return 'For security, sign out and back in, then try again'
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'Cancelled'
  if (code.includes('password-does-not-meet-requirements')) {
    const rules = (e as Error).message?.match(/\[(.*)\]/)?.[1]
    return rules ? rules.replace(/, /g, ' · ') : 'Password is too weak'
  }
  if (code.includes('weak-password')) return 'Use at least 6 characters'
  return (e as Error).message ?? 'Couldn’t link'
}

/**
 * Default currency picker with the shared-rates refresh beside it: a labelled Refresh button
 * with a status dot on its corner (emerald = synced with the latest ECB publication, slate = not
 * synced), and the details in one quiet line under the field. Refreshing updates the shared rates
 * for everyone (or this device's copy in demo mode).
 */
export function RatesField({ base, children }: { base: string; children: React.ReactNode }) {
  const toast = useToast()
  const [status, setStatus] = useState<RatesStatus | null>(() => ratesStatus(base))
  const [busy, setBusy] = useState(false)
  const [shownFor, setShownFor] = useState(base)
  if (shownFor !== base) { setShownFor(base); setStatus(ratesStatus(base)) }

  // Pick up the shared copy (a Firestore read, no refresh) so the status is right on open.
  useEffect(() => {
    let live = true
    loadSharedRates(base).then((s) => { if (live && s) setStatus(s) }).catch(() => {})
    return () => { live = false }
  }, [base])

  const refresh = async () => {
    setBusy(true)
    const r = await refreshRates(base)
    setBusy(false)
    if (!r) return toast(navigator.onLine ? 'Couldn’t reach the rates service' : 'You’re offline', 'err')
    const s = { date: r.date, fetchedAt: r.at, shared: r.shared }
    setStatus(s)
    toast('Exchange rates updated')
  }

  const synced = isSynced(status)
  const label = `Exchange rates ${synced ? 'synced' : 'not synced'}. Refresh.`
  return (
    <div>
      <div className="label">Default currency</div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button" onClick={refresh} disabled={busy} aria-label={label} title={label} data-testid="rates-button"
          className="relative flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-500/30 transition active:scale-95 disabled:opacity-70 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-400/30"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} aria-hidden />
          Refresh
          <span aria-hidden className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full ring-[3px] ring-white dark:ring-ink-900 ${synced ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`} />
        </button>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500" data-testid="rates-status">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${synced ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden />
        {status ? `${synced ? 'Rates synced' : 'Rates not synced'} · ${ratesDetails(status)}` : 'Rates not loaded yet'}
      </p>
    </div>
  )
}

/** "ECB 7 Oct, fetched 10:42" (or "fetched 6 Oct, 18:05" when not today). */
function ratesDetails(s: RatesStatus): string {
  const loc = appLocale()
  const ecb = new Date(s.date + 'T00:00').toLocaleDateString(loc, { day: 'numeric', month: 'short' })
  const at = new Date(s.fetchedAt)
  const time = at.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  const sameDay = at.toDateString() === new Date().toDateString()
  return `ECB ${ecb}, fetched ${sameDay ? time : `${at.toLocaleDateString(loc, { day: 'numeric', month: 'short' })}, ${time}`}`
}

