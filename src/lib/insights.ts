import type { Category, Expense, Group, MemberId } from '@/types'
import { minorDigits } from './money'

/*
 * Pure computation behind the Insights page. Dates are ISO yyyy-mm-dd strings in local time;
 * amounts are integer minor units. Rows carry an amount already in the display currency
 * (the page decides whether that needs an FX conversion), so nothing here mixes currencies.
 */

export type RangePreset = 'month' | '3m' | 'year' | 'all' | 'custom'
export type Basis = 'mine' | 'total'

export interface InsightFilters {
  range: RangePreset
  /** Only for `custom`: inclusive bounds, either may be empty. */
  from?: string
  to?: string
  /** Empty = all categories. */
  categories: Category[]
  basis: Basis
}

export interface Bounds { from: string; to: string }

/** The minimum a source needs: a group, its expenses and which member is me. */
export interface Source { group: Group; expenses: Expense[]; me?: MemberId }

export interface Row {
  e: Expense
  src: Source
  /** The expense's amount on the chosen basis, in the display currency. */
  value: number
  /** What I paid / my share of it, in the display currency (for "paid vs share"). */
  paid: number
  share: number
}

// ---- dates ---------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseISO = (s: string) => new Date(s + 'T00:00:00')
export function addDays(s: string, n: number) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d) }
/** Whole days from a to b, inclusive of both ends (a <= b). */
export function daysBetween(a: string, b: string) { return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000) + 1 }
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/**
 * Inclusive bounds for a preset. `month` and `year` run to today (month / year to date);
 * `all` starts at `earliest` (first expense). Custom bounds fall back to earliest / today.
 */
export function rangeBounds(f: Pick<InsightFilters, 'range' | 'from' | 'to'>, today: string, earliest = today): Bounds {
  const t = parseISO(today)
  switch (f.range) {
    case 'month': return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: today }
    case '3m': return { from: addDays(today, -90), to: today }
    case 'year': return { from: `${t.getFullYear()}-01-01`, to: today }
    case 'all': return { from: earliest < today ? earliest : today, to: today }
    case 'custom': {
      const from = f.from || earliest
      const to = f.to || today
      return from <= to ? { from, to } : { from: to, to: from }
    }
  }
}

/**
 * The period to compare against: the same days of last month / last year for the to-date presets,
 * otherwise the window of equal length just before. None for all-time.
 */
export function previousBounds(range: RangePreset, b: Bounds): Bounds | null {
  if (range === 'all') return null
  const f = parseISO(b.from), t = parseISO(b.to)
  if (range === 'month') {
    const y = f.getMonth() === 0 ? f.getFullYear() - 1 : f.getFullYear()
    const m = (f.getMonth() + 11) % 12
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m, Math.min(t.getDate(), daysInMonth(y, m)))) }
  }
  if (range === 'year') {
    const y = f.getFullYear() - 1
    return { from: `${y}-01-01`, to: iso(new Date(y, t.getMonth(), Math.min(t.getDate(), daysInMonth(y, t.getMonth())))) }
  }
  const n = daysBetween(b.from, b.to)
  return { from: addDays(b.from, -n), to: addDays(b.from, -1) }
}

// ---- rows ----------------------------------------------------------------------------------

/**
 * Every expense of `sources` inside `b` (and the category filter), valued on the basis.
 * Personal groups count the full amount either way (it is all mine). `convert` maps a group-currency
 * amount to the display currency. Rows worth nothing on the basis and nothing paid are dropped.
 */
export function collectRows(sources: Source[], b: Bounds, f: Pick<InsightFilters, 'categories' | 'basis'>, convert: (v: number, s: Source) => number = (v) => v): Row[] {
  const cats = f.categories.length ? new Set(f.categories) : null
  const rows: Row[] = []
  for (const src of sources) {
    const personal = src.group.type === 'personal'
    for (const e of src.expenses) {
      if (e.date < b.from || e.date > b.to) continue
      if (cats && !cats.has(e.category)) continue
      const mine = personal ? e.amount : src.me ? e.splits[src.me] ?? 0 : 0
      const raw = f.basis === 'total' ? e.amount : mine
      const paidRaw = personal ? e.amount : src.me ? e.paidBy[src.me] ?? 0 : 0
      const value = convert(raw, src)
      const paid = convert(paidRaw, src)
      if (value <= 0 && paid <= 0) continue
      rows.push({ e, src, value: Math.max(0, value), paid, share: convert(mine, src) })
    }
  }
  return rows
}

