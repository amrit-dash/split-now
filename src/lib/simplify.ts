import type { Cents, Debt, MemberId } from '@/types'

/**
 * Greedy minimum-cash-flow simplification. Repeatedly settles the largest debtor
 * against the largest creditor. Produces at most n-1 transfers and preserves every
 * member's net balance exactly. Ties break by member id, so the result is deterministic.
 *
 * Both sides are sorted once; after a transfer the side that still has a remainder is
 * re-inserted at its new place (the lists stay sorted), so this is O(n log n) rather than
 * a sort per transfer.
 */
export function simplifyDebts(net: Record<MemberId, Cents>): Debt[] {
  type Side = { m: string; v: number }
  const byAmount = (a: Side, b: Side) => b.v - a.v || a.m.localeCompare(b.m)
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([m, v]) => ({ m, v }))
    .sort(byAmount)
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([m, v]) => ({ m, v: -v }))
    .sort(byAmount)
  const reinsert = (list: Side[], x: Side) => {
    let i = 0
    while (i < list.length && byAmount(list[i], x) < 0) i++
    list.splice(i, 0, x)
  }
  const out: Debt[] = []
  while (creditors.length && debtors.length) {
    const c = creditors.shift()!
    const d = debtors.shift()!
    const amt = Math.min(c.v, d.v)
    out.push({ from: d.m, to: c.m, amount: amt })
    c.v -= amt
    d.v -= amt
    if (c.v > 0) reinsert(creditors, c)
    if (d.v > 0) reinsert(debtors, d)
  }
  return out
}
