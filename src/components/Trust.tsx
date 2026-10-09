import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Flag } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useHistory, useTrash } from '@/hooks/data'
import type { ActivityEntry, Expense, Group, Settlement } from '@/types'
import { activityHref, activityIcon, activityText, amountLabel, describeChanges, fmtAgo, isExpenseEntry, type ActivityCtx } from '@/lib/activity'
import { canPurge, daysLeftInTrash, flagsOf, isPending, pendingApprovers, thresholdOf } from '@/lib/trust'
import { formatMoney } from '@/lib/money'
import { CATEGORIES } from '@/lib/categories'
import { errText } from '@/lib/errors'
import { Sheet } from './Sheet'
import { useConfirm } from './ConfirmSheet'
import { useToast } from './Toast'
import { SwipeRow } from './SwipeRow'

const memberNameFor = (g: Group, uid: string) => (id: string) => (g.members[id]?.uid === uid ? 'you' : (g.members[id]?.name ?? 'Former member'))

/** Small "Flagged" / "Needs OK" pills for expense rows. The icon carries the state, so it stays. */
export function TrustBadges({ e, group }: { e: Expense; group: Group }) {
  const flags = flagsOf(e).length
  const pending = isPending(e, group)
  if (!flags && !pending) return null
  return (
    <>
      {flags > 0 && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          title="Someone flagged this expense"
        >
          <Flag size={10} strokeWidth={3} aria-hidden />
          Flagged
        </span>
      )}
      {pending && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
          title="Not counted until approved"
        >
          <Clock size={10} strokeWidth={3} aria-hidden />
          Needs OK
        </span>
      )}
    </>
  )
}

/** Delete with a ~6 s "Undo" toast instead of a confirm dialog (the item goes to the trash). */
export function useUndoableDelete() {
  const toast = useToast()
  const fail = (err: unknown) => toast(errText(err), 'err')
  return {
    expense(groupId: string, e: Pick<Expense, 'id' | 'description'>) {
      repo
        .deleteExpense(groupId, e.id)
        .then(() =>
          toast(`Deleted “${e.description}”`, 'ok', {
            action: {
              label: 'Undo',
              run: () => {
                repo
                  .restoreExpense(groupId, e.id)
                  .then(() => toast('Restored'))
                  .catch(fail)
              },
            },
          }),
        )
        .catch(fail)
    },
    settlement(groupId: string, s: Pick<Settlement, 'id'>) {
      repo
        .deleteSettlement(groupId, s.id)
        .then(() =>
          toast('Payment deleted', 'ok', {
            action: {
              label: 'Undo',
              run: () => {
                repo
                  .restoreSettlement(groupId, s.id)
                  .then(() => toast('Restored'))
                  .catch(fail)
              },
            },
          }),
        )
        .catch(fail)
    },
  }
}

/**
 * Activity rows. Pass `groups` to show which group each entry is from (cross-group feed); there,
 * entries that aren't about one expense (an import, a payment, a member) open their group.
 */