export const sumValue = (rows: Row[]) => rows.reduce((s, r) => s + r.value, 0)
export const counted = (rows: Row[]) => rows.filter((r) => r.value > 0)

// ---- headline numbers ----------------------------------------------------------------------

export interface Headline {
  total: number
  count: number
  /** Per day over the period up to today (a future custom end doesn't dilute it). */
  dailyAvg: number
  days: number
  /** Total of the comparison period, or null when there is none. */
  prevTotal: number | null
  /** Fractional change vs the previous period (0.25 = +25%), null when not meaningful. */
  change: number | null
}

export function headline(rows: Row[], b: Bounds, today: string, prevRows: Row[] | null): Headline {
  const total = sumValue(rows)
  const end = b.to < today ? b.to : today
  const days = end < b.from ? 1 : daysBetween(b.from, end)
  const prevTotal = prevRows ? sumValue(prevRows) : null
  return {
    total,
    count: counted(rows).length,
    dailyAvg: Math.round(total / Math.max(1, days)),
    days,
    prevTotal,
    change: prevTotal ? (total - prevTotal) / prevTotal : null,
  }
}

// ---- categories ----------------------------------------------------------------------------

export interface Slice<K = string> { key: K; value: number; share: number }

/** Totals per category, largest first. */
export function byCategory(rows: Row[]): Slice<Category>[] {
  const m = new Map<Category, number>()
  for (const r of rows) if (r.value > 0) m.set(r.e.category, (m.get(r.e.category) ?? 0) + r.value)
  const total = [...m.values()].reduce((s, v) => s + v, 0) || 1
  return [...m].map(([key, value]) => ({ key, value, share: value / total })).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
}

/**
 * For the donut: the top `keep` slices that have their own chart colour, with the rest (the tail,
 * plus any category without a palette slot) folded into one "other" slice, always last.
 */
export function foldSlices(slices: Slice<Category>[], keep: number, hasColor: (c: Category) => boolean): Array<Slice<Category | 'other-fold'>> {
  const head: Array<Slice<Category | 'other-fold'>> = []
  let rest = 0, restShare = 0
  for (const s of slices) {
    if (head.length < keep && hasColor(s.key)) head.push(s)
    else { rest += s.value; restShare += s.share }
  }
  if (rest > 0) head.push({ key: 'other-fold', value: rest, share: restShare })
  return head
}

// ---- over time -----------------------------------------------------------------------------

export type Bucket = 'day' | 'week' | 'month'
export interface TimePoint { key: string; start: string; end: string; value: number; current: boolean }

export function bucketFor(b: Bounds): Bucket {
  const n = daysBetween(b.from, b.to)
  return n <= 35 ? 'day' : n <= 120 ? 'week' : 'month'
}

/**
 * Spend per bucket over the whole range, empty buckets included (a gap is information).
 * Weeks are 7-day blocks counted back from the range end, so the last one is always complete-to-date.
 * `current` marks the bucket containing today.
 */
