import type { Cents, Debt, Group, MemberId } from '@/types'

/*
 * "Settle all": every payment you still have to make or receive, across all your groups and
 * 1:1s. Built from each group's own `debts` (computeGroupData in hooks/data, which already
 * honours the group's "simplify" setting), so what's listed here matches each group's
 * Balances tab exactly. Settling still happens per group (SettleUp takes from/to/amount).
 */

export interface SettleRow {
  key: string
  groupId: string
  groupName: string
  groupEmoji: string
  currency: string
  /** you, as a member id of this group */
  me: MemberId
  /** the other person, as a member id of this group */
  memberId: MemberId
  name: string
  color: string
  photoURL?: string
  uid?: string
  /** always > 0 */
  amount: Cents
  /** 'owe': you pay them; 'owed': they pay you */
  dir: 'owe' | 'owed'
  /** the in-group settle screen with this payment preselected */
  href: string
}

export interface CurrencyTotal { currency: string; owe: Cents; owed: Cents }

/** Your overall position with one person (in one currency), across every group you share. */
export interface PersonBalance {
  key: string
  name: string
  color: string
  photoURL?: string
  currency: string
  /** > 0: they owe you overall */
  net: Cents
  /** the per-group payments that make up `net`, in row order */
  parts: SettleRow[]
}

type GroupLike = { group: Pick<Group, 'id' | 'name' | 'emoji' | 'type' | 'currency' | 'members'>; me?: MemberId; debts: Debt[] }

export const settleHref = (groupId: string, from: MemberId, to: MemberId, amount: Cents) =>
  `/groups/${encodeURIComponent(groupId)}/settle?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`

/**
 * Your pending payments in every group: `first` currency (your home one) first, then by
 * currency code, largest first within a currency. Personal (solo) groups have none.
 */
export function pendingSettlements(data: GroupLike[], first?: string): SettleRow[] {
  const rows: SettleRow[] = []
  for (const d of data) {
    if (!d.me || d.group.type === 'personal') continue
    for (const x of d.debts) {
      if (x.amount <= 0 || (x.from !== d.me && x.to !== d.me) || x.from === x.to) continue
      const dir = x.from === d.me ? 'owe' : 'owed'
      const other = dir === 'owe' ? x.to : x.from
      const m = d.group.members[other]
      rows.push({
        key: `${d.group.id}|${x.from}|${x.to}`,
        groupId: d.group.id, groupName: d.group.name, groupEmoji: d.group.emoji, currency: d.group.currency,
        me: d.me, memberId: other, name: m?.name ?? 'Someone', color: m?.color ?? '#94a3b8', photoURL: m?.photoURL, uid: m?.uid,
        amount: x.amount, dir, href: settleHref(d.group.id, x.from, x.to, x.amount),
      })
    }
  }
  return rows.sort((a, b) => currencyOrder(a.currency, b.currency, first) || b.amount - a.amount || a.name.localeCompare(b.name))
}

const currencyOrder = (a: string, b: string, first?: string) => Number(b === first) - Number(a === first) || a.localeCompare(b)

/** Totals per currency (never added across currencies); the given currency first, then by code. */
export function totalsByCurrency(rows: SettleRow[], first?: string): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>()
  for (const r of rows) {
    const t = map.get(r.currency) ?? { currency: r.currency, owe: 0, owed: 0 }
    t[r.dir] += r.amount
    map.set(r.currency, t)
  }
  return [...map.values()].sort((a, b) => currencyOrder(a.currency, b.currency, first))
}

/** People are the same across groups by account uid, else by (trimmed, case-insensitive) name. */
export const personKey = (m: { uid?: string; name: string }) => (m.uid ? `u:${m.uid}` : `n:${m.name.trim().toLowerCase()}`)

/**
 * One entry per person and currency: the net position with them across all groups
 * ("Rohan owes you ₹x"), with the per-group rows it is made of. Largest |net| first; people
 * whose groups cancel out exactly (net 0) are kept, since they still need netting out.
 */
export function personBalances(rows: SettleRow[]): PersonBalance[] {
  const map = new Map<string, PersonBalance>()
  for (const r of rows) {
    const key = `${personKey(r)}|${r.currency}`
    const p = map.get(key) ?? { key, name: r.name, color: r.color, photoURL: r.photoURL, currency: r.currency, net: 0, parts: [] }
    p.photoURL ??= r.photoURL
    p.net += r.dir === 'owed' ? r.amount : -r.amount
    p.parts.push(r)
    map.set(key, p)
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name))
}

/** Distinct groups a person's balance spans (a person can appear once per group). */
export const groupCount = (p: PersonBalance) => new Set(p.parts.map((r) => r.groupId)).size
