import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, Eye, EyeOff, Mail, QrCode, UserPlus } from 'lucide-react'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { HintText } from '@/components/Hint'
import { useAppConfig } from '@/hooks/useAppConfig'
import { errText } from '@/lib/errors'
import { emailProblem, passwordProblem } from '@/lib/account'
import { signupsClosedText, signupsOpen } from '@/lib/flags'
import { applyIconTint } from '@/lib/accent'
import { usePageTitle } from '@/lib/brand'

export default function Login() {
  usePageTitle('Sign in')
  const toast = useToast()
  // Opened from an invite link? (App keeps the path and returns to it after sign-in.)
  const { pathname } = useLocation()
  const invite = pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1]
  // Soft invite-only gate (config/app.signups, readable signed out): without an invite link the form
  // only signs in, whatever was chosen before the config arrived. Hard enforcement needs an Identity
  // Platform blocking function (docs/FIREBASE_SETUP.md).
  const cfg = useAppConfig()
  const canSignUp = signupsOpen(cfg, pathname)
  const [chosen, setChosen] = useState<'in' | 'up'>(invite ? 'up' : 'in')
  const mode: 'in' | 'up' = canSignUp ? chosen : 'in'
  // Google first; the email form is one tap away and then takes the screen to itself.
  const [withEmail, setWithEmail] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Field problems show once someone has tried to submit (not while they're still typing).
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const demo = repo.mode === 'demo'
  useEffect(() => {
    void applyIconTint()
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(friendly(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const problems = {
    name: mode === 'up' && !name.trim() ? 'Enter your name' : '',
    email: emailProblem(email),
    password: mode === 'up' ? passwordProblem(password) : password ? '' : 'Enter your password',
  }
  const valid = !problems.name && !problems.email && !problems.password
  // The sign-in form is on a dark surface by design (it matches the install splash), so the
  // fields keep their own light-on-dark look rather than the app's input style.
  const field = 'input !bg-white/10 !text-white placeholder:!text-slate-400'
  const fieldError = (id: string, problem: string) =>
    tried && problem ? (
      <p id={`${id}-error`} className="mt-1.5 px-1 text-xs font-medium text-rose-300" role="alert">
        {problem}
      </p>
    ) : null

  return (
    <AuthShell>
      <div className="flex items-center gap-4">
        <img src="/pwa-192.png" alt="" width={80} height={80} className="h-16 w-16 shrink-0 rounded-3xl shadow-2xl shadow-brand-600/40 sm:h-20 sm:w-20" />
        <h1 className="text-[clamp(1.5rem,7.4vw,2.25rem)] font-extrabold leading-tight tracking-tight">Split bills, not friendships.</h1>
      </div>
      <p className="mt-4 text-sm font-semibold tracking-wide text-duo-300" data-testid="tagline">
        Spending is wise, splitting is free. Split Now!
      </p>
      <HintText
        className="mt-2 text-slate-300"
        hint={{
          full: 'Trips, flats and dinners: fair splits, bill scanning and one-tap UPI settle-ups.',
          short: 'Fair splits and one-tap UPI settle-ups.',
          tier: 'help',
        }}
      />

      {invite && (
        <div className="mt-6 flex gap-3 rounded-2xl bg-white/10 p-4 text-sm text-slate-200 ring-1 ring-white/15" data-testid="invite-banner">
          <UserPlus className="mt-0.5 shrink-0 text-duo-300" size={20} aria-hidden />
          <div>
            <b className="text-white">You’ve been invited to a group.</b>{' '}
            {demo ? 'Enter your name to continue' : 'Continue with Google or email (it takes a few seconds, no app to install)'}, then pick which person you
            are. You’ll land straight back on the invite.
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {demo ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => repo.signInDemo!(name.trim() || 'You'))
            }}
          >
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300 ring-1 ring-white/10">
              <b className="text-white">Demo mode.</b> Firebase isn’t connected yet, so data stays on this device. Sample groups are pre-loaded.
            </div>
            <label htmlFor="demo-name" className="sr-only">
              Your name
            </label>
            <input
              id="demo-name"
              className={field}
              placeholder="Your name"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="go"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="demo-name"
            />
            <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="demo-start">
              {invite ? 'Continue to the invite' : 'Start exploring'}
            </button>
          </form>
        ) : !withEmail ? (
          <>
            <button
              type="button"
              className="btn min-h-14 w-full bg-white text-base text-slate-900 shadow-lg shadow-black/20"
              disabled={busy}
              onClick={() => run(() => repo.signInWithGoogle())}
              data-testid="login-google"
            >
              <GoogleLogo /> Continue with Google
            </button>
            <button
              type="button"
              className="btn w-full bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"
              disabled={busy}
              onClick={() => setWithEmail(true)}
              data-testid="login-email"
            >
              <Mail size={18} aria-hidden /> {canSignUp && invite ? 'Sign up with email' : 'Continue with email'}
            </button>
            {!canSignUp && (
              <p className="min-h-11 py-2 text-center text-sm text-slate-300" data-testid="signups-closed">
                {signupsClosedText(cfg)}
              </p>
            )}
          </>
        ) : (
          <>
            {canSignUp && (
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1" role="radiogroup" aria-label="Sign in or create an account">
                {(['in', 'up'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    className={`min-h-11 rounded-xl text-sm font-semibold transition ${mode === m ? 'bg-white text-slate-900' : 'text-slate-300'}`}
                    onClick={() => {
                      setChosen(m)
                      setTried(false)
                    }}
                  >
                    {m === 'in' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
            )}
            <form
              className="space-y-3"
              aria-label={mode === 'in' ? 'Sign in with email' : 'Create an account'}
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                setTried(true)
                if (!valid) return
                run(() => (mode === 'in' ? repo.signInWithEmail(email.trim(), password) : repo.signUpWithEmail(name.trim(), email.trim(), password)))
              }}
            >
              {mode === 'up' && (
                <div>
                  <label htmlFor="login-name" className="sr-only">
                    Your name
                  </label>
                  <input
                    id="login-name"
                    className={field}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={tried && !!problems.name}
                    aria-describedby={tried && problems.name ? 'login-name-error' : undefined}
                  />
                  {fieldError('login-name', problems.name)}
                </div>
              )}
              <div>
                <label htmlFor="login-email" className="sr-only">
                  Email
                </label>
                <input
                  id="login-email"
                  className={field}
                  type="email"
                  inputMode="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  aria-invalid={tried && !!problems.email}
                  aria-describedby={tried && problems.email ? 'login-email-error' : undefined}
                />
                {fieldError('login-email', problems.email)}
              </div>
              <div>
                <label htmlFor="login-password" className="sr-only">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    className={`${field} pr-14`}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={mode === 'up' ? 'New password' : 'Password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                    enterKeyHint="go"
                    aria-invalid={tried && !!problems.password}
                    aria-describedby={tried && problems.password ? 'login-password-error' : mode === 'up' ? 'login-password-help' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
                {fieldError('login-password', problems.password) ??
                  (mode === 'up' && (
                    // Key: it heads off the "too weak" error, and the field's aria-describedby points at it.
                    <HintText
                      id="login-password-help"
                      className="mt-1.5 px-1 text-xs text-slate-400"
                      hint={{ full: 'At least 8 characters, with letters and numbers.', tier: 'key' }}
                    />
                  ))}
              </div>
              {mode === 'up' && (
                <HintText className="px-1 text-xs text-slate-400" hint={{ full: 'We’ll email you a link to confirm the address.', tier: 'help' }} />
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="login-submit">
                {mode === 'in' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            {!canSignUp && (
              <p className="py-1 text-center text-sm text-slate-300" data-testid="signups-closed">
                {signupsClosedText(cfg)}
              </p>
            )}
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-1.5 py-2 text-sm text-slate-300"
              onClick={() => {
                setWithEmail(false)
                setTried(false)
              }}
            >
              <ChevronLeft size={16} aria-hidden /> Other ways to sign in
            </button>
          </>
        )}
        {/* A different job from signing in (no account needed), so it sits apart, as an outline button. */}
        {cfg.flags.liveTables !== false && (
          <div className="pt-4">
            <div className="flex items-center gap-3 pb-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-white/10" aria-hidden />
              Splitting a bill at a table?
              <span className="h-px flex-1 bg-white/10" aria-hidden />
            </div>
            <a
              href="/t"
              className="btn w-full bg-transparent text-white ring-1 ring-inset ring-white/30 hover:bg-white/5 active:bg-white/10"
              data-testid="login-table"
            >
              <QrCode size={18} className="text-duo-300" aria-hidden /> Join a live table with its code
            </a>
          </div>
        )}
      </div>
    </AuthShell>
  )
}

/** The dark sign-in surface (it matches the install splash), shared with the email code screen. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-duo-600/30 blur-3xl" aria-hidden />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center-safe px-6 pb-12 pt-[max(3rem,env(safe-area-inset-top))]">
        {children}
      </main>
    </div>
  )
}

/** Sign-in errors in plain words; anything else goes through the shared mapper. */
function friendly(e: unknown) {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Email or password is incorrect'
  if (code.includes('email-already-in-use'))
    return 'That email already has an account. Sign in instead, or use Continue with Google if you signed up with Google'
  if (code.includes('account-exists-with-different-credential'))
    return 'This email is already registered with another sign-in method. Sign in that way, then link Google from Profile'
  if (code.includes('popup-closed')) return 'Sign-in cancelled'
  if (code.includes('password-does-not-meet-requirements')) {
    // Firebase lists the unmet rules in brackets, e.g. "[Password must contain an upper case character]".
    const rules = (e as Error).message?.match(/\[(.*)\]/)?.[1]
    return rules ? rules.replace(/, /g, ' · ') : 'Password is too weak'
  }
  if (code.includes('weak-password')) return 'Use at least 8 characters, with letters and numbers'
  if (code.includes('too-many-requests')) return 'Too many tries. Wait a minute and try again'
  return errText(e)
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