export function ActivityFeed({
  entries,
  groups,
  linkable,
  isNew,
}: {
  entries: ActivityEntry[]
  groups?: Record<string, Group>
  /** expense entries whose expense can be opened (default: all) */
  linkable?: (a: ActivityEntry) => boolean
  /** unread entries get a dot */
  isNew?: (a: ActivityEntry) => boolean
}) {
  const { user } = useMe()
  return (
    <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
      {entries.map((a) => {
        const g = groups?.[a.groupId]
        const inner = (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg dark:bg-ink-800" aria-hidden>
              {activityIcon(a.type)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm">{activityText(a, user.uid)}</div>
              <div className="text-muted truncate text-xs">
                {g ? (
                  <>
                    <span aria-hidden>{g.emoji} </span>
                    {g.name} ·{' '}
                  </>
                ) : (
                  ''
                )}
                {fmtAgo(a.createdAt)}
              </div>
            </div>
            {isNew?.(a) && (
              <>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <span className="sr-only">New</span>
              </>
            )}
          </>
        )
        // An import summary's targetId is the group, not an expense: it (like payments and
        // membership changes) opens the group, and only in a cross-group feed.
        const canLink = isExpenseEntry(a) ? (linkable ? linkable(a) : true) : !!g
        return (
          <li key={a.id}>
            {canLink ? (
              <Link to={activityHref(a)} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-ink-800">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** "History" card on an expense: who changed what, oldest change last. */
export function HistoryCard({ group, expense }: { group: Group; expense: Expense }) {
  const { user } = useMe()
  const history = useHistory(group.id, expense.id)
  if (!history?.length) return null
  const ctx = { currency: group.currency, memberName: memberNameFor(group, user.uid), original: expense.original } as Pick<
    ActivityCtx,
    'currency' | 'memberName'
  >
  return (
    <div className="card mt-3 p-4">
      <div className="label">History</div>
      <ol className="space-y-3">
        {history.map((a) => {
          const who = a.actorUid === user.uid ? 'You' : a.actorName
          const lines = a.type === 'expense.updated' ? describeChanges(a.before, a.after, ctx) : []
          return (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <span className="mt-0.5 text-base leading-none" aria-hidden>
                {activityIcon(a.type)}
              </span>
              <div className="min-w-0 flex-1">
                {lines.length ? (
                  <>
                    <div>
                      <b>{who}</b> {lines.length === 1 ? `changed ${lines[0]}` : 'changed:'}
                    </div>
                    {lines.length > 1 && (
                      <ul className="mt-0.5 list-disc pl-5 text-slate-600 dark:text-slate-300">
                        {lines.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div>{activityText(a, user.uid)}</div>
                )}
                <div className="text-muted text-xs">{fmtAgo(a.createdAt)}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Flags, approvals and the flag/approve actions on the expense detail screen. */
export function TrustPanel({ group, expense: e, myMemberId }: { group: Group; expense: Expense; myMemberId?: string }) {
  const { user } = useMe()
  const toast = useToast()
  const [flagging, setFlagging] = useState(false)
  const [reason, setReason] = useState('')
  const flags = flagsOf(e)
  const mine = e.dispute?.[user.uid]
  const involved = !!myMemberId && (myMemberId in e.splits || myMemberId in e.paidBy)
  const waiting = pendingApprovers(e, group)
  const iMustApprove = waiting.some((id) => group.members[id]?.uid === user.uid)
  const name = (id: string) => (group.members[id]?.uid === user.uid ? 'you' : (group.members[id]?.name ?? 'Former member'))
  const cur = group.currency
  const fail = (err: unknown) => toast(errText(err), 'err')

  const submitFlag = async () => {
    try {
      await repo.flagExpense(group, e, reason)
      setFlagging(false)
      setReason('')
      toast('Flagged. Everyone in the group can see it.')
    } catch (err) {
      fail(err)
    }
  }

  return (
    <>
      {waiting.length > 0 && (
        <div className="card mt-3 border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-500/20 dark:bg-sky-500/5">
          <div className="flex items-start gap-3">
            <Clock size={20} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">Needs your OK · not counted in balances yet</div>
              <div className="text-slate-600 dark:text-slate-300">
                Over {formatMoney(thresholdOf(group), cur)}: needs an OK from {waiting.map(name).join(', ')}.
              </div>
            </div>
          </div>
          {iMustApprove && (
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              onClick={() =>
                repo
                  .approveExpense(group, e)
                  .then(() => toast('Approved'))
                  .catch(fail)
              }
            >
              Approve {formatMoney(e.splits[myMemberId!] ?? 0, cur)} share
            </button>
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div className="card mt-3 border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Flag size={16} className="text-amber-700 dark:text-amber-300" aria-hidden /> Flagged · still counted in balances
          </div>
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.byUid} className="text-sm">
                <b>{f.byUid === user.uid ? 'You' : (group.members[f.memberId]?.name ?? 'Someone')}</b>: {f.reason}
                <span className="text-muted ml-1 text-xs">{fmtAgo(f.at)}</span>
              </li>
            ))}
          </ul>
          {mine && (
            <button
              type="button"
              className="chip mt-3 min-h-10"
              onClick={() =>
                repo
                  .resolveFlag(group, e)
                  .then(() => toast('Flag resolved'))
                  .catch(fail)
              }
            >
              Resolve my flag
            </button>
          )}
        </div>
      )}

      {involved && !mine && !e.deletedAt && (
        <button type="button" className="btn mt-3 w-full text-amber-700 dark:text-amber-300" onClick={() => setFlagging(true)}>
          Flag a problem
        </button>
      )}

      <Sheet open={flagging} onClose={() => setFlagging(false)} title="Flag this expense">
        <p className="text-muted text-sm">Tell the group what looks wrong. It stays in the balances (marked as flagged) until you resolve it.</p>
        <textarea
          className="input mt-3 min-h-24"
          maxLength={500}
          autoFocus
          placeholder="e.g. I wasn’t at this dinner"
          aria-label="Reason"
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
        />
        <button type="button" className="btn-primary mt-3 w-full" disabled={!reason.trim()} onClick={submitFlag}>
          Flag expense
        </button>
      </Sheet>
    </>
  )
}

/** Banner on a trashed expense: restore, or delete forever. */
export function TrashedBanner({ group, item, kind }: { group: Group; item: Expense; kind: 'expense' }) {
  const { user } = useMe()
  const toast = useToast()
  const confirm = useConfirm()
  const fail = (err: unknown) => toast(errText(err), 'err')
  const by = Object.values(group.members).find((m) => m.uid === item.deletedBy)
  const purge = async () => {
    if (!(await confirm({ title: 'Delete forever?', message: 'Its comments go too. This cannot be undone.', confirmLabel: 'Delete forever', tone: 'danger' })))
      return
    repo.purgeExpense(group.id, item.id).catch(fail)
  }
  return (
    <div className="card mb-3 border border-rose-200 bg-rose-50/60 p-4 text-sm dark:border-rose-500/20 dark:bg-rose-500/5">
      <div className="font-semibold">In Recently deleted</div>
      <div className="text-slate-600 dark:text-slate-300">
        Deleted by {item.deletedBy === user.uid ? 'you' : (by?.name ?? 'someone')} · {daysLeftInTrash(item)} days left to restore. Not counted in balances.
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() =>
            repo
              .restoreExpense(group.id, item.id)
              .then(() => toast(`Restored ${kind}`))
              .catch(fail)
          }
        >
          Restore
        </button>
        {canPurge(item, group, user.uid) && (
          <button type="button" className="btn flex-1 text-rose-700 dark:text-rose-400" onClick={purge}>
            Delete forever
          </button>
        )}
      </div>
    </div>
  )
}

/** "Recently deleted" sheet for a group (restorable for 30 days). */
export function RecentlyDeleted({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const { user } = useMe()
  const toast = useToast()
  const confirm = useConfirm()
  const trash = useTrash(open ? group : null)
  const fail = (err: unknown) => toast(errText(err), 'err')
  const name = (id: string) => (group.members[id]?.uid === user.uid ? 'You' : (group.members[id]?.name ?? 'Someone'))
  const by = (uid?: string) => (uid === user.uid ? 'you' : (Object.values(group.members).find((m) => m.uid === uid)?.name ?? 'someone'))
  const rows = [
    ...(trash?.expenses ?? []).map((e) => ({ kind: 'e' as const, id: e.id, at: e.deletedAt!, item: e })),
    ...(trash?.settlements ?? []).map((s) => ({ kind: 's' as const, id: s.id, at: s.deletedAt!, item: s })),
  ].sort((a, b) => b.at - a.at)

  return (
    <Sheet open={open} onClose={onClose} title="Recently deleted">
      <p className="text-muted mb-3 text-sm">Deleted expenses and payments stay here for 30 days. They don’t count in balances.</p>
      {trash === null ? null : rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">Nothing deleted recently.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((r) => {
            const purge = canPurge(r.item, group, user.uid)
            const restore = () =>
              (r.kind === 'e' ? repo.restoreExpense(group.id, r.id) : repo.restoreSettlement(group.id, r.id)).then(() => toast('Restored')).catch(fail)
            const forever = async () => {
              if (!(await confirm({ title: 'Delete forever?', message: 'This cannot be undone.', confirmLabel: 'Delete forever', tone: 'danger' }))) return
              ;(r.kind === 'e' ? repo.purgeExpense(group.id, r.id) : repo.purgeSettlement(group.id, r.id)).catch(fail)
            }
            return (
              <SwipeRow
                key={r.id}
                contentClassName="flex items-center gap-3 py-3"
                actions={purge ? [{ label: 'Delete', ariaLabel: `Delete ${r.kind === 'e' ? r.item.description : 'payment'} forever`, onClick: forever }] : []}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg dark:bg-ink-800" aria-hidden>
                  {r.kind === 'e' ? (CATEGORIES[r.item.category]?.emoji ?? '🧾') : '💸'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.kind === 'e' ? (
                      r.item.description
                    ) : (
                      <>
                        {name(r.item.from)} paid {name(r.item.to)}
                      </>
                    )}{' '}
                    · {r.kind === 'e' ? amountLabel(r.item.amount, r.item.original, group.currency) : formatMoney(r.item.amount, group.currency)}
                  </div>
                  <div className="text-muted truncate text-xs">
                    Deleted by {by(r.item.deletedBy)} {fmtAgo(r.at)} · {daysLeftInTrash(r.item)}d left
                  </div>
                </div>
                <button
                  type="button"
                  className="chip min-h-10 shrink-0"
                  onClick={restore}
                  aria-label={`Restore ${r.kind === 'e' ? r.item.description : 'payment'}`}
                >
                  Restore
                </button>
              </SwipeRow>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
