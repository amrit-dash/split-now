import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, Mail, QrCode, UserPlus } from 'lucide-react'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { HintText } from '@/components/Hint'
import { LoginInstallBanner } from '@/components/InstallBanner'
import { useAppConfig } from '@/hooks/useAppConfig'
import { errText } from '@/lib/errors'
import { emailProblem } from '@/lib/account'
import { signupsClosedText, signupsOpen } from '@/lib/flags'
import { applyIconTint } from '@/lib/accent'
import { usePageTitle } from '@/lib/brand'

export default function Login() {
  usePageTitle('Sign in')
  const toast = useToast()
  // Opened from an invite link? (App keeps the path and returns to it after sign-in.)
  const { pathname } = useLocation()
  const nav = useNavigate()
  const invite = pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1]
  // Soft invite-only gate (config/app.signups, readable signed out): without an invite link the form
  // only signs in, whatever was chosen before the config arrived. Hard enforcement needs an Identity
  // Platform blocking function (docs/FIREBASE_SETUP.md).
  const cfg = useAppConfig()
  const canSignUp = signupsOpen(cfg, pathname)
  // Google first; the email form is one tap away and then takes the screen to itself.
  const [withEmail, setWithEmail] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // The address a sign-in link just went to (the "check your inbox" step).
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Opened from a sign-in link: finishing it, or asking which email it was for (another phone).
  const [linkStep, setLinkStep] = useState<'finishing' | 'ask' | null>(null)
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
  /** Finish signing in from the link this page opened with; invite-only sign-ups undo a new account. */
  const finishLink = async (typed?: string) => {
    setLinkStep('finishing')
    try {
      const r = await repo.finishSignInLink!(window.location.href, typed)
      if (r.needEmail) return setLinkStep('ask')
      if (r.isNew && !canSignUp) {
        await repo.deleteNewAccount?.()
        await repo.signOut()
        toast(signupsClosedText(cfg), 'err')
      }
      // Signed in: the app moves past this screen; the link's address is no longer needed.
      nav('/', { replace: true })
    } catch (e) {
      setLinkStep(null)
      toast(friendly(e), 'err')
    }
  }
  const linkChecked = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: finish once, with the address the page opened on
  useEffect(() => {
    if (linkChecked.current || demo || !repo.isSignInLink?.(window.location.href)) return
    linkChecked.current = true
    void finishLink()
  }, [])
  const addingEmail = !demo && pathname === '/email-link'
  const problem = emailProblem(email)
  // The sign-in form is on a dark surface by design (it matches the install splash), so the
  // fields keep their own light-on-dark look rather than the app's input style.
  const field = 'input !bg-white/10 !text-white placeholder:!text-slate-400'

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
        ) : linkStep ? (
          linkStep === 'finishing' ? (
            <p className="flex items-center justify-center gap-2 py-4 text-slate-200" role="status" data-testid="login-finishing">
              <Loader2 size={18} className="animate-spin" aria-hidden /> Signing you in…
            </p>
          ) : (
            <form
              className="space-y-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                setTried(true)
                if (!problem) void finishLink(email.trim())
              }}
            >
              <p className="text-sm text-slate-200">You opened the link on a different phone or browser. Which email was it sent to?</p>
              <label htmlFor="login-link-email" className="sr-only">
                Email
              </label>
              <input
                id="login-link-email"
                className={field}
                type="email"
                inputMode="email"
                placeholder="Email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {tried && problem && (
                <p className="px-1 text-xs font-medium text-rose-300" role="alert">
                  {problem}
                </p>
              )}
              <button type="submit" className="btn-primary w-full">
                Sign in
              </button>
            </form>
          )
        ) : !withEmail ? (
          <>
            {addingEmail && (
              <p className="rounded-2xl bg-white/10 p-4 text-sm text-slate-200 ring-1 ring-white/15" data-testid="login-add-email-note">
                To add that email to your account, sign in as yourself first. The link then finishes on its own.
              </p>
            )}
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
              <Mail size={18} aria-hidden /> Continue with email
            </button>
            {!canSignUp && (
              <p className="min-h-11 py-2 text-center text-sm text-slate-300" data-testid="signups-closed">
                {signupsClosedText(cfg)}
              </p>
            )}
          </>
        ) : sentTo ? (
          <div className="space-y-3" data-testid="login-link-sent">
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
              <p className="font-semibold text-white">Check your inbox</p>
              <p className="mt-1 text-sm text-slate-300">
                We sent a sign-in link to <b className="text-white [overflow-wrap:anywhere]">{sentTo}</b>. Open it on this phone and you’re in. No password
                needed.
              </p>
              <p className="mt-2 text-xs text-slate-400">Can’t find it? Check spam or promotions.</p>
            </div>
            <button
              type="button"
              className="btn w-full bg-white/10 text-white ring-1 ring-white/15"
              disabled={busy}
              onClick={() => run(() => repo.sendSignInLink!(sentTo))}
            >
              Send the link again
            </button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-1.5 py-2 text-sm text-slate-300"
              onClick={() => {
                setSentTo(null)
                setTried(false)
              }}
            >
              <ChevronLeft size={16} aria-hidden /> Use a different email
            </button>
          </div>
        ) : (
          <>
            <form
              className="space-y-3"
              aria-label="Sign in with email"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                setTried(true)
                if (problem) return
                const to = email.trim().toLowerCase()
                void run(async () => {
                  await repo.sendSignInLink!(to)
                  setSentTo(to)
                })
              }}
            >
              <div>
                <label htmlFor="login-email" className="sr-only">
                  Email
                </label>
                <input
                  id="login-email"
                  className={field}
                  type="email"
                  inputMode="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  aria-invalid={tried && !!problem}
                  aria-describedby={tried && problem ? 'login-email-error' : 'login-email-help'}
                />
                {tried && problem ? (
                  <p id="login-email-error" className="mt-1.5 px-1 text-xs font-medium text-rose-300" role="alert">
                    {problem}
                  </p>
                ) : (
                  <p id="login-email-help" className="mt-1.5 px-1 text-xs text-slate-400">
                    We’ll email you a link that signs you in, or makes your account the first time. No password.
                  </p>
                )}
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="login-submit">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Email me a sign-in link
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
      {/* Install before signing in, so it's once (an iPhone's Home Screen app has its own sign-in). */}
      <LoginInstallBanner />
    </AuthShell>
  )
}

/** The dark sign-in surface (it matches the install splash), shared with the email code screen. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ink-950 text-white">
      {/* The two glows are radial gradients, not blurred circles: Safari (and the installed app on a Mac) cuts a large
          filter: blur() at its tile edges, which showed as a hard dark rectangle across the glow. */}
      <div
        className="pointer-events-none absolute -left-[13rem] -top-[13rem] h-[36rem] w-[36rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand-600)_40%,transparent),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-[15rem] -right-[11rem] h-[36rem] w-[36rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-duo-600)_30%,transparent),transparent)]"
        aria-hidden
      />
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
  if (code.includes('invalid-action-code') || code.includes('expired-action-code')) return 'That sign-in link has expired or was already used. Send a new one'
  if (code.includes('invalid-email')) return 'That isn’t the email the link was sent to'
  if (code.includes('operation-not-allowed')) return 'Signing in with email isn’t switched on yet. Use Continue with Google'
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many links sent. Wait a few minutes, then try again'
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
