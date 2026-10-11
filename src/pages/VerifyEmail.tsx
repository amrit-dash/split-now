import { useCallback, useEffect, useRef, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { repo } from '@/data'
import { CodeInput } from '@/components/CodeInput'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/hooks/auth'
import { resendIn } from '@/lib/account'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { AuthShell } from './Login'

const RESEND_MS = 30_000
// One automatic send per account per tab: a reload doesn't send another code.
const SENT_KEY = 'splitit-code-sent'

/**
 * An email-and-password account confirms its email before anything else: a 6-digit code is
 * emailed and typed (or pasted) here. When the project has no email service set up, Firebase's
 * verification link is sent instead and "I've opened the link" checks it.
 */
export default function VerifyEmail() {
  usePageTitle('Confirm your email')
  const { user } = useAuth()
  const toast = useToast()
  const email = user?.email ?? ''
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'sending' | 'code' | 'link'>('sending')
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [demoCode, setDemoCode] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!sentAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sentAt])

  const send = useCallback(async () => {
    setBusy(true)
    try {
      const r = await repo.sendEmailCode(email, 'verify')
      if (r.sent) {
        setMode('code')
        setDemoCode(r.demoCode ?? '')
      } else {
        await repo.sendVerifyLink?.()
        setMode('link')
      }
      setSentAt(Date.now())
      setNow(Date.now())
    } catch (e) {
      setMode((m) => (m === 'sending' ? 'code' : m))
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }, [email, toast])

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
    if (already) setMode('code')
    else void send()
  }, [email, user?.uid, send])

  const confirm = async (value: string) => {
    if (value.length !== 6 || busy) return
    setBusy(true)
    try {
      const r = await repo.confirmEmailCode(email, 'verify', value)
      if (r.linked) toast(r.linked === 1 ? 'A group was waiting for you. It’s in your list' : `${r.linked} groups were waiting for you. They’re in your list`)
    } catch (e) {
      setCode('')
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const checkLink = async () => {
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
      {mode === 'link' ? (
        <>
          <p className="mt-3 text-slate-300">
            We sent a link to <b className="[overflow-wrap:anywhere] text-white">{email}</b>. Open it, then come back here.
          </p>
          <button type="button" className="btn-primary mt-8 w-full" disabled={busy} onClick={checkLink} data-testid="verify-link-done">
            I’ve opened the link
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-slate-300">
            {mode === 'sending' ? 'Sending a 6-digit code to ' : 'Enter the 6-digit code we sent to '}
            <b className="[overflow-wrap:anywhere] text-white">{email}</b>. It works for 10 minutes.
          </p>
          {demoCode && <p className="mt-2 text-sm text-duo-300">Demo mode sends no email: the code is {demoCode}.</p>}
          <label htmlFor="verify-code" className="sr-only">
            6-digit code
          </label>
          <div className="mt-8">
            <CodeInput
              id="verify-code"
              dark
              autoFocus
              value={code}
              onChange={setCode}
              onComplete={confirm}
              disabled={busy || mode === 'sending'}
              testId="verify-code"
            />
          </div>
          <button
            type="button"
            className="btn-primary mt-6 w-full"
            disabled={busy || code.length !== 6}
            onClick={() => confirm(code)}
            data-testid="verify-submit"
          >
            Confirm
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Can’t find it? Check spam or promotions.</p>
        </>
      )}
      <div className="mt-4 flex flex-col items-center gap-1 text-sm">
        <button
          type="button"
          className="min-h-11 px-3 text-slate-300 disabled:opacity-50"
          disabled={busy || wait > 0}
          onClick={send}
          data-testid="verify-resend"
        >
          {wait > 0 ? `Send again in ${resendIn(wait)}` : mode === 'link' ? 'Send the link again' : 'Send a new code'}
        </button>
        <button type="button" className="min-h-11 px-3 text-slate-400" onClick={() => repo.signOut()}>
          Use a different email
        </button>
      </div>
    </AuthShell>
  )
}
