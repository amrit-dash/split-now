import type { Cents, Debt, MemberId } from '@/types'

/**
 * Greedy minimum-cash-flow simplification. Repeatedly settles the largest debtor
 * against the largest creditor. Produces at most n-1 transfers and preserves every
 * member's net balance exactly.
 */
export function simplifyDebts(net: Record<MemberId, Cents>): Debt[] {
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([m, v]) => ({ m, v }))
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v }))
  const out: Debt[] = []
  const byAmount = (a: { m: string; v: number }, b: { m: string; v: number }) => b.v - a.v || a.m.localeCompare(b.m)
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount)
    debtors.sort(byAmount)
    const c = creditors[0]
    const d = debtors[0]
    const amt = Math.min(c.v, d.v)
    out.push({ from: d.m, to: c.m, amount: amt })
    c.v -= amt
    d.v -= amt
    if (c.v === 0) creditors.shift()
    if (d.v === 0) debtors.shift()
  }
  return out
}
