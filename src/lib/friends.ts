import type { Debt, Group, MemberId } from '@/types'

/*
 * Who owes whom across groups: every simplified debt that involves you, summed per person and
 * per currency. Home ("People") and Friends render the same list, so it lives here.
 */

/** The slice of GroupData these functions need (so the Home/Friends hooks and tests can pass plain objects). */
export interface FriendGroup {
  group: Pick<Group, 'id' | 'type' | 'currency' | 'members' | 'archived'>
  me?: MemberId
  debts: Debt[]
}

export interface FriendPart<G extends FriendGroup = FriendGroup> {
  d: G
  memberId: MemberId
  /** >0: they owe you in this group */
  amount: number
}

export interface FriendBalance<G extends FriendGroup = FriendGroup> {
  /** account uid, or the name for people who haven't joined yet, plus the currency */
  key: string
  name: string
  color: string
  currency: string
  /** >0: they owe you overall */
  net: number
  parts: FriendPart<G>[]
}

/** People are matched across groups by their account uid, or by name for people who haven't joined yet. */
export function friendKey(m: { uid?: string; name: string }): string {
  return m.uid ? `u:${m.uid}` : `n:${m.name.trim().toLowerCase()}`
}

/**
 * Your balance with each person, one entry per person and currency, biggest first. Personal
 * wallets and archived groups are left out; so are debts between other people.
 */
export function friendBalances<G extends FriendGroup>(data: G[]): Array<FriendBalance<G>> {
  const map = new Map<string, FriendBalance<G>>()
  for (const d of data) {
    if (!d.me || d.group.type === 'personal' || d.group.archived) continue
    for (const debt of d.debts) {
      if (debt.from !== d.me && debt.to !== d.me) continue
      const other = debt.from === d.me ? debt.to : debt.from
      const m = d.group.members[other]
      if (!m) continue
      const key = `${friendKey(m)}|${d.group.currency}`
      const f = map.get(key) ?? { key, name: m.name, color: m.color, currency: d.group.currency, net: 0, parts: [] }
      const signed = debt.to === d.me ? debt.amount : -debt.amount
      f.net += signed
      f.parts.push({ d, memberId: other, amount: signed })
      map.set(key, f)
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

export type FriendFilter = 'owed' | 'owe' | null

/** `?filter=owed` keeps people who owe you, `owe` the people you owe; anything else is everyone. */
export function parseFriendFilter(v: string | null | undefined): FriendFilter {
  return v === 'owed' || v === 'owe' ? v : null
}

export function filterFriends<F extends { net: number }>(list: F[], filter: FriendFilter): F[] {
  if (filter === 'owed') return list.filter((f) => f.net > 0)
  if (filter === 'owe') return list.filter((f) => f.net < 0)
  return list
}
