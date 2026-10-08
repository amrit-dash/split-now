import type { Cents, MemberId, SplitInput, SplitType } from '@/types'
import { formatMoney } from './money'

/**
 * Distribute `total` cents across members by weight using the largest-remainder method.
 * Result always sums exactly to `total`. Ties are broken by member order (deterministic).
 * Weights that aren't finite and positive are ignored (Infinity would make every share NaN).
 */
export function allocate(total: Cents, weights: Array<[MemberId, number]>): Record<MemberId, Cents> {
  const finite = weights.filter(([, w]) => Number.isFinite(w) && w > 0)
  const out: Record<MemberId, Cents> = {}
  if (finite.length === 0 || total === 0) return out
  // Scaled to (0, 1] so huge weights can't overflow the sum (1e308 + 1e308 = Infinity).
  const max = finite.reduce((m, [, w]) => Math.max(m, w), 0)
  const positive = finite.map(([id, w]) => [id, w / max] as [MemberId, number])
  const sum = positive.reduce((s, [, w]) => s + w, 0)
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const raw = positive.map(([id, w], i) => {
    const exact = (abs * w) / sum
    const floor = Math.floor(exact + 1e-9)
    return { id, floor, rem: exact - floor, i }
  })
  let left = abs - raw.reduce((s, r) => s + r.floor, 0)
  const order = [...raw].sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const r of order) {
    if (left <= 0) break
    r.floor += 1
    left -= 1
  }
  for (const r of raw) out[r.id] = sign * r.floor
  return out
}

export class SplitError extends Error {}

const sumOf = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

/**
 * Who owes what for an expense of `total` minor units. Throws SplitError (a message the form
 * shows next to the split) when the input can't produce a split that adds up: a negative or
 * non-finite amount, an item assigned to nobody still in the group, exact amounts or percentages
 * that don't match. `currency` is only used to word those messages.
 */
export function computeSplits(
  total: Cents,
  type: SplitType,
  input: SplitInput,
  memberOrder: MemberId[],
  currency?: string,
): Record<MemberId, Cents> {
  const out = splitsFor(total, type, input, memberOrder, currency)
  // Every branch is meant to allocate exactly; this catches a regression before it is stored.
  for (const v of Object.values(out)) if (!Number.isFinite(v) || !Number.isInteger(v)) throw new SplitError('The split doesn’t add up to the total')
  if (sumOf(out) !== total) throw new SplitError('The split doesn’t add up to the total')
  return out
}

function splitsFor(total: Cents, type: SplitType, input: SplitInput, memberOrder: MemberId[], currency?: string): Record<MemberId, Cents> {
  const ordered = <T>(rec: Record<MemberId, T> | undefined) =>
    memberOrder.filter((m) => rec && rec[m] !== undefined).map((m) => [m, rec![m]] as [MemberId, T])
  const money = (c: Cents) => (currency ? formatMoney(c, currency) : (c / 100).toFixed(2))
  const finite = (entries: Array<[MemberId, number]>, what: string) => {
    for (const [, v] of entries) {
      if (!Number.isFinite(v)) throw new SplitError(`Enter a number for every ${what}`)
      if (v < 0) throw new SplitError(`${what[0].toUpperCase()}${what.slice(1)}s can’t be negative`)
    }
    return entries
  }

  switch (type) {
    case 'equal': {
      const sel = memberOrder.filter((m) => input.selected?.includes(m))
      if (sel.length === 0) throw new SplitError('Select at least one person')
      return allocate(total, sel.map((m) => [m, 1]))
    }
    case 'exact': {
      const entries = finite(ordered(input.exact), 'amount').filter(([, v]) => v !== 0)
      const sum = entries.reduce((s, [, v]) => s + v, 0)
      if (sum !== total) throw new SplitError(`Amounts add up to ${money(sum)}, not ${money(total)}`)
      return Object.fromEntries(entries)
    }
    case 'percent': {
      const entries = finite(ordered(input.percent), 'percentage').filter(([, v]) => v > 0)
      const sum = entries.reduce((s, [, v]) => s + v, 0)
      if (Math.abs(sum - 100) > 0.001) throw new SplitError(`Percentages add up to ${round2(sum)}%, not 100%`)
      return allocate(total, entries)
    }
    case 'shares': {
      const entries = finite(ordered(input.shares), 'share').filter(([, v]) => v > 0)
      if (entries.length === 0) throw new SplitError('Give at least one person a share')
      return allocate(total, entries)
    }
    case 'adjust': {
      const sel = memberOrder.filter((m) => input.selected?.includes(m))
      if (sel.length === 0) throw new SplitError('Select at least one person')
      const adj = input.adjust ?? {}
      for (const m of sel) if (!Number.isFinite(adj[m] ?? 0)) throw new SplitError('Enter a number for every adjustment')
      const adjSum = sel.reduce((s, m) => s + (adj[m] ?? 0), 0)
      const base = allocate(total - adjSum, sel.map((m) => [m, 1]))
      const out: Record<MemberId, Cents> = {}
      for (const m of sel) {
        const v = (base[m] ?? 0) + (adj[m] ?? 0)
        if (v < 0) throw new SplitError('An adjustment makes someone’s share negative')
        if (v !== 0) out[m] = v
      }
      return out
    }
    case 'itemized': {
      const items = input.items ?? []
      if (items.length === 0) throw new SplitError('Add at least one item')
      for (const it of items) {
        if (!Number.isFinite(it.amount)) throw new SplitError(`Enter an amount for “${it.name || 'every item'}”`)
        if (it.amount < 0) throw new SplitError('Item amounts can’t be negative')
      }
      const itemTotal = items.reduce((s, it) => s + it.amount, 0)
      if (items.some((it) => it.members.length === 0)) throw new SplitError('Assign every item to someone')
      // Each item split among its members, equally or by portions.
      const sub: Record<MemberId, Cents> = {}
      for (const it of items) {
        const ms = memberOrder.filter((m) => it.members.includes(m))
        // An item whose people have all left the group would silently vanish from the total.
        if (!ms.length && it.amount) throw new SplitError(`“${it.name || 'An item'}” is assigned to someone who left the group`)
        const part = allocate(it.amount, ms.map((m) => [m, portion(it, m)]))
        for (const [m, v] of Object.entries(part)) sub[m] = (sub[m] ?? 0) + v
      }
      // Tax / tip / discount (difference between total and items) spread proportionally.
      const extra = total - itemTotal
      if (extra === 0) return sub
      if (itemTotal <= 0) throw new SplitError('Items must have a positive total')
      const extraParts = allocate(extra, memberOrder.filter((m) => sub[m]).map((m) => [m, sub[m]]))
      const out: Record<MemberId, Cents> = {}
      for (const m of memberOrder) {
        const v = (sub[m] ?? 0) + (extraParts[m] ?? 0)
        if (v) out[m] = v
      }
      return out
    }
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** A member's portions of an item: whole numbers 1..20, default 1. */
export function portion(it: { shares?: Record<string, number> }, m: string): number {
  const s = it.shares?.[m]
  return typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 20 ? s : 1
}
