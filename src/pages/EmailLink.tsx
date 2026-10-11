import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleCheck, Loader2, MailX, Users } from 'lucide-react'
import { repo } from '@/data'
import type { EmailLinkResult } from '@/data/repo'
import { PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { emailProblem } from '@/lib/account'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'

type State = { kind: 'working' } | { kind: 'ask' } | { kind: 'done'; r: EmailLinkResult } | { kind: 'failed'; message: string }

/**
 * /email-link: where Firebase's sign-in link lands after Profile → Add another email. The link is
 * finished here (repo.finishEmailLink): the email joins this account, or, when it has its own
 * account, the person can merge that account in. Opened on another phone, it asks which email.
 */
export default function EmailLink() {
  usePageTitle('Add an email')
  const toast = useToast()
  const nav = useNavigate()
  const [state, setState] = useState<State>({ kind: 'working' })
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const href = useRef(window.location.href)
  const ran = useRef(false)

  const finish = async (email?: string) => {
    setState({ kind: 'working' })
    try {
      const r = await repo.finishEmailLink(href.current, email)
      setState(r.needEmail ? { kind: 'ask' } : { kind: 'done', r })
    } catch (e) {
      setState({ kind: 'failed', message: linkError(e) })
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: finish once, with the address the page opened on
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!repo.isEmailLink(href.current)) setState({ kind: 'failed', message: 'This isn’t a link from an email we sent. Add the email again from Profile.' })
    else void finish()
  }, [])

  const merge = async () => {
    setBusy(true)
    try {
      const r = await repo.mergeAccount()
      toast(
        r.suggested
          ? `Accounts merged. In ${r.suggested === 1 ? 'one group' : `${r.suggested} groups`} you were in twice: confirm the merge under Members`
          : 'Accounts merged. Everything is in this account now',
      )
      nav('/profile', { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Add an email" back="/profile" />
      <div className="card p-5" data-testid="email-link">
        {state.kind === 'working' && (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 size={18} className="animate-spin" aria-hidden /> Checking the link…
          </p>
        )}
        {state.kind === 'ask' && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (!emailProblem(typed)) void finish(typed)
            }}
          >
            <p className="text-sm">You opened the link on a different phone or browser. Which email was it for?</p>
            <label htmlFor="email-link-input" className="label mt-4">
              Email
            </label>
            <input
              id="email-link-input"
              className="input"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button type="submit" className="btn-primary mt-4 w-full" disabled={!!emailProblem(typed)}>
              Add this email
            </button>
          </form>
        )}
        {state.kind === 'done' && !state.r.otherAccount && (
          <div className="text-center">
            <CircleCheck size={40} className="pos mx-auto" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">{state.r.already ? 'That email is already yours' : 'Email added'}</h2>
            <p className="text-muted mt-1 text-sm">
              {state.r.linked
                ? `${state.r.linked === 1 ? 'A group' : `${state.r.linked} groups`} that added you by it ${state.r.linked === 1 ? 'is' : 'are'} now in your list.`
                : 'Groups that add you by this email now reach this account.'}
            </p>
            <Link to="/profile" replace className="btn-primary mt-5 w-full">
              Done
            </Link>
          </div>
        )}
        {state.kind === 'done' && state.r.otherAccount && (
          <div>
            <Users size={32} className="text-brand-600 dark:text-brand-300" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">This email has its own account</h2>
            <p className="mt-2 text-sm">
              <b className="[overflow-wrap:anywhere]">{state.r.otherAccount.email}</b> already signs in to Split Now
              {state.r.otherAccount.name ? ` as ${state.r.otherAccount.name}` : ''}, in{' '}
              {state.r.otherAccount.groups === 1 ? 'one group' : `${state.r.otherAccount.groups} groups`}.
            </p>
            <p className="text-muted mt-2 text-sm">
              Bring it into this account: its groups, Pay me links and tables move here, the email joins this account, and the other account is switched off.
              Its own settings and captured payments stay behind.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link to="/profile" replace className="btn-secondary">
                Not now
              </Link>
              <button type="button" className="btn-primary" onClick={merge} disabled={busy} data-testid="merge-account">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Merge accounts
              </button>
            </div>
          </div>
        )}
        {state.kind === 'failed' && (
          <div className="text-center">
            <MailX size={36} className="neg mx-auto" aria-hidden />
            <p className="mt-3 text-sm">{state.message}</p>
            <Link to="/profile" replace className="btn-secondary mt-5 w-full">
              Back to Profile
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

/** Firebase's link errors in plain words; anything else through the shared mapper. */
function linkError(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('invalid-action-code') || code.includes('expired-action-code'))
    return 'That link has expired or was already used. Send a new one from Profile.'
  if (code.includes('invalid-email')) return 'That isn’t the email the link was sent to. Send a new one from Profile.'
  return errText(e)
}
