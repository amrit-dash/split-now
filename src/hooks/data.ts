import { useEffect, useMemo, useRef, useState } from 'react'
import { repo } from '@/data'
import type { ActivityEntry, Capture, Expense, ExpenseComment, Group, MemberId, Settlement } from '@/types'
import { netBalances, pairwiseDebts } from '@/lib/balances'
import { simplifyDebts } from '@/lib/simplify'
import { planCatchUp } from '@/lib/recurrence'
import { todayISO } from '@/lib/id'
import { mergeFeeds } from '@/lib/activity'
import { canPurge, countedExpenses, countedSettlements, expiredTrash, isDisputed, isPending, liveItems, trashedItems } from '@/lib/trust'
import { useMe } from './auth'

export function useGroups() {
  const { user } = useMe()
  const [groups, setGroups] = useState<Group[] | null>(null)
  useEffect(() => repo.watchGroups(user.uid, setGroups), [user.uid])
  return groups
}

/** The signed-in user's captured transactions (newest first). */
export function useCaptures() {
  const { user } = useMe()
  const [list, setList] = useState<Capture[] | null>(null)
  useEffect(() => repo.watchCaptures(user.uid, setList), [user.uid])
  return list
}

export function usePendingCaptures() {
  const list = useCaptures()
  return useMemo(() => list?.filter((c) => c.status === 'pending') ?? null, [list])
}

export function useGroup(id: string | undefined) {
  const [group, setGroup] = useState<Group | null | undefined>(undefined)
  useEffect(() => (id ? repo.watchGroup(id, setGroup) : undefined), [id])
  return group
}

// Catch-up keys already attempted this session (template + nextDate), so repeated
// snapshots don't re-send the same write and a failing write isn't retried in a loop.
const attempted = new Set<string>()

/**
 * Recurring expenses: create any occurrences that came due since the group was last
 * opened. Runs on every expense snapshot for a member; writes are idempotent.
 */
export function catchUpRecurring(expenses: Expense[], today = todayISO()) {
  for (const e of expenses) {
    if (!e.recurrence || e.deletedAt) continue
    const key = `${e.groupId}/${e.id}@${e.recurrence.nextDate}|${e.recurrence.until ?? ''}`
    if (attempted.has(key)) continue
    const plan = planCatchUp(e, today)
    if (!plan) continue
    attempted.add(key)
    repo.saveRecurringOccurrences(plan.template, plan.occurrences).catch((err) => console.warn('Recurring catch-up failed', err))
  }
}

/** The group's expenses, without trashed ones. */
export function useExpenses(groupId: string | undefined) {
  const [list, setList] = useState<Expense[] | null>(null)
  useEffect(() => (groupId ? repo.watchExpenses(groupId, (l) => { const live = liveItems(l); setList(live); catchUpRecurring(live) }) : undefined), [groupId])
  return list
}

/** Every expense of the group, including those in "Recently deleted". */
export function useAllExpenses(groupId: string | undefined) {
  const [list, setList] = useState<Expense[] | null>(null)
  useEffect(() => (groupId ? repo.watchExpenses(groupId, setList) : undefined), [groupId])
  return list
}

export function useAllSettlements(groupId: string | undefined) {
  const [list, setList] = useState<Settlement[] | null>(null)
  useEffect(() => (groupId ? repo.watchSettlements(groupId, setList) : undefined), [groupId])
  return list
}

// Expired trash already purged this session.
const purged = new Set<string>()

/**
 * "Recently deleted" for a group (last 30 days, newest first). Items older than that are
 * purged by whoever is allowed to (the deleter or the group creator) when they open it.
 */
export function useTrash(group: Group | null | undefined) {
  const { user } = useMe()
  const expenses = useAllExpenses(group?.id)
  const settlements = useAllSettlements(group?.id)
  useEffect(() => {
    if (!group || !expenses || !settlements) return
    for (const e of expiredTrash(expenses)) {
      if (purged.has(e.id) || !canPurge(e, group, user.uid)) continue
      purged.add(e.id)
      repo.purgeExpense(group.id, e.id).catch((err) => console.warn('Trash purge failed', err))
    }
    for (const s of expiredTrash(settlements)) {
      if (purged.has(s.id) || !canPurge(s, group, user.uid)) continue
      purged.add(s.id)
      repo.purgeSettlement(group.id, s.id).catch((err) => console.warn('Trash purge failed', err))
    }
  }, [group, expenses, settlements, user.uid])
  return useMemo(
    () => (expenses && settlements ? { expenses: trashedItems(expenses), settlements: trashedItems(settlements) } : null),
    [expenses, settlements],
  )
}

/** A group's activity feed, newest first. */
export function useActivity(groupId: string | undefined, max = 50) {
  const [list, setList] = useState<ActivityEntry[] | null>(null)
  useEffect(() => (groupId ? repo.watchActivity(groupId, setList, max) : undefined), [groupId, max])
  return list
}

