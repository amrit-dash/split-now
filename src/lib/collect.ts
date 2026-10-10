import type { Cents, PaidIn } from '@/types'
import { convertMinor } from './fx'
import { type PersonBalance, signedAmount } from './settleAll'
import { allocateAcrossGroups, proportional } from './settleMulti'

/*
 * Settling in another currency ("Collect in my currency", docs/PLAN.md §3).
 *
 * A group's balances only ever count the group's currency. When a debt in dollars is paid in
 * rupees, the payment is still recorded in dollars (what it clears), with what actually changed
 * hands kept beside it (Settlement.paid: currency, amount, rate). How much a rupee payment clears
 * follows the rupees, at the ECB rate, with a small tolerance so a bank's or a UPI app's slightly
 * different rate still clears the debt in full:
 *  - within ±4% of the converted amount: clears the whole amount owed
 *  - less: clears what the rupees are worth (₹4.50 against ₹1,045 owed clears $0.05)
 *  - more: refused ("more than owed"), so a typo can't overpay
 */

/** How far a converted payment may be from the exact conversion and still clear the debt in full. */
export const PAY_TOLERANCE = 0.04

export type PayStatus = 'full' | 'part' | 'over' | 'none'

export interface PayCheck {
  /** what the payment clears, in the group currency (0 … due) */
  cleared: Cents
  status: PayStatus
  /** the exact conversion of `due`, in the paying currency */
  expected: Cents
}

/** The ±4% band around `expected` (minor units): [lowest, highest] that still counts as paying it in full. */
export function toleranceBand(expected: Cents): [Cents, Cents] {
  return [Math.ceil(expected * (1 - PAY_TOLERANCE)), Math.floor(expected * (1 + PAY_TOLERANCE))]
}

/**
 * What `paid` (minor units of `payCur`) clears of `due` (minor units of `groupCur`), at `rate`
 * group-currency units per 1 paying-currency unit (the ECB rate payCur → groupCur).
 */
export function clearedFor(paid: Cents, due: Cents, groupCur: string, payCur: string, rate: number): PayCheck {
  const expected = due > 0 && rate > 0 ? convertMinor(due, groupCur, payCur, 1 / rate) : 0
  if (!(paid > 0) || !(due > 0) || !(rate > 0)) return { cleared: 0, status: 'none', expected }
  const [lo, hi] = toleranceBand(expected)
  if (paid > hi) return { cleared: due, status: 'over', expected }
  if (paid >= lo) return { cleared: due, status: 'full', expected }
  const cleared = Math.min(due, convertMinor(paid, payCur, groupCur, rate))
  return { cleared, status: cleared > 0 ? 'part' : 'none', expected }
}

/** The record of a converted payment (Settlement.paid). */
export function paidIn(currency: string, amount: Cents, rate: number, rateDate: string): PaidIn {
  return { currency, amount, rate: Number(rate.toPrecision(10)), rateDate, source: 'ecb' }
}

/* ─────────────── One person, every currency, in your own ─────────────── */

/** A person across currencies, shown and settled in your home currency (approximately, at today's rates). */
export interface HomeBalance extends PersonBalance {
  /** true: made of other currencies, converted (shown with ≈) */
  approx: boolean
  /** each part's signed balance in the home currency (> 0 they owe you), by SettleRow key */
  home: Record<string, Cents>
  /** home-currency units per 1 unit of each part's currency, by SettleRow key */
  rates: Record<string, number>
}

/** The person part of a PersonBalance key ("u:abc|INR" → "u:abc"). */
export const personOf = (key: string) => key.slice(0, key.lastIndexOf('|'))

/** The key of someone's combined balance (all currencies). */
export const homeKey = (person: string) => `${person}|*`

/**
 * Your balances with each person, every currency folded into `home` (Collect in my currency).
 * `rates`: home units per 1 unit of a currency (useTodayRates). Someone whose balances are all in
 * the home currency is unchanged; someone with another currency is merged into one ≈ balance,
 * unless a rate is missing (offline), then their balances stay apart as before.
 */
export function inHome(people: PersonBalance[], home: string, rates: Record<string, { rate: number } | null | undefined>): HomeBalance[] {
  const byPerson = new Map<string, PersonBalance[]>()
  for (const p of people) byPerson.set(personOf(p.key), [...(byPerson.get(personOf(p.key)) ?? []), p])
  const out: HomeBalance[] = []
  for (const [person, list] of byPerson) {
    const foreign = list.filter((p) => p.currency !== home)
    const known = foreign.every((p) => (rates[p.currency]?.rate ?? 0) > 0)
    if (foreign.length === 0 || !known) {
      for (const p of list) out.push({ ...p, approx: false, home: {}, rates: {} })
      continue
    }
    const parts = list.flatMap((p) => p.parts)
    const home_: Record<string, Cents> = {}
    const rates_: Record<string, number> = {}
    for (const r of parts) {
      const rate = r.currency === home ? 1 : (rates[r.currency]?.rate as number)
      rates_[r.key] = rate
      home_[r.key] = Math.sign(signedAmount(r)) * convertMinor(r.amount, r.currency, home, rate)
    }
    const first = list[0]
    out.push({
      key: homeKey(person),
      name: first.name,
      color: first.color,
      photoURL: list.find((p) => p.photoURL)?.photoURL,
      currency: home,
      net: Object.values(home_).reduce((s, v) => s + v, 0),
      parts,
      approx: true,
      home: home_,
      rates: rates_,
    })
  }
  return out.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name))
}

