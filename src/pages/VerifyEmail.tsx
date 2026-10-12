import { useCallback, useEffect, useRef, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { HintText } from '@/components/Hint'
import { useAuth } from '@/hooks/auth'
import { resendIn } from '@/lib/account'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { AuthShell } from './Login'

const RESEND_MS = 60_000
// One automatic send per account per tab: a reload doesn't send another link.
const SENT_KEY = 'splitit-verify-sent'
// While the screen is open, check now and then whether the link was opened (on this or another device).
const POLL_MS = 5_000

/**
 * An email-and-password account confirms its email before anything else, with Firebase's own
 * verification link. The screen moves on by itself once the link was opened: it checks when the
 * app comes back to the front and every few seconds.
 */
export default function VerifyEmail() {
  usePageTitle('Confirm your email')
  const { user } = useAuth()
  const toast = useToast()
  const email = user?.email ?? ''
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const started = useRef(false)

  const send = useCallback(async () => {
    setBusy(true)
    try {
      await repo.sendVerifyLink?.()
      setSentAt(Date.now())
      setNow(Date.now())
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      toast(code.includes('too-many-requests') ? 'Too many links sent. Wait a few minutes, then try again' : errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }, [toast])

  useEffect(() => {
    if (started.current || !email) return
    started.current = true
    const key = `${SENT_KEY}:${user?.uid}`
    let already = false
    try {
      already = !!sessionStorage.getItem(key)
      sessionStorage.setItem(key, '1')
    } catch {
      /* storage unavailable: send */
    }
    if (!already) void send()
  }, [email, user?.uid, send])

  // Opened the link? The account reloads and the app moves past this screen on its own.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') repo.refreshUser?.().catch(() => undefined)
    }
    const t = setInterval(() => {
      setNow(Date.now())
      check()
    }, POLL_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  const checkNow = async () => {
    setBusy(true)
    try {
      await repo.refreshUser?.()
      toast('Not confirmed yet. Open the link in the email, then try again', 'err')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const wait = sentAt ? Math.max(0, sentAt + RESEND_MS - now) : 0

  return (
    <AuthShell>
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/15">
        <MailCheck size={30} className="text-duo-300" aria-hidden />
      </div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Confirm your email</h1>
      <p className="mt-3 text-slate-300">
        We sent a link to <b className="text-white [overflow-wrap:anywhere]">{email}</b>. Open it and this screen moves on by itself.
      </p>
      <HintText
        className="mt-2 text-sm text-slate-400"
        hint={{
          full: 'Can’t find it? Check spam or promotions. It comes from Split Now’s Firebase address.',
          short: 'Can’t find it? Check spam or promotions.',
          tier: 'help',
        }}
      />
      <button type="button" className="btn-primary mt-8 w-full" disabled={busy} onClick={checkNow} data-testid="verify-link-done">
        I’ve opened the link
      </button>
      <div className="mt-4 flex flex-col items-center gap-1 text-sm">
        <button
          type="button"
          className="min-h-11 px-3 text-slate-300 disabled:opacity-50"
          disabled={busy || wait > 0}
          onClick={send}
          data-testid="verify-resend"
        >
          {wait > 0 ? `Send again in ${resendIn(wait)}` : 'Send the link again'}
        </button>
        <button type="button" className="min-h-11 px-3 text-slate-400" onClick={() => repo.signOut()}>
          Use a different email
        </button>
      </div>
    </AuthShell>
  )
}
