import { useId, useState } from 'react'
import { Camera, Check, ChevronDown, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { refreshRates, ratesFetchedAt } from '@/lib/fx'
import { appLocale } from '@/lib/locale'
import { Avatar } from './Avatar'
import { useToast } from './Toast'

/**
 * The user card at the top of Profile: photo, name and email; tap to expand and edit the name,
 * mobile number and sign-in methods (link Google / add a password so one email = one account).
 */
export function AccountCard({ name, setName, phone, setPhone, photoURL, email, onPhoto }: {
  name: string
  setName: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  photoURL?: string
  email?: string
  onPhoto: () => void
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
            <p className="mt-1 text-xs text-slate-500">Also used for UPI apps if you haven’t set a UPI phone number.</p>
          </div>
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

/** Beside the currency picker: when exchange rates were last fetched, tap to refresh them. */
export function RatesButton({ base }: { base: string }) {
  const toast = useToast()
  const [at, setAt] = useState<number | null>(() => ratesFetchedAt(base))
  const [busy, setBusy] = useState(false)
  const [shownFor, setShownFor] = useState(base)
  if (shownFor !== base) { setShownFor(base); setAt(ratesFetchedAt(base)) }

  const refresh = async () => {
    setBusy(true)
    const r = await refreshRates(base)
    setBusy(false)
    if (!r) return toast(navigator.onLine ? 'Couldn’t reach the rates service' : 'You’re offline', 'err')
    setAt(r.at)
    toast(`Rates updated · ECB ${new Date(r.date + 'T00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })}`)
  }

  const when = at ? relative(at) : 'Not fetched yet'
  return (
    <div className="min-w-0">
      <div className="label">Exchange rates</div>
      <button type="button" onClick={refresh} disabled={busy} className="input flex items-center gap-2 !pr-3.5 text-left disabled:opacity-70" aria-label={`Refresh exchange rates. ${when}`}>
        <span className="min-w-0 flex-1 truncate text-sm">{busy ? 'Updating…' : when}</span>
        <RefreshCw size={16} className={`shrink-0 text-brand-600 dark:text-brand-300 ${busy ? 'animate-spin' : ''}`} aria-hidden />
      </button>
    </div>
  )
}

function relative(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `Updated ${h} h ago`
  return `Updated ${new Date(at).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })}`
}
