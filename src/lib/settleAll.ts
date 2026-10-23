import type { Cents, Debt, Group, MemberId } from '@/types'
import type { NudgeItem } from './nudge'
import { shortNames } from './shortNames'

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
  /** a private group: named "A private group" in anything that leaves the app (a Pay me link, a Remind) */
  vault?: true
  /** the row is a 1:1 (its group name is the other person) */
  direct?: boolean
  groupEmoji: string
  currency: string
  /** you, as a member id of this group */
  me: MemberId
  /** the other person, as a member id of this group */
  memberId: MemberId
  /** the full name (people are matched across groups by it when they have no account) */
  name: string
  /** what the screen calls them: first name, "Rahul S." when two people listed share one */
  label: string
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

export interface CurrencyTotal {
  currency: string
  owe: Cents
  owed: Cents
}

/** Your overall position with one person (in one currency), across every group you share. */
export interface PersonBalance {
  key: string
  name: string
  /** first name, "Rahul S." when two people listed share one */
  label: string
  color: string
  photoURL?: string
  currency: string
  /** > 0: they owe you overall */
  net: Cents
  /** the per-group payments that make up `net`, in row order */
  parts: SettleRow[]
}

type GroupLike = { group: Pick<Group, 'id' | 'name' | 'emoji' | 'type' | 'currency' | 'members' | 'archived' | 'vault'>; me?: MemberId; debts: Debt[] }

export const settleHref = (groupId: string, from: MemberId, to: MemberId, amount: Cents) =>
  `/groups/${encodeURIComponent(groupId)}/settle?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`

/**
 * Your pending payments in every group: `first` currency (your home one) first, then by
 * currency code, largest first within a currency. Personal (solo) groups have none, and archived
 * groups are left out, as everywhere else that totals your balances (they stay settleable from
 * the group itself).
 */
export function pendingSettlements(data: GroupLike[], first?: string): SettleRow[] {
  const rows: SettleRow[] = []
  for (const d of data) {
    if (!d.me || d.group.type === 'personal' || d.group.archived) continue
    for (const x of d.debts) {
      if (x.amount <= 0 || (x.from !== d.me && x.to !== d.me) || x.from === x.to) continue
      const dir = x.from === d.me ? 'owe' : 'owed'
      const other = dir === 'owe' ? x.to : x.from
      const m = d.group.members[other]
      rows.push({
        key: `${d.group.id}|${x.from}|${x.to}`,
        groupId: d.group.id,
        groupName: d.group.name,
        ...(d.group.vault ? { vault: true as const } : {}),
        ...(d.group.type === 'direct' ? { direct: true } : {}),
        groupEmoji: d.group.emoji,
        currency: d.group.currency,
        me: d.me,
        memberId: other,
        name: m?.name ?? 'Someone',
        label: '',
        color: m?.color ?? '#94a3b8',
        photoURL: m?.photoURL,
        uid: m?.uid,
        amount: x.amount,
        dir,
        href: settleHref(d.group.id, x.from, x.to, x.amount),
      })
    }
  }
  // Named across groups: two different Rahuls on one screen must not both read "Rahul".
  const labels = shortNames(Object.fromEntries(rows.map((r) => [personKey(r), { name: r.name }])))
  for (const r of rows) r.label = labels[personKey(r)] ?? r.name
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
    const p = map.get(key) ?? { key, name: r.name, label: r.label, color: r.color, photoURL: r.photoURL, currency: r.currency, net: 0, parts: [] }
    p.photoURL ??= r.photoURL
    p.net += r.dir === 'owed' ? r.amount : -r.amount
    p.parts.push(r)
    map.set(key, p)
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name))
}

/**
 * Rows a cross-group Settle up can net. Netting records "counter" payments in the groups that go
 * against the overall direction; where you owe someone who owes you more overall, that is a
 * payment from you to them, and in a group that asks for the payee's OK it would wait for theirs
 * while the rest counted at once, leaving the netting half done. So those rows are held out
 * (`held`, settled in their own group instead); everything else nets as before.
 */