export function overTime(rows: Row[], b: Bounds, today: string, bucket = bucketFor(b)): TimePoint[] {
  const pts: TimePoint[] = []
  if (bucket === 'month') {
    const f = parseISO(b.from), t = parseISO(b.to)
    for (let y = f.getFullYear(), m = f.getMonth(); y < t.getFullYear() || (y === t.getFullYear() && m <= t.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      const start = iso(new Date(y, m, 1)), end = iso(new Date(y, m, daysInMonth(y, m)))
      pts.push({ key: start.slice(0, 7), start, end, value: 0, current: today >= start && today <= end })
    }
  } else if (bucket === 'week') {
    for (let end = b.to; end >= b.from; end = addDays(end, -7)) {
      const s = addDays(end, -6)
      const start = s < b.from ? b.from : s
      pts.unshift({ key: start, start, end, value: 0, current: today >= start && today <= end })
    }
  } else {
    for (let d = b.from; d <= b.to; d = addDays(d, 1)) pts.push({ key: d, start: d, end: d, value: 0, current: d === today })
  }
  for (const r of rows) {
    const p = pts.find((x) => r.e.date >= x.start && r.e.date <= x.end)
    if (p) p.value += r.value
  }
  return pts
}

export interface PacePoint { day: number; thisMonth?: number; lastMonth?: number }

/**
 * Cumulative spend by day of month: this month up to today, last month in full. Answers
 * "am I spending faster than last month?". `rows` must cover both months.
 */
export function monthPace(rows: Row[], today: string): { points: PacePoint[]; thisTotal: number; lastToDate: number; lastTotal: number } {
  const t = parseISO(today)
  const ty = t.getFullYear(), tm = t.getMonth()
  const ly = tm === 0 ? ty - 1 : ty, lm = (tm + 11) % 12
  const thisKey = `${ty}-${pad(tm + 1)}`, lastKey = `${ly}-${pad(lm + 1)}`
  const len = Math.max(daysInMonth(ty, tm), daysInMonth(ly, lm))
  const a = new Array(len + 1).fill(0), c = new Array(len + 1).fill(0)
  for (const r of rows) {
    const k = r.e.date.slice(0, 7), day = Number(r.e.date.slice(8, 10))
    if (k === thisKey) a[day] += r.value
    else if (k === lastKey) c[day] += r.value
  }
  const points: PacePoint[] = []
  let sa = 0, sc = 0
  for (let day = 1; day <= len; day++) {
    sa += a[day]; sc += c[day]
    points.push({
      day,
      thisMonth: day <= t.getDate() ? sa : undefined,
      lastMonth: day <= daysInMonth(ly, lm) ? sc : undefined,
    })
  }
  const lastToDate = points[Math.min(t.getDate(), daysInMonth(ly, lm)) - 1]?.lastMonth ?? 0
  return { points, thisTotal: sa, lastToDate, lastTotal: sc }
}

// ---- groups & people -----------------------------------------------------------------------

export interface GroupTotal { id: string; name: string; emoji: string; value: number; paid: number; share: number }

/** Per group: spend on the basis, and what I paid vs my share (for non-personal groups). */
export function byGroup(rows: Row[]): GroupTotal[] {
  const m = new Map<string, GroupTotal>()
  for (const r of rows) {
    const g = r.src.group
    const t = m.get(g.id) ?? { id: g.id, name: g.name, emoji: g.emoji, value: 0, paid: 0, share: 0 }
    t.value += r.value
    if (g.type !== 'personal') { t.paid += r.paid; t.share += r.share }
    m.set(g.id, t)
  }
  return [...m.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export interface MemberTotal { id: MemberId; name: string; color: string; paid: number; share: number; me: boolean }

/** One group: what each member fronted vs consumed over the rows (group currency). */
export function paidVsShare(src: Source, rows: Row[]): MemberTotal[] {
  const out: MemberTotal[] = Object.entries(src.group.members).map(([id, m]) => ({ id, name: m.name, color: m.color, paid: 0, share: 0, me: id === src.me }))
  const idx = new Map(out.map((m, i) => [m.id, i]))
  for (const r of rows) {
    if (r.src !== src) continue
    for (const [id, v] of Object.entries(r.e.paidBy)) { const i = idx.get(id); if (i !== undefined) out[i].paid += v }
    for (const [id, v] of Object.entries(r.e.splits)) { const i = idx.get(id); if (i !== undefined) out[i].share += v }
  }
  return out.filter((m) => m.paid || m.share).sort((a, b) => Number(b.me) - Number(a.me) || b.share - a.share)
}

// ---- formatting ----------------------------------------------------------------------------

/**
 * Short axis label: ₹1.2k / ₹3.4L / ₹1.1Cr for INR (Indian units read better than Intl's en-IN
 * "T" for thousand), $1.2k / $3.4M otherwise.
 */
export function compactMoney(minor: number, currency: string, symbol: string): string {
  const v = minor / 10 ** minorDigits(currency)
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  const units: Array<[number, string]> = currency === 'INR' ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'k']] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]
  for (const [n, u] of units) {
    if (a >= n) {
      const x = a / n
      return `${sign}${symbol}${x >= 100 ? Math.round(x) : Number(x.toFixed(1))}${u}`
    }
  }
  return `${sign}${symbol}${Math.round(a)}`
}

/** "+12%" / "−8%" / "±0%" for a fractional change. */
export function formatChange(change: number): string {
  const p = Math.round(change * 100)
  return p === 0 ? '±0%' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`
}
