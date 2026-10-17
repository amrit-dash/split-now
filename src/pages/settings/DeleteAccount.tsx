import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import type { AccountDeletionPlan } from '@/data/repo'
import { useAllGroupData } from '@/hooks/data'
import { blockerLine, CONFIRM_WORD, canDelete, planSummary, type GroupLite } from '@/lib/account-delete'
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

  useEffect(() => {
    let live = true
    repo.accountDeletionPlan().then(
      (p) => live && setPlan(p),
      (e) => live && setFailed(errText(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const groups = useMemo(() => {
    const out: Record<string, GroupLite> = {}
    for (const d of data ?? []) out[d.group.id] = { name: d.group.name, currency: d.group.currency }
    return out
  }, [data])
  const summary = plan ? planSummary(plan.steps, groups) : null

  const run = async () => {
    setBusy(true)
    try {
      await repo.deleteAccount()
      toast('Your account is deleted')
      navigate('/', { replace: true })
    } catch (e) {
      toast(errText(e, 'Couldn’t delete your account'), 'err')
      setBusy(false)
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
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Trash2 size={18} aria-hidden />} Delete my account
            </button>
            <p className="text-muted text-xs">You may be asked to sign in again first.</p>
          </div>
        </>
      )}
    </SettingsPage>
  )
}
