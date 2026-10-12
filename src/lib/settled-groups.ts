import type { Expense, Group, MemberId, Settlement } from '@/types'

/*
 * Groups, quietly: a group or 1:1 you've been square in for a while drops out of the Groups list
 * (one tap on the header's eye shows them again, remembered on this device). Recently settled
 * ones stay for SETTLED_KEEP_MS, so a group you just settled up in doesn't vanish under you.
 * Personal wallets never hide: there's nothing to settle.
 */

export const SETTLED_KEEP_MS = 7 * 86_400_000

export interface SettleView {
  group: Pick<Group, 'type' | 'createdAt'>
  me?: MemberId
  net: Record<MemberId, number>
  expenses: Pick<Expense, 'createdAt'>[]
  settlements: Pick<Settlement, 'createdAt'>[]
  pending: unknown[]
  waiting: unknown[]
}

/** When money last moved in the group (an expense or a payment added), else when it was made. */
export function lastMoneyAt(d: Pick<SettleView, 'group' | 'expenses' | 'settlements'>): number {
  let at = d.group.createdAt ?? 0
  for (const e of d.expenses) if (e.createdAt > at) at = e.createdAt
  for (const s of d.settlements) if (s.createdAt > at) at = s.createdAt
  return at
}

/** You're square, nothing waits on an OK, and nothing has happened for SETTLED_KEEP_MS. */
export function settledAWhile(d: SettleView, now: number): boolean {
  if (d.group.type === 'personal') return false
  if ((d.me ? (d.net[d.me] ?? 0) : 0) !== 0) return false
  if (d.pending.length || d.waiting.length) return false
  return now - lastMoneyAt(d) >= SETTLED_KEEP_MS
}

const KEY = 'splitit-groups-show-settled'

export function showSettledStored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function storeShowSettled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}
