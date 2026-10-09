import type { Cents } from '@/types'

/*
 * Settling with one person across several groups (same currency) in one go.
 *
 * Each group's balance with them is a signed amount: > 0 they owe you there, < 0 you owe them.
 * Their sum is the net: the one real payment that clears everything. The person can pay less
 * (a partial payment); this decides what to record in each group:
 *
 *  1. Groups that run against the net direction ("counter" groups) are always cleared in full:
 *     those balances cancel out against the others and need no money to move.
 *  2. The groups that run with the net share what the payment covers plus what the counter
 *     groups cancelled, in proportion to each group's balance (largest-remainder rounding to the
 *     minor unit, so the parts add up exactly and none goes past its balance).
 *
 * Proportional, not "oldest/largest first": a partial payment lowers every group by the same
 * share instead of picking winners, it doesn't depend on any ordering, and the breakdown moves
 * smoothly as the total is edited. Paying the full net clears every group exactly.
 *
 * Every recorded amount stays in its group's own direction, so the signed recorded amounts add
 * up to the payment (in the net direction).
 */

export interface MultiPart {
  key: string /** > 0: they owe you in this group */
  signed: Cents
}

export interface MultiAllocation {
  key: string
  /** what to record in this group, in that group's own direction; 0 = nothing */
  amount: Cents
  /** balance left in this group afterwards (same direction, >= 0) */
  left: Cents
}

export interface MultiPlan {
  /** sum of the parts: > 0 they pay you, < 0 you pay them */
  net: Cents
  /** the payment used (clamped to 0…|net|) */
  payment: Cents
  allocations: MultiAllocation[]
  /** every group ends at zero */
  clearsAll: boolean
}

export function allocateAcrossGroups(parts: MultiPart[], payment: Cents): MultiPlan {
  const net = parts.reduce((s, p) => s + p.signed, 0)
  const pay = net === 0 ? 0 : Math.max(0, Math.min(Math.round(payment) || 0, Math.abs(net)))
  const dir = Math.sign(net)
  const out = new Map<string, Cents>()

  // Net 0: everything cancels out; with the net direction, counter groups clear in full.
  const major = dir === 0 ? [] : parts.filter((p) => Math.sign(p.signed) === dir)
  for (const p of parts) if (!major.includes(p)) out.set(p.key, Math.abs(p.signed))
  const counter = parts.filter((p) => !major.includes(p)).reduce((s, p) => s + Math.abs(p.signed), 0)

  const weights = major.map((p) => Math.abs(p.signed))
  const shares = proportional(counter + pay, weights)
  major.forEach((p, i) => {
    out.set(p.key, shares[i])
  })

  const allocations = parts.map((p) => {
    const amount = out.get(p.key) ?? 0
    return { key: p.key, amount, left: Math.abs(p.signed) - amount }
  })
  return { net, payment: pay, allocations, clearsAll: allocations.every((a) => a.left === 0) }
}

/**
 * Split `total` (<= sum of weights) in proportion to integer `weights`: floors first, then the
 * leftover units to the largest remainders (ties to the earlier one). BigInt so large balances
 * can't lose precision in total × weight.
 */
export function proportional(total: Cents, weights: Cents[]): Cents[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  if (total >= sum) return [...weights]
  const T = BigInt(total),
    S = BigInt(sum)
  const base = weights.map((w) => (T * BigInt(w)) / S)
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % S }))
  let left = total - base.reduce((s, b) => s + Number(b), 0)
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  const res = base.map(Number)
  for (const { i, r } of rem) {
    if (left <= 0) break
    if (r === 0n) continue
    res[i] += 1
    left -= 1
  }
  return res
}
