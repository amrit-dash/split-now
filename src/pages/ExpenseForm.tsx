import { useEffect, useMemo, useState } from 'react'
import { usePickableGroups } from '@/hooks/useVault'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { GroupsIcon, ReceiptIcon, WalletIcon } from '@/components/icons'
import { useBack } from '@/hooks/useBack'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId, useCaptures, useExpenses, useGroup, useOpenItems } from '@/hooks/data'
import { descriptionHistory, lastGroup } from '@/lib/recents'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { draftKey, loadDraft } from '@/lib/expense-draft'
import { pending } from '@/lib/pending'
import { openItemPrefill, openItemState } from '@/lib/open-items'
import { Empty } from '@/components/Misc'
import { type Hint, HintText } from '@/components/Hint'
import { CardSkeleton } from '@/components/Skeleton'
import { ExpenseEditor } from '@/features/expense-form/ExpenseEditor'

const SPLIT_HINT: Hint = {
  full: 'Out to eat? Scan the bill and everyone taps what they had, no group needed.',
  short: 'Everyone taps what they had, no group needed',
  tier: 'help',
}

/**
 * /add (new, optionally ?group=&again=&capture=&open=) and /groups/:groupId/expenses/:expenseId/edit.
 * Picks the group and loads what the editor needs; the form itself is src/features/expense-form.
 */