export function nettableRows(rows: SettleRow[], gated: ReadonlySet<string>): { rows: SettleRow[]; held: SettleRow[] } {
  const net = new Map<string, number>()
  const mixed = new Map<string, Set<string>>()
  for (const r of rows) {
    const k = `${personKey(r)}|${r.currency}`
    net.set(k, (net.get(k) ?? 0) + (r.dir === 'owed' ? r.amount : -r.amount))
    mixed.set(k, (mixed.get(k) ?? new Set()).add(r.dir))
  }
  const held: SettleRow[] = []
  const kept = rows.filter((r) => {
    const k = `${personKey(r)}|${r.currency}`
    const counter = r.dir === 'owe' && (net.get(k) ?? 0) > 0 && (mixed.get(k)?.size ?? 0) > 1 && gated.has(r.groupId)
    if (counter) held.push(r)
    return !counter
  })
  return { rows: kept, held }
}

/** Distinct groups a person's balance spans (a person can appear once per group). */
/** How a row names its group: a 1:1 is "1:1" (its group name is the person, already on the row), any other group its emoji and name. */
export const groupLine = (r: Pick<SettleRow, 'direct' | 'groupEmoji' | 'groupName'>): { emoji: string | null; text: string } =>
  r.direct ? { emoji: null, text: '1:1' } : { emoji: r.groupEmoji, text: r.groupName }

export const groupCount = (p: PersonBalance) => new Set(p.parts.map((r) => r.groupId)).size

/** The settle-up screen for everything with one person (one currency) across their groups. */
export const settlePersonHref = (p: Pick<PersonBalance, 'key'>) => `/settle/with/${encodeURIComponent(p.key)}`

/** A per-group row as a signed amount: > 0 they owe you there. */
export const signedAmount = (r: Pick<SettleRow, 'dir' | 'amount'>) => (r.dir === 'owed' ? r.amount : -r.amount)

/** The groups a person's balance is made of, in the order given, without repeats. */
export const groupNames = (p: Pick<PersonBalance, 'parts'>) => [...new Set(p.parts.map((r) => r.groupName))]

/**
 * A "by person" row that spans several groups, nudged as one (the callable's `items`): every
 * group where the other person has an account, both directions, since the server nets out the
 * groups where you owe them. The figure shown goes along as a hint for the groups they owe in.
 */
export function personNudgeItems(p: Pick<PersonBalance, 'parts'>): NudgeItem[] {
  return p.parts
    .filter((r) => r.uid)
    .map((r) => (r.dir === 'owed' ? { groupId: r.groupId, memberId: r.memberId, amount: r.amount } : { groupId: r.groupId, memberId: r.memberId }))
}

/** Whether a person's row offers Nudge: they owe you overall and have an account (and it isn't you). */
export const canNudgePerson = (p: Pick<PersonBalance, 'net' | 'parts'>, myUid: string) =>
  p.net > 0 && p.parts.some((r) => r.dir === 'owed' && !!r.uid && r.uid !== myUid)

/**
 * Where a group's Settle up button goes. With exactly one suggested payment involving you, that
 * payment's Settle up, prefilled (one tap, as before). With several payments to sort out (several
 * people owe you, or the payments are between others), the group's Balances tab, which lists each
 * one with its own Settle button, instead of quietly picking the first. With nothing owed, the
 * Balances tab too, where everyone being square is celebrated (and a payment made outside the app
 * can still be recorded from there).
 */
export function groupSettleTarget(groupId: string, debts: Pick<Debt, 'from' | 'to' | 'amount'>[], me?: MemberId): { href: string } | { tab: 'balances' } {
  if (debts.length === 0) return { tab: 'balances' }
  const mine = me ? debts.filter((d) => d.from === me || d.to === me) : []
  // Your one payment is the thing to do, even when others still owe each other.
  if (mine.length === 1) return { href: settleHref(groupId, mine[0].from, mine[0].to, mine[0].amount) }
  return { tab: 'balances' }
}
