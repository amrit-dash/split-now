import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { MailIcon, TrashIcon } from '@/components/icons'
import { repo } from '@/data'
import type { AccountDeletionPlan, SignInCheck } from '@/data/repo'
import { useAllGroupData } from '@/hooks/data'
import { blockerLine, CONFIRM_WORD, canDelete, freshSignIn, planSummary, reauthWays, type GroupLite } from '@/lib/account-delete'
import { errText } from '@/lib/errors'
import { useToast } from '@/components/Toast'
import { SectionTitle, SettingsPage } from './common'

/**
 * /settings/delete-account: what deleting the account does to each group (the server's plan),
 * what stops it, and a typed confirmation. Shared groups keep their history under "Deleted
 * account"; wallets and groups nobody else has an account in go with it.
 */
export default function DeleteAccount() {
  const data = useAllGroupData()
  const toast = useToast()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<AccountDeletionPlan | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [signIn, setSignIn] = useState<SignInCheck | null>(null)
  const [linkSent, setLinkSent] = useState(false)
  const [now, setNow] = useState(Date.now)

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, with the address the screen opened on (it may be the emailed link)
  useEffect(() => {
    let live = true
    repo.accountDeletionPlan().then(
      (p) => live && setPlan(p),
      (e) => live && setFailed(errText(e)),
    )
    const check = async () => {
      // Opened from the sign-in link we emailed: sign in again in place, then drop the code from the address.
      if (repo.isReauthLink(window.location.href)) {
        try {
          await repo.finishReauthLink(window.location.href)
          toast('Signed in again. You can delete your account now')
        } catch (e) {
          toast(errText(e, 'That link didn’t work. Send a new one'), 'err')
        }
        navigate('/settings/delete-account', { replace: true })
      }
      const c = await repo.signInCheck()
      if (live) setSignIn(c)
    }
    check().catch((e) => live && setFailed(errText(e)))
    // The 5 minutes run out while the screen is open.
    const tick = setInterval(() => setNow(Date.now()), 15_000)
    return () => {
      live = false
      clearInterval(tick)
    }
  }, [])

  const groups = useMemo(() => {
    const out: Record<string, GroupLite> = {}
    for (const d of data ?? []) out[d.group.id] = { name: d.group.name, currency: d.group.currency }
    return out
  }, [data])
  const summary = plan ? planSummary(plan.steps, groups) : null
  const blocked = !plan || plan.blockers.length > 0 || plan.admin
  const fresh = !!signIn && freshSignIn(signIn.signedInAt, now)

  const reauth = async (way: 'google' | 'email') => {
    setBusy(true)
    try {
      if (way === 'google') {
        await repo.reauthWithGoogle()
        setSignIn(await repo.signInCheck())
        setNow(Date.now())
      } else {
        await repo.sendReauthLink()
        setLinkSent(true)
      }
    } catch (e) {
      toast(errText(e, 'Couldn’t sign you in again'), 'err')
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    setBusy(true)
    try {
      await repo.deleteAccount()
      toast('Your account is deleted')
      navigate('/', { replace: true })
    } catch (e) {
      toast(errText(e, 'Couldn’t delete your account'), 'err')
      setBusy(false)
      // Refused for an old sign-in: show the ways to sign in again.
      repo.signInCheck().then(setSignIn, () => {})
      setNow(Date.now())
    }
  }

  return (
    <SettingsPage title="Delete my account" back="/settings/data">
      <div className="card space-y-2 p-4 text-sm">
        <p>
          This deletes your account and everything kept for it: your profile and photo, capture keys and captured payments, added emails, Pay me links and live
          tables.
        </p>
        <p className="text-muted">
          In groups shared with others, the expenses stay, so their balances still add up. Your name there becomes “Deleted account”. This can’t be undone.
        </p>
      </div>

      {failed ? (
        <div className="card mt-4 p-4 text-sm" role="alert" data-testid="delete-account-failed">
          {failed}
        </div>
      ) : !plan || !summary ? (
        <div className="text-muted mt-6 flex items-center justify-center gap-2 text-sm" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Checking your groups…
        </div>
      ) : (
        <>
          {(plan.blockers.length > 0 || plan.admin) && (
            <>
              <SectionTitle>First, sort these out</SectionTitle>
              <ul className="card space-y-2 p-4 text-sm" data-testid="delete-account-blockers">
                {plan.admin && <li>You’re an admin. Ask another admin to remove your admin access first.</li>}
                {plan.blockers.map((b, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: one group can have several reasons; the list never reorders
                  <li key={`${b.groupId}-${b.reason}-${i}`}>
                    <Link to={`/groups/${b.groupId}`} className="underline underline-offset-2">
                      {blockerLine(b, groups)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionTitle>What happens to your groups</SectionTitle>
          <div className="card space-y-2 p-4 text-sm" data-testid="delete-account-plan">
            {summary.deleted.length + summary.left.length === 0 && <p className="text-muted">You’re not in any groups.</p>}
            {summary.deleted.length > 0 && (
              <p>
                <span className="font-medium">Deleted with your account:</span> {summary.deleted.join(', ')}
              </p>
            )}
            {summary.left.length > 0 && (
              <p>
                <span className="font-medium">You leave:</span> {summary.left.join(', ')}
              </p>
            )}
            {plan.blockers.length > 0 && <p className="text-muted">Once the groups above are sorted out, you leave those too.</p>}
            {summary.handedOver.length > 0 && (
              <p className="text-muted">You made {summary.handedOver.join(', ')}: the next person with an account there takes it over.</p>
            )}
          </div>

          <SectionTitle>Confirm</SectionTitle>
          {!blocked && signIn && !fresh ? (
            <div className="card space-y-3 p-4" data-testid="delete-account-reauth">
              <p className="text-sm font-medium">Confirm it’s you</p>
              <p className="text-muted text-sm">For your safety, deleting needs a sign-in from the last 5 minutes.</p>
              {reauthWays(signIn).map((way) =>
                way === 'google' ? (
                  <button
                    key={way}
                    type="button"
                    className="btn-primary w-full"
                    onClick={() => reauth('google')}
                    disabled={busy}
                    data-testid="delete-reauth-google"
                  >
                    Sign in again with Google
                  </button>
                ) : (
                  <button
                    key={way}
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => reauth('email')}
                    disabled={busy}
                    data-testid="delete-reauth-email"
                  >
                    <MailIcon size={18} aria-hidden /> {linkSent ? 'Send the link again' : 'Email me a sign-in link'}
                  </button>
                ),
              )}
              {linkSent && (
                <p className="text-sm" role="status" data-testid="delete-reauth-sent">
                  Sent to {signIn.email}. Open the link and you’ll come back here, signed in again. If it opens in your browser instead of the app, you can
                  delete your account there.
                </p>
              )}
              {reauthWays(signIn).length === 0 && <p className="text-sm">Sign out, sign in again, and come back here within 5 minutes.</p>}
            </div>
          ) : (
            <div className="card space-y-3 p-4">
              <label htmlFor="delete-confirm" className="label">
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id="delete-confirm"
                className="input w-full"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                data-testid="delete-account-typed"
              />
              <button
                type="button"
                className="btn w-full bg-red-600 text-white disabled:opacity-50"
                onClick={run}
                disabled={busy || !canDelete(plan, typed)}
                data-testid="delete-account-run"
              >
                {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <TrashIcon size={18} aria-hidden />} Delete my account
              </button>
            </div>
          )}
        </>
      )}
    </SettingsPage>
  )
}
