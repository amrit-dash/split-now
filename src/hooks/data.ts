import { useEffect, useMemo, useState } from 'react'
import { repo } from '@/data'
import type { Capture, Expense, ExpenseComment, Group, MemberId, Settlement } from '@/types'
import { netBalances, pairwiseDebts } from '@/lib/balances'
import { simplifyDebts } from '@/lib/simplify'
import { planCatchUp } from '@/lib/recurrence'
import { todayISO } from '@/lib/id'
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
    if (!e.recurrence) continue
    const key = `${e.groupId}/${e.id}@${e.recurrence.nextDate}|${e.recurrence.until ?? ''}`
    if (attempted.has(key)) continue
    const plan = planCatchUp(e, today)
    if (!plan) continue
    attempted.add(key)
    repo.saveRecurringOccurrences(plan.template, plan.occurrences).catch((err) => console.warn('Recurring catch-up failed', err))
  }
}

export function useExpenses(groupId: string | undefined) {
  const [list, setList] = useState<Expense[] | null>(null)
  useEffect(() => (groupId ? repo.watchExpenses(groupId, (l) => { setList(l); catchUpRecurring(l) }) : undefined), [groupId])
  return list
}

export function useComments(groupId: string | undefined, expenseId: string | undefined) {
  const [list, setList] = useState<ExpenseComment[] | null>(null)
  useEffect(() => (groupId && expenseId ? repo.watchComments(groupId, expenseId, setList) : undefined), [groupId, expenseId])
  return list
}

export function useSettlements(groupId: string | undefined) {
  const [list, setList] = useState<Settlement[] | null>(null)
  useEffect(() => (groupId ? repo.watchSettlements(groupId, setList) : undefined), [groupId])
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
}

export function computeGroupData(group: Group, expenses: Expense[], settlements: Settlement[], uid: string): GroupData {
  const net = netBalances(expenses, settlements)
  const rawDebts = pairwiseDebts(expenses, settlements)
  const debts = group.simplify ? simplifyDebts(net) : rawDebts
  return { group, expenses, settlements, me: myMemberId(group, uid), net, debts, rawDebts }
}

/** Live data for every group the user belongs to (for dashboard / friends / insights). */
export function useAllGroupData(): GroupData[] | null {
  const { user } = useMe()
  const groups = useGroups()
  const [exp, setExp] = useState<Record<string, Expense[]>>({})
  const [set, setSet] = useState<Record<string, Settlement[]>>({})
  const ids = groups?.map((g) => g.id).join(',') ?? ''

  useEffect(() => {
    if (!ids) return
    const unsubs = ids.split(',').flatMap((id) => [
      repo.watchExpenses(id, (e) => { setExp((p) => ({ ...p, [id]: e })); catchUpRecurring(e) }),
      repo.watchSettlements(id, (s) => setSet((p) => ({ ...p, [id]: s }))),
    ])
    return () => unsubs.forEach((u) => u())
  }, [ids])

  return useMemo(() => {
    if (!groups) return null
    return groups.map((g) => computeGroupData(g, exp[g.id] ?? [], set[g.id] ?? [], user.uid))
  }, [groups, exp, set, user.uid])
}
