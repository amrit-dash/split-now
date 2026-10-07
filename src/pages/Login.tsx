import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowRight, Sparkles, UserPlus } from 'lucide-react'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'

export default function Login() {
  const toast = useToast()
  // Opened from an invite link? (App keeps the path and returns to it after sign-in.)
  const invite = useLocation().pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1]
  const [mode, setMode] = useState<'in' | 'up'>(invite ? 'up' : 'in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const demo = repo.mode === 'demo'

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast(friendly(e), 'err') } finally { setBusy(false) }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-fuchsia-600/30 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center-safe px-6 pb-12 pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-4">
          <img src="/pwa-192.png" alt="" className="h-16 w-16 shrink-0 rounded-3xl shadow-2xl shadow-brand-600/40 sm:h-20 sm:w-20" />
          <h1 className="whitespace-nowrap text-[clamp(1.5rem,7.4vw,2.25rem)] font-extrabold leading-tight tracking-tight">Split bills,<br />not friendships.</h1>
        </div>
        <p className="mt-3 text-slate-300">Trips, flats and dinners: smart splits, bill scanning and one-tap UPI settle-ups. Beautifully simple.</p>

        {invite && (
          <div className="mt-6 flex gap-3 rounded-2xl bg-white/10 p-4 text-sm text-slate-200 ring-1 ring-white/15" data-testid="invite-banner">
            <UserPlus className="mt-0.5 shrink-0 text-fuchsia-300" size={20} />
            <div>
              <b className="text-white">You’ve been invited to a group.</b> {demo ? 'Enter your name to continue' : 'Continue with Google or email (it takes a few seconds, no app to install)'}, then pick which person you are — you’ll land straight back on the invite.
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {demo ? (
            <>
              <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300 ring-1 ring-white/10">
                <Sparkles className="mb-1 inline text-amber-300" size={16} /> <b className="text-white">Demo mode.</b> Firebase isn’t connected yet, so data stays on this device. Sample groups are pre-loaded.
              </div>
              <input className="input !bg-white/10 !text-white" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => repo.signInDemo!(name.trim() || 'You'))}>
                {invite ? 'Continue to the invite' : 'Start exploring'} <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <>
              <button className="btn w-full bg-white text-slate-900" disabled={busy} onClick={() => run(() => repo.signInWithGoogle())}>
                <GoogleLogo /> Continue with Google
              </button>
              <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-wider text-slate-500"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  run(() => (mode === 'in' ? repo.signInWithEmail(email, password) : repo.signUpWithEmail(name.trim(), email, password)))
                }}
              >
                {mode === 'up' && <input className="input !bg-white/10 !text-white" placeholder="Your name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
                <input className="input !bg-white/10 !text-white" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <input className="input !bg-white/10 !text-white" type="password" placeholder="Password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
                <button className="btn-primary w-full" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
              </form>
              <button className="w-full py-2 text-sm text-slate-400" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </button>
            </>
          )}
          <a href="/t" className="block py-2 text-center text-sm text-slate-400">Splitting a bill at a table? <span className="font-semibold text-white">Enter the code</span></a>
        </div>
      </div>
    </div>
  )
}

function friendly(e: unknown) {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Email or password is incorrect'
  if (code.includes('email-already-in-use')) return 'That email already has an account'
  if (code.includes('popup-closed')) return 'Sign-in cancelled'
  if (code.includes('password-does-not-meet-requirements')) {
    // Firebase lists the unmet rules in brackets, e.g. "[Password must contain an upper case character]".
    const rules = (e as Error).message?.match(/\[(.*)\]/)?.[1]
    return rules ? rules.replace(/, /g, ' · ') : 'Password is too weak'
  }
  if (code.includes('weak-password')) return 'Use at least 6 characters'
  return (e as Error).message ?? 'Something went wrong'
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
