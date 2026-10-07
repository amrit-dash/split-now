import { useEffect, useMemo, useState } from 'react'
import { repo } from '@/data'
import type { Expense, Group, MemberId, Settlement } from '@/types'
import { netBalances, pairwiseDebts } from '@/lib/balances'
import { simplifyDebts } from '@/lib/simplify'
import { useMe } from './auth'

export function useGroups() {
  const { user } = useMe()
  const [groups, setGroups] = useState<Group[] | null>(null)
  useEffect(() => repo.watchGroups(user.uid, setGroups), [user.uid])
  return groups
}

export function useGroup(id: string | undefined) {
  const [group, setGroup] = useState<Group | null | undefined>(undefined)
  useEffect(() => (id ? repo.watchGroup(id, setGroup) : undefined), [id])
  return group
}

export function useExpenses(groupId: string | undefined) {
  const [list, setList] = useState<Expense[] | null>(null)
  useEffect(() => (groupId ? repo.watchExpenses(groupId, setList) : undefined), [groupId])
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
      repo.watchExpenses(id, (e) => setExp((p) => ({ ...p, [id]: e }))),
      repo.watchSettlements(id, (s) => setSet((p) => ({ ...p, [id]: s }))),
    ])
    return () => unsubs.forEach((u) => u())
  }, [ids])

  return useMemo(() => {
    if (!groups) return null
    return groups.map((g) => computeGroupData(g, exp[g.id] ?? [], set[g.id] ?? [], user.uid))
  }, [groups, exp, set, user.uid])
}