export default function ExpenseForm() {
  const { groupId: editGroupId, expenseId } = useParams()
  const [params] = useSearchParams()
  const groups = usePickableGroups()
  const { user } = useMe()
  // "Add again" from an expense: /add?group=…&again=<expenseId> starts a copy dated today.
  const againId = expenseId ? undefined : (params.get('again') ?? undefined)
  // Prefill from a captured payment (/add?group=…&capture=…), handed over from the capture prompt.
  const captureId = expenseId ? undefined : (params.get('capture') ?? undefined)
  // Claiming an open item (/add?group=…&open=…): paid by you, split among everyone, its details filled in.
  const openId = expenseId ? undefined : (params.get('open') ?? undefined)
  // Add expense from the group chat (/add?group=…&chat=1): its card is posted there, and Save goes back to the chat.
  const fromChat = !expenseId && params.get('chat') === '1'
  // Quick add (/add?group=…&quick=1): the parsed line waits in memory; it beats any stored draft (a fresh intent).
  const [handed] = useState(() => {
    if (expenseId || !params.get('quick')) return undefined
    const q = pending.quick
    pending.quick = undefined
    return q
  })
  const [quick, setQuick] = useState(handed?.groupId ? handed.prefill : undefined)
  // A line that asked for a new group arrives here once GroupForm made it: its people are read
  // again against the new members before the form opens (the parser is the lazy Quick add chunk).
  const unbound = handed && !handed.groupId ? handed : undefined
  const storeKey = draftKey(expenseId)
  // A draft left on this device for this route (a reload, an accidental back), when it started from the same place.
  const [stored] = useState(() => {
    const s = loadDraft(storeKey)
    return s && (s.again ?? undefined) === againId && (s.capture ?? undefined) === captureId && (s.open ?? undefined) === openId ? s : null
  })
  const [groupId, setGroupId] = useState<string | undefined>(editGroupId ?? params.get('group') ?? stored?.groupId ?? undefined)
  const group = useGroup(groupId)
  // The group's expenses: the one being edited, and past descriptions for suggestions.
  const expenses = useExpenses(groupId)
  const existing = expenseId ? expenses?.find((e) => e.id === expenseId) : undefined
  const again = againId ? expenses?.find((e) => e.id === againId) : undefined
  const captures = useCaptures()
  const capture = captureId ? captures?.find((c) => c.id === captureId && c.status === 'pending') : undefined
  const openItems = useOpenItems(openId ? groupId : undefined)
  // Only while it's still open (someone else may have claimed it since the link was tapped).
  const openItem = useMemo(() => {
    const it = openId ? openItems?.find((o) => o.id === openId) : undefined
    return it && openItemState(it, expenses ? new Map(expenses.map((e) => [e.id, e])) : null) === 'open' ? it : undefined
  }, [openId, openItems, expenses])
  const openPrefill = useMemo(() => {
    if (!openItem || !group) return undefined
    const order = memberOrder(group)
    return openItemPrefill(openItem, { order, me: myMemberId(group, user.uid) ?? order[0], currency: group.currency })
  }, [openItem, group, user.uid])
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

  useEffect(() => {
    if (!unbound || quick || !group) return
    let live = true
    const order = memberOrder(group)
    const ctx = { members: order.map((id) => ({ id, name: group.members[id].name })), me: myMemberId(group, user.uid) ?? order[0], currency: group.currency }
    import('@/lib/nl-expense')
      .then(({ bindQuickPrefill }) => bindQuickPrefill(unbound.prefill, unbound.line ?? unbound.prefill.text, ctx))
      .catch(() => unbound.prefill)
      .then((p) => {
        if (live) setQuick(p)
      })
    return () => {
      live = false
    }
  }, [unbound, quick, group, user.uid])

  if (
    !groups ||
    (groupId && group === undefined) ||
    (unbound && !quick) ||
    ((expenseId || againId || openId) && !expenses) ||
    (captureId && !captures) ||
    (openId && groupId && !openItems)
  )
    return <FormSkeleton />
  if (groups.length === 0) return <NoGroups />
  if (group === null && editGroupId)
    return (
      <div className="mx-auto max-w-lg px-4 pt-[calc(var(--safe-top)+2rem)]">
        <Empty icon="search" title="This group doesn’t exist or you’re not a member" />
      </div>
    )
  if (!group) return <FormSkeleton />
  if (expenseId && !existing)
    return (
      <div className="mx-auto max-w-lg px-4 pt-[calc(var(--safe-top)+2rem)]">
        <Empty icon="search" title="Expense not found" />
      </div>
    )

  // Keyed by the expense only: switching group keeps what was typed (the editor re-seeds payer and split).
  return (
    <ExpenseEditor
      key={existing?.id ?? again?.id ?? (openItem ? `open-${openItem.id}` : 'new')}
      group={group}
      groups={groups}
      existing={existing}
      again={again}
      capture={capture}
      quick={quick ?? openPrefill}
      openItem={openItem}
      fromChat={fromChat}
      expenses={groupExpenses}
      history={history}
      onGroup={setGroupId}
      storeKey={storeKey}
      restore={handed ? undefined : stored?.draft}
      restoreReceipt={handed ? undefined : stored?.receipt}
      restorePhotos={handed ? undefined : stored?.photos}
    />
  )
}

function FormSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[calc(var(--safe-top)+0.75rem)]" role="status" aria-label="Loading">
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
  // The way out, like the form's own ✕: back where Add expense was opened from (Home when opened cold).
  const close = useBack('/')
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(var(--safe-top)+2rem)]">
      <button
        type="button"
        onClick={close}
        className="absolute left-1 top-[calc(var(--safe-top)+0.75rem)] flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
        aria-label="Close"
        data-testid="nogroups-close"
      >
        <X size={24} aria-hidden />
      </button>
      <Empty icon="users" title="Create a group first">
        Expenses live inside a group, a 1:1 friend, or your personal wallet.
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => nav('/groups/new?next=add')}>
            <GroupsIcon size={18} aria-hidden /> New group
          </button>
          <button type="button" className="btn-secondary" onClick={() => nav('/groups/new?type=personal&next=add')}>
            <WalletIcon size={18} aria-hidden /> Personal
          </button>
        </div>
        <button type="button" className="btn-secondary mx-auto mt-2 flex" onClick={() => nav('/split', { replace: true })} data-testid="nogroups-split">
          <ReceiptIcon size={18} aria-hidden /> Split a bill by items
        </button>
        <HintText hint={SPLIT_HINT} className="mt-2 text-xs text-muted" />
      </Empty>
    </div>
  )
}
