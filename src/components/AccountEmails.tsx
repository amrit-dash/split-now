import { useEffect, useState } from 'react'
import { Loader2, Mail, Plus, X } from 'lucide-react'
import { repo } from '@/data'
import type { EmailCodeResult } from '@/data/repo'
import { CodeInput } from '@/components/CodeInput'
import { useConfirm } from '@/components/ConfirmSheet'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useAccountEmails } from '@/hooks/data'
import { emailProblem, resendIn } from '@/lib/account'
import { errText } from '@/lib/errors'

const RESEND_MS = 30_000

/**
 * Profile → Emails: the account's own email and any others added with a code. Groups that add
 * this person by any of them reach this one account.
 */
export function AccountEmails({ email }: { email?: string }) {
  const added = useAccountEmails()
  const toast = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const remove = async (e: string) => {
    const ok = await confirm({
      title: `Remove ${e}?`,
      message: 'Groups that add you by this email won’t reach this account any more. Groups you’re already in stay.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await repo.removeEmail(e)
      toast('Email removed')
    } catch (err) {
      toast(errText(err), 'err')
    }
  }
  return (
    <div>
      <div className="label">Emails</div>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-slate-50 dark:divide-white/5 dark:bg-ink-800" data-testid="account-emails">
        {email && (
          <li className="flex min-h-12 items-center gap-3 px-4 py-2.5">
            <Mail size={16} className="shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{email}</span>
            <span className="text-muted shrink-0 text-xs">Sign-in</span>
          </li>
        )}
        {added?.map((e) => (
          <li key={e.email} className="flex min-h-12 items-center gap-3 py-1 pl-4 pr-1">
            <Mail size={16} className="shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{e.email}</span>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/60 dark:hover:bg-ink-700"
              aria-label={`Remove ${e.email}`}
              onClick={() => remove(e.email)}
            >
              <X size={18} aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left font-semibold text-brand-700 dark:text-brand-300"
            onClick={() => setOpen(true)}
            data-testid="add-email"
          >
            <Plus size={16} aria-hidden /> Add another email
          </button>
        </li>
      </ul>
      <p className="text-muted mt-1.5 text-xs">Friends may add you by a work or old address. Add it here and those groups reach this account.</p>
      <AddEmailSheet open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

type Step =
  | { kind: 'email' }
  | { kind: 'code'; email: string; demoCode?: string }
  | { kind: 'merge'; email: string; other: NonNullable<EmailCodeResult['otherAccount']> }

/** Add an email: type it, then the 6-digit code sent to it. An address with its own account is merged in, after a confirmation. */
function AddEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<Step>({ kind: 'email' })
  const [input, setInput] = useState('')
  const [tried, setTried] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!open) {
      setStep({ kind: 'email' })
      setInput('')
      setCode('')
      setTried(false)
    }
  }, [open])
  useEffect(() => {
    if (step.kind !== 'code') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step.kind])

  const problem = emailProblem(input)
  const send = async (to: string) => {
    setBusy(true)
    try {
      const r = await repo.sendEmailCode(to, 'add')
      setStep({ kind: 'code', email: to, demoCode: r.demoCode })
      setCode('')
      setSentAt(Date.now())
      setNow(Date.now())
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const check = async (value: string) => {
    if (step.kind !== 'code' || value.length !== 6 || busy) return
    setBusy(true)
    try {
      const r = await repo.confirmEmailCode(step.email, 'add', value)
      if (r.otherAccount) setStep({ kind: 'merge', email: step.email, other: r.otherAccount })
      else {
        toast(
          r.linked
            ? `Email added. ${r.linked === 1 ? 'A group' : `${r.linked} groups`} that added you by it ${r.linked === 1 ? 'is' : 'are'} now in your list`
            : 'Email added',
        )
        onClose()
      }
    } catch (e) {
      setCode('')
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const merge = async () => {
    setBusy(true)
    try {
      const r = await repo.mergeAccount()
      toast(
        r.suggested
          ? `Accounts merged. In ${r.suggested === 1 ? 'one group' : `${r.suggested} groups`} you were in twice: confirm the merge under Members`
          : 'Accounts merged. Everything is in this account now',
      )
      onClose()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const wait = sentAt ? Math.max(0, sentAt + RESEND_MS - now) : 0

  return (
    <Sheet open={open} onClose={onClose} title={step.kind === 'merge' ? 'This email has its own account' : 'Add another email'} testId="add-email-sheet">
      {step.kind === 'email' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (!problem) void send(input.trim().toLowerCase())
          }}
        >
          <label htmlFor="add-email-input" className="label">
            Email
          </label>
          <input
            id="add-email-input"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="you@work.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={tried && !!problem}
            aria-describedby={tried && problem ? 'add-email-error' : 'add-email-help'}
            data-testid="add-email-input"
          />
          {tried && problem ? (
            <p id="add-email-error" className="mt-1.5 px-1 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
              {problem}
            </p>
          ) : (
            <p id="add-email-help" className="text-muted mt-1.5 px-1 text-xs">
              We’ll send a 6-digit code to it.
            </p>
          )}
          <button type="submit" className="btn-primary mt-5 w-full" disabled={busy} data-testid="add-email-send">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Send code
          </button>
        </form>
      )}
      {step.kind === 'code' && (
        <div>
          <p className="text-muted text-sm">
            Enter the code we sent to <b className="[overflow-wrap:anywhere] text-slate-900 dark:text-white">{step.email}</b>. It works for 10 minutes.
          </p>
          {step.demoCode && <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">Demo mode sends no email: the code is {step.demoCode}.</p>}
          <label htmlFor="add-email-code" className="sr-only">
            6-digit code
          </label>
          <div className="mt-5">
            <CodeInput id="add-email-code" autoFocus value={code} onChange={setCode} onComplete={check} disabled={busy} testId="add-email-code" />
          </div>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            disabled={busy || code.length !== 6}
            onClick={() => check(code)}
            data-testid="add-email-confirm"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Add email
          </button>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            <button type="button" className="min-h-11 px-2 text-brand-700 dark:text-brand-300" onClick={() => setStep({ kind: 'email' })}>
              Change email
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-brand-700 disabled:opacity-50 dark:text-brand-300"
              disabled={busy || wait > 0}
              onClick={() => send(step.email)}
            >
              {wait > 0 ? `Send again in ${resendIn(wait)}` : 'Send a new code'}
            </button>
          </div>
        </div>
      )}
      {step.kind === 'merge' && (
        <div>
          <p className="text-sm">
            <b className="[overflow-wrap:anywhere]">{step.email}</b> already signs in to Split Now
            {step.other.name ? ` as ${step.other.name}` : ''}, in {step.other.groups === 1 ? 'one group' : `${step.other.groups} groups`}.
          </p>
          <p className="text-muted mt-2 text-sm">
            Bring it into this account: its groups, Pay me links and tables move here, the email joins this account, and the other account is switched off. Its
            own settings and captured payments stay behind.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={merge} disabled={busy} data-testid="merge-account">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Merge accounts
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