export interface HomePart {
  key: string
  /** recorded in the group, in the group's currency and own direction; 0 = nothing */
  amount: Cents
  /** what changed hands for this group, in the home currency (0 for netted groups) */
  paid: Cents
  /** balance left in this group, in its currency */
  left: Cents
  /** runs against the net: cleared by netting, no money for it */
  counter: boolean
}

export interface HomePlan {
  status: PayStatus
  /** the payment counted (home currency): the total owed when within the tolerance */
  payment: Cents
  parts: HomePart[]
  clearsAll: boolean
}

/**
 * One payment of `paid` (home currency) to settle everything with a combined person. Within ±4%
 * of the ≈ total it clears every group exactly; less pays part, shared across the groups as
 * allocateAcrossGroups does; more is refused. Each group records its own currency's amount (the
 * exact balance when cleared, else the converted share), and the money moved is spread over the
 * groups the payment runs to, adding up to exactly `paid`.
 */
export function planInHome(p: HomeBalance, paid: Cents): HomePlan {
  const total = Math.abs(p.net)
  const [lo, hi] = toleranceBand(total)
  const status: PayStatus = !(paid > 0) || total === 0 ? 'none' : paid > hi ? 'over' : paid >= lo ? 'full' : 'part'
  const payment = status === 'full' || status === 'over' ? total : status === 'part' ? paid : 0
  const signedHome = (r: PersonBalance['parts'][number]) => p.home[r.key] ?? signedAmount(r)
  const plan = allocateAcrossGroups(
    p.parts.map((r) => ({ key: r.key, signed: signedHome(r) })),
    payment,
  )
  const dir = Math.sign(p.net)
  const major = p.parts.filter((r) => dir !== 0 && Math.sign(signedHome(r)) === dir)
  const majorHome = major.map((r) => plan.allocations.find((a) => a.key === r.key)?.amount ?? 0)
  const moved = status === 'none' ? majorHome.map(() => 0) : spread(status === 'full' ? paid : payment, majorHome)
  const paidOf = new Map(major.map((r, i) => [r.key, moved[i]]))
  const parts = p.parts.map((r): HomePart => {
    const a = plan.allocations.find((x) => x.key === r.key)
    const homeAmount = a?.amount ?? 0
    const counter = !paidOf.has(r.key)
    const clears = (a?.left ?? 1) === 0
    const rate = p.rates[r.key] ?? 1
    const amount = clears ? r.amount : Math.min(r.amount, convertMinor(homeAmount, p.currency, r.currency, 1 / rate))
    return { key: r.key, amount, paid: paidOf.get(r.key) ?? 0, left: r.amount - amount, counter }
  })
  return { status, payment, parts, clearsAll: parts.every((x) => x.left === 0) }
}

/** Like proportional, but `total` may exceed the weights (a payment a little over, inside the band). */
function spread(total: Cents, weights: Cents[]): Cents[] {
  const sum = weights.reduce((a, w) => a + w, 0)
  if (total <= sum || sum <= 0) return proportional(total, weights)
  const extra = spread(total - sum, weights)
  return weights.map((w, i) => w + extra[i])
}

/**
 * The line under a converted payment, saying what it clears, so a typo shows before it's recorded:
 * "Clears $12.50 in full", "₹4.50 clears $0.05 of $12.50. $12.45 stays owed", "More than the
 * ₹1,045 owed", or nothing to clear yet.
 */
export function payInLine(c: PayCheck, paid: Cents, due: Cents, fmtPay: (m: Cents) => string, fmtGroup: (m: Cents) => string): string {
  if (c.status === 'full')
    return paid === c.expected ? `Clears ${fmtGroup(due)} in full` : `Clears ${fmtGroup(due)} in full (within 4% of ${fmtPay(c.expected)})`
  if (c.status === 'over') return `More than the ${fmtPay(c.expected)} owed. Lower it, or pay the rest separately.`
  if (c.status === 'part') return `${fmtPay(paid)} clears ${fmtGroup(c.cleared)} of ${fmtGroup(due)}. ${fmtGroup(due - c.cleared)} stays owed.`
  return `${fmtPay(c.expected)} clears ${fmtGroup(due)}`
}