/** Edit history of one expense or settlement, newest first. */
export function useHistory(groupId: string | undefined, targetId: string | undefined) {
  const [list, setList] = useState<ActivityEntry[] | null>(null)
  useEffect(() => (groupId && targetId ? repo.watchHistory(groupId, targetId, setList) : undefined), [groupId, targetId])
  return list
}

/** Newest activity across the given groups. */
export function useRecentActivity(groupIds: string[] | null, max = 8) {
  const [feeds, setFeeds] = useState<Record<string, ActivityEntry[]>>({})
  const key = groupIds ? [...groupIds].sort().join(',') : null
  useEffect(() => {
    if (!key) return
    const ids = key.split(',')
    const unsubs = ids.map((id) => repo.watchActivity(id, (a) => setFeeds((p) => ({ ...p, [id]: a })), max))
    return () => { unsubs.forEach((u) => u()); setFeeds({}) }
  }, [key, max])
  return useMemo(() => (key === null ? null : mergeFeeds(Object.values(feeds), max)), [feeds, key, max])
}

export function useComments(groupId: string | undefined, expenseId: string | undefined) {
  const [list, setList] = useState<ExpenseComment[] | null>(null)
  useEffect(() => (groupId && expenseId ? repo.watchComments(groupId, expenseId, setList) : undefined), [groupId, expenseId])
  return list
}

/** The group's settlements, without trashed ones. */
export function useSettlements(groupId: string | undefined) {
  const [list, setList] = useState<Settlement[] | null>(null)
  useEffect(() => (groupId ? repo.watchSettlements(groupId, (l) => setList(liveItems(l))) : undefined), [groupId])
  return list
}

export function myMemberId(g: Group, uid: string): MemberId | undefined {
  return Object.entries(g.members).find(([, m]) => m.uid === uid)?.[0]
}

export function memberOrder(g: Group): MemberId[] {
  return Object.keys(g.members).sort((a, b) => g.members[a].name.localeCompare(g.members[b].name))
}

export interface GroupData {
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me?: MemberId
  net: Record<MemberId, number>
  debts: ReturnType<typeof simplifyDebts>
  rawDebts: ReturnType<typeof simplifyDebts>
  /** waiting for approval: listed, but not in net/debts */
  pending: Expense[]
  /** flagged by someone: still counted in net/debts */
  disputed: Expense[]
}

/**
 * Balances for a group. Trashed items never count; expenses still waiting for approval are
 * listed (in `expenses` and `pending`) but left out of `net` and the debts.
 */
export function computeGroupData(group: Group, expenses: Expense[], settlements: Settlement[], uid: string): GroupData {
  const live = liveItems(expenses)
  const liveSettlements = countedSettlements(settlements)
  const counted = countedExpenses(live, group)
  const net = netBalances(counted, liveSettlements)
  const rawDebts = pairwiseDebts(counted, liveSettlements)
  const debts = group.simplify ? simplifyDebts(net) : rawDebts
  return {
    group, expenses: live, settlements: liveSettlements, me: myMemberId(group, uid), net, debts, rawDebts,
    pending: live.filter((e) => isPending(e, group)), disputed: counted.filter(isDisputed),
  }
}

/** Live data for every group the user belongs to (for dashboard / friends / insights). */
export function useAllGroupData(): GroupData[] | null {
  const { user } = useMe()
  const groups = useGroups()
  const [exp, setExp] = useState<Record<string, Expense[]>>({})
  const [set, setSet] = useState<Record<string, Settlement[]>>({})
  // Sorted, so re-ordering (every save bumps updatedAt) doesn't look like a change.
  const ids = groups ? groups.map((g) => g.id).sort().join(',') : null
  const subs = useRef(new Map<string, () => void>())
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Subscribe to new groups and drop removed ones without restarting the others.
  useEffect(() => {
    if (ids === null) return
    const want = new Set(ids ? ids.split(',') : [])
    for (const [id, unsub] of subs.current) {
      if (want.has(id)) continue
      unsub()
      subs.current.delete(id)
      setExp(({ [id]: _, ...rest }) => rest)
      setSet(({ [id]: _, ...rest }) => rest)
    }
    for (const id of want) {
      if (subs.current.has(id)) continue
      const a = repo.watchExpenses(id, (e) => { setExp((p) => ({ ...p, [id]: e })); catchUpRecurring(e) })
      const b = repo.watchSettlements(id, (s) => setSet((p) => ({ ...p, [id]: s })))
      subs.current.set(id, () => { a(); b() })
    }
  }, [ids])
  useEffect(() => {
    const map = subs.current
    return () => { map.forEach((u) => u()); map.clear() }
  }, [])

  const allLoaded = !!groups && groups.every((g) => exp[g.id] && set[g.id])
  useEffect(() => { if (allLoaded) setInitialLoadDone(true) }, [allLoaded])

  return useMemo(() => {
    // Until every group has reported once, show a loader rather than a misleading "all settled".
    if (!groups || (!allLoaded && !initialLoadDone)) return null
    return groups.map((g) => computeGroupData(g, exp[g.id] ?? [], set[g.id] ?? [], user.uid))
  }, [groups, exp, set, user.uid, allLoaded, initialLoadDone])
}
