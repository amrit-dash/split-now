import type { Cents, MemberId, SplitInput, SplitType } from '@/types'

/**
 * Distribute `total` cents across members by weight using the largest-remainder method.
 * Result always sums exactly to `total`. Ties are broken by member order (deterministic).
 */
export function allocate(total: Cents, weights: Array<[MemberId, number]>): Record<MemberId, Cents> {
  const positive = weights.filter(([, w]) => w > 0)
  const out: Record<MemberId, Cents> = {}
  if (positive.length === 0 || total === 0) return out
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

export function computeSplits(
  total: Cents,
  type: SplitType,
  input: SplitInput,
  memberOrder: MemberId[],
): Record<MemberId, Cents> {
  const ordered = <T>(rec: Record<MemberId, T> | undefined) =>
    memberOrder.filter((m) => rec && rec[m] !== undefined).map((m) => [m, rec![m]] as [MemberId, T])

  switch (type) {
    case 'equal': {
      const sel = memberOrder.filter((m) => input.selected?.includes(m))
      if (sel.length === 0) throw new SplitError('Select at least one person')
      return allocate(total, sel.map((m) => [m, 1]))
    }
    case 'exact': {
      const entries = ordered(input.exact).filter(([, v]) => v !== 0)
      const sum = entries.reduce((s, [, v]) => s + v, 0)
      if (sum !== total) throw new SplitError(`Amounts add up to ${(sum / 100).toFixed(2)}, not ${(total / 100).toFixed(2)}`)
      return Object.fromEntries(entries)
    }
    case 'percent': {
      const entries = ordered(input.percent).filter(([, v]) => v > 0)
      const sum = entries.reduce((s, [, v]) => s + v, 0)
      if (Math.abs(sum - 100) > 0.001) throw new SplitError(`Percentages add up to ${round2(sum)}%, not 100%`)
      return allocate(total, entries)
    }
    case 'shares': {
      const entries = ordered(input.shares).filter(([, v]) => v > 0)
      if (entries.length === 0) throw new SplitError('Give at least one person a share')
      return allocate(total, entries)
    }
    case 'adjust': {
      const sel = memberOrder.filter((m) => input.selected?.includes(m))
      if (sel.length === 0) throw new SplitError('Select at least one person')
      const adj = input.adjust ?? {}
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
      const itemTotal = items.reduce((s, it) => s + it.amount, 0)
      if (items.some((it) => it.members.length === 0)) throw new SplitError('Assign every item to someone')
      // Each item split among its members, equally or by portions.
      const sub: Record<MemberId, Cents> = {}
      for (const it of items) {
        const part = allocate(it.amount, memberOrder.filter((m) => it.members.includes(m)).map((m) => [m, portion(it, m)]))
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
