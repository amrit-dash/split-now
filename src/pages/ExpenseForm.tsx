import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ReceiptText, Users, Wallet } from 'lucide-react'
import { useCaptures, useExpenses, useGroup, useGroups } from '@/hooks/data'
import { descriptionHistory, lastGroup } from '@/lib/recents'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { draftKey, loadDraft } from '@/lib/expense-draft'
import { pending } from '@/lib/pending'
import { Empty } from '@/components/Misc'
import { CardSkeleton } from '@/components/Skeleton'
import { ExpenseEditor } from '@/features/expense-form/ExpenseEditor'

/**
 * /add (new, optionally ?group=&again=&capture=) and /groups/:groupId/expenses/:expenseId/edit.
 * Picks the group and loads what the editor needs; the form itself is src/features/expense-form.
 */
export default function ExpenseForm() {
  const { groupId: editGroupId, expenseId } = useParams()
  const [params] = useSearchParams()
  const groups = useGroups()
  // "Add again" from an expense: /add?group=…&again=<expenseId> starts a copy dated today.
  const againId = expenseId ? undefined : (params.get('again') ?? undefined)
  // Prefill from a captured payment (/add?group=…&capture=…), handed over from the capture prompt.
  const captureId = expenseId ? undefined : (params.get('capture') ?? undefined)
  // Quick add (/add?group=…&quick=1): the parsed line waits in memory; it beats any stored draft (a fresh intent).
  const [quick] = useState(() => {
    if (expenseId || !params.get('quick')) return undefined
    const q = pending.quick
    pending.quick = undefined
    return q?.prefill
  })
  const storeKey = draftKey(expenseId)
  // A draft left on this device for this route (a reload, an accidental back), when it started from the same place.
  const [stored] = useState(() => {
    const s = loadDraft(storeKey)
    return s && (s.again ?? undefined) === againId && (s.capture ?? undefined) === captureId ? s : null
  })
  const [groupId, setGroupId] = useState<string | undefined>(editGroupId ?? params.get('group') ?? stored?.groupId ?? undefined)
  const group = useGroup(groupId)
  // The group's expenses: the one being edited, and past descriptions for suggestions.
  const expenses = useExpenses(groupId)
  const existing = expenseId ? expenses?.find((e) => e.id === expenseId) : undefined
  const again = againId ? expenses?.find((e) => e.id === againId) : undefined
  const captures = useCaptures()
  const capture = captureId ? captures?.find((c) => c.id === captureId && c.status === 'pending') : undefined
  // A switched group's list arrives a moment later; never suggest from the previous group.
  const groupExpenses = useMemo(() => (expenses ?? []).filter((e) => e.groupId === groupId), [expenses, groupId])
  const history = useMemo(() => descriptionHistory(groupExpenses), [groupExpenses])

  useEffect(() => {
    if (!groups?.length || editGroupId) return
    // No group yet, or one that no longer exists (a stale link or draft): default to a trip that's
    // running today, else the group used last on this device, else the most recent.
    if (!groupId || group === null) {
      const last = lastGroup()
      setGroupId(liveTripFor(groups, todayISO()) ?? (last && groups.some((g) => g.id === last) ? last : undefined) ?? groups[0].id)
    }
  }, [groups, groupId, group, editGroupId])

  if (!groups || (groupId && group === undefined) || ((expenseId || againId) && !expenses) || (captureId && !captures)) return <FormSkeleton />
  if (groups.length === 0) return <NoGroups />
  if (group === null && editGroupId)
    return (
      <div className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </div>
    )
  if (!group) return <FormSkeleton />
  if (expenseId && !existing)
    return (
      <div className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <Empty emoji="🔍" title="Expense not found" />
      </div>
    )

  // Keyed by the expense only: switching group keeps what was typed (the editor re-seeds payer and split).
  return (
    <ExpenseEditor
      key={existing?.id ?? again?.id ?? 'new'}
      group={group}
      groups={groups}
      existing={existing}
      again={again}
      capture={capture}
      quick={quick}
      expenses={groupExpenses}
      history={history}
      onGroup={setGroupId}
      storeKey={storeKey}
      restore={quick ? undefined : stored?.draft}
    />
  )
}

function FormSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]" role="status" aria-label="Loading">
      <CardSkeleton className="h-11 w-1/2 mx-auto" />
      <CardSkeleton className="mt-4 h-16" />
      <CardSkeleton className="mt-3 h-56" />
      <CardSkeleton className="mt-3 h-20" />
      <CardSkeleton className="mt-3 h-20" />
    </div>
  )
}

function NoGroups() {
  const nav = useNavigate()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+2rem)]">
      <Empty emoji="👀" title="Create a group first">
        Expenses live inside a group, a 1:1 friend, or your personal wallet.
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => nav('/groups/new?next=add')}>
            <Users size={18} aria-hidden /> New group
          </button>
          <button type="button" className="btn-secondary" onClick={() => nav('/groups/new?type=personal&next=add')}>
            <Wallet size={18} aria-hidden /> Personal
          </button>
        </div>
        <button type="button" className="btn-secondary mx-auto mt-2 flex" onClick={() => nav('/split', { replace: true })} data-testid="nogroups-split">
          <ReceiptText size={18} aria-hidden /> Split a bill by items
        </button>
        <p className="mt-2 text-xs text-muted">Out to eat? Scan the bill and everyone taps what they had, no group needed.</p>
      </Empty>
    </div>
  )
}
