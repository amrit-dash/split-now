import { useEffect, useState } from 'react'
import { Loader2, Mail, Plus, X } from 'lucide-react'
import { repo } from '@/data'
import { useConfirm } from '@/components/ConfirmSheet'
import { HintText, InfoTip, type Hint } from '@/components/Hint'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useAccountEmails } from '@/hooks/data'
import { emailProblem, resendIn } from '@/lib/account'
import { errText } from '@/lib/errors'

const RESEND_MS = 30_000

const EMAILS_HINT: Hint = {
  full: 'Friends may add you by a work or old address. Add it so those groups reach you here.',
  short: 'Other addresses friends might use',
  tier: 'help',
}
const ADD_HINT: Hint = { full: 'We email it a link. Opening it adds the address to your account.', short: 'We email it a link to confirm', tier: 'help' }
const SPAM_HINT: Hint = {
  full: 'Can’t find it? Check spam or promotions. It comes from Split Now’s Firebase address.',
  short: 'Can’t find it? Check spam',
  tier: 'help',
}

/**
 * Profile → Emails: the account's own email and any others added with Firebase's sign-in link. Groups that add
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
      <div className="label flex items-center">
        Emails
        <InfoTip hint={EMAILS_HINT} label="About emails" />
      </div>
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
      <HintText hint={EMAILS_HINT} className="text-muted mt-1.5 text-xs" />
      <AddEmailSheet open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/** Add an email: type it; Firebase sends its sign-in link there, and opening the link (EmailLink) adds it. */
function AddEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!open) {
      setSentTo(null)
      setInput('')
      setTried(false)
    }
  }, [open])
  useEffect(() => {
    if (!sentTo) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sentTo])

  const problem = emailProblem(input)
  const send = async (to: string) => {
    setBusy(true)
    try {
      const r = await repo.sendEmailLink(to)
      if (r.added) {
        toast('Email added')
        onClose()
        return
      }
      setSentTo(to)
      setSentAt(Date.now())
      setNow(Date.now())
    } catch (e) {
      toast(sendError(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const wait = sentAt ? Math.max(0, sentAt + RESEND_MS - now) : 0

  return (
    <Sheet open={open} onClose={onClose} title={sentTo ? 'Check that inbox' : 'Add another email'} testId="add-email-sheet">
      {!sentTo ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (!problem) void send(input.trim().toLowerCase())
          }}
        >
          <div className="label flex items-center">
            <label htmlFor="add-email-input">Email</label>
            <InfoTip hint={ADD_HINT} label="About adding an email" />
          </div>
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
            aria-describedby={tried && problem ? 'add-email-error' : undefined}
            data-testid="add-email-input"
          />
          {tried && problem ? (
            <p id="add-email-error" className="mt-1.5 px-1 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
              {problem}
            </p>
          ) : (
            <HintText hint={ADD_HINT} id="add-email-help" className="text-muted mt-1.5 px-1 text-xs" />
          )}
          <button type="submit" className="btn-primary mt-5 w-full" disabled={busy} data-testid="add-email-send">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Send link
          </button>
        </form>
      ) : (
        <div>
          <p className="text-sm">
            We sent a link to <b className="[overflow-wrap:anywhere]">{sentTo}</b>. Open it on this phone and the email joins your account.
          </p>
          <HintText hint={SPAM_HINT} className="text-muted mt-2 text-sm" />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" disabled={busy || wait > 0} onClick={() => send(sentTo)}>
              {wait > 0 ? `Again in ${resendIn(wait)}` : 'Send again'}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Firebase's send errors in plain words. */
function sendError(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('operation-not-allowed')) return 'Adding emails isn’t switched on yet'
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many links sent. Try again later'
  if (code.includes('invalid-email')) return 'That doesn’t look like an email address'
  return errText(e)
}
