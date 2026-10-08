import type { Category, Expense, Group, MemberId } from '@/types'
import { CATEGORIES } from './categories'
import { chartFolds } from './chartPalette'
import { todayISO } from './id'
import { addDaysISO } from './recents'
import { formatDate } from './locale'

/*
 * The numbers behind the Insights screen. Everything works on ISO date strings (yyyy-mm-dd) and
 * never converts them to Date objects, so a month is the calendar month the user wrote the
 * expense in, whatever the time zone (toISOString() would shift IST evenings into the next UTC
 * day and local midnight on the 1st into the previous month).
 */

export type Period = '1m' | '3m' | '12m' | 'all'
export type Basis = 'mine' | 'total'

export const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '1m', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
]

/** `?p=` → period, `?b=` → basis; anything else is the default. */
export const parsePeriod = (v: string | null | undefined): Period => (v === '1m' || v === '3m' || v === '12m' || v === 'all' ? v : '3m')
export const parseBasis = (v: string | null | undefined): Basis => (v === 'total' ? 'total' : 'mine')

/** Length of a period in days (4 full weeks for the short one, so no bucket is a stub). */
export const periodDays = (p: Period): number => (p === '1m' ? 28 : p === '3m' ? 91 : p === '12m' ? 365 : Infinity)

/** The slice of GroupData the computation needs (tests pass plain objects). */
export interface InsightGroup {
  group: Pick<Group, 'id' | 'name' | 'emoji' | 'type' | 'currency' | 'members' | 'budget' | 'startDate' | 'endDate'>
  expenses: Expense[]
  me?: MemberId
}

export interface InsightRow<G extends InsightGroup = InsightGroup> {
  e: Expense
  d: G
  v: number
}
export interface SeriesPoint {
  key: string
  label: string
  value: number
}

export interface InsightStats<G extends InsightGroup = InsightGroup> {
  total: number
  count: number
  /** the same total for the period before this one; null for "all time" */
  prevTotal: number | null
  cats: Array<{ cat: Category | 'other-fold'; label: string; value: number }>
  bucket: 'week' | 'month'
  series: SeriesPoint[]
  /** single group: what each member paid vs what they consumed (every expense in the period) */
  members: Array<{ id: MemberId; name: string; paid: number; share: number }>
  /** several groups: who you shared the most spending with (your share of expenses you were both in) */
  people: Array<{ key: string; name: string; value: number }>
  top: InsightRow<G>[]
  /** single group with a budget: spend run-up over the group's life, against the budget */
  budget: { budget: number; spent: number; points: SeriesPoint[] } | null
}

const ym = (iso: string) => iso.slice(0, 7)
const nextMonth = (k: string) => {
  const [y, m] = k.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
/** Days since the epoch for an ISO date, with no time zone involved. */
export const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** The value an expense contributes: the whole amount, or your share (always the whole for a personal wallet). */
function contribution(e: Expense, d: InsightGroup, basis: Basis): number {
  return basis === 'total' || d.group.type === 'personal' ? e.amount : d.me ? (e.splits[d.me] ?? 0) : 0
}

export function compute<G extends InsightGroup>(
  scope: G[],
  period: Period,
  basis: Basis,
  toHome?: (v: number, d: G) => number,
  today = todayISO(),
): InsightStats<G> {
  const days = periodDays(period)
  const cutoff = days === Infinity ? '' : addDaysISO(today, -(days - 1))
  const prevCutoff = days === Infinity ? '' : addDaysISO(cutoff, -days)
  const conv = (v: number, d: G) => (toHome ? toHome(v, d) : v)

  const rows: InsightRow<G>[] = []
  let prevTotal = 0
  for (const d of scope) {
    for (const e of d.expenses) {
      if (e.date > today) continue
      const v = conv(contribution(e, d, basis), d)
      if (e.date >= cutoff) {
        if (v > 0) rows.push({ e, d, v })
      } else if (days !== Infinity && e.date >= prevCutoff && v > 0) prevTotal += v
    }
  }
  const total = rows.reduce((s, r) => s + r.v, 0)

  // Categories (non-palette ones fold into "Other", which always sorts last).
  const byCat = new Map<Category | 'other-fold', number>()
  for (const r of rows) {
    const k = chartFolds(r.e.category) ? 'other-fold' : r.e.category
    byCat.set(k, (byCat.get(k) ?? 0) + r.v)
  }
  const cats = [...byCat]
    .map(([cat, value]) => ({ cat, value, label: cat === 'other-fold' ? 'Other' : CATEGORIES[cat].label }))
    .sort((a, b) => (a.cat === 'other-fold' ? 1 : b.cat === 'other-fold' ? -1 : b.value - a.value))

  // Time series: four weeks for the short period, else calendar months from the first expense.
  const bucket: 'week' | 'month' = period === '1m' ? 'week' : 'month'
  const series: SeriesPoint[] = []
  if (bucket === 'month') {
    const first = rows.length ? rows.reduce((m, r) => (r.e.date < m ? r.e.date : m), today) : today
    const start = cutoff && cutoff > first ? ym(cutoff) : ym(first)
    const end = ym(today)
    const spansYears = start.slice(0, 4) !== end.slice(0, 4)
    const at = new Map<string, SeriesPoint>()
    for (let k = start; k <= end; k = nextMonth(k)) {
      const p = { key: k, label: formatDate(`${k}-01`, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' }), value: 0 }
      at.set(k, p)
      series.push(p)
    }
    for (const r of rows) {
      const s = at.get(ym(r.e.date))
      if (s) s.value += r.v
    }
  } else {
    const todayN = dayNumber(today)
    const weeks = 4
    for (let i = weeks - 1; i >= 0; i--) {
      const startIso = addDaysISO(today, -(i * 7 + 6))
      series.push({ key: startIso, label: formatDate(startIso, { day: 'numeric', month: 'short' }), value: 0 })
    }
    for (const r of rows) {
      const age = Math.floor((todayN - dayNumber(r.e.date)) / 7)
      const s = series[weeks - 1 - Math.min(weeks - 1, Math.max(0, age))]
      if (s) s.value += r.v
    }
  }

  // Paid vs share per member (one group), over every expense in the period, whatever the basis.
  const members: InsightStats<G>['members'] = []
  if (scope.length === 1 && scope[0].group.type !== 'personal') {
    const d = scope[0]
    const inPeriod = d.expenses.filter((e) => e.date >= cutoff && e.date <= today)
    for (const [id, m] of Object.entries(d.group.members)) {
      let paid = 0,
        share = 0
      for (const e of inPeriod) {
        paid += e.paidBy[id] ?? 0
        share += e.splits[id] ?? 0
      }
      if (paid || share) members.push({ id, name: id === d.me ? 'You' : m.name.split(' ')[0], paid, share })
    }
    members.sort((a, b) => b.paid + b.share - (a.paid + a.share))
  }

  // Who you spend with (several groups): your value of each expense, credited to everyone else in its split.
  const people: InsightStats<G>['people'] = []
  if (scope.length > 1) {
    const by = new Map<string, { name: string; value: number }>()
    for (const r of rows) {
      if (!r.d.me || r.d.group.type === 'personal' || !(r.d.me in r.e.splits)) continue
      for (const id of Object.keys(r.e.splits)) {
        if (id === r.d.me) continue
        const m = r.d.group.members[id]
        if (!m) continue
        const key = m.uid ? `u:${m.uid}` : `n:${m.name.trim().toLowerCase()}`
        const p = by.get(key) ?? { name: m.name, value: 0 }
        p.value += r.v
        by.set(key, p)
      }
    }
    people.push(
      ...[...by]
        .map(([key, p]) => ({ key, ...p }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    )
  }

  // Budget run-up: cumulative group spend by date over the group's whole life (budgets are per group, not per period).
  let budget: InsightStats<G>['budget'] = null
  const budgetOf = scope.length === 1 ? scope[0].group.budget : undefined
  if (budgetOf) {
    const d = scope[0]
    const byDate = new Map<string, number>()
    for (const e of d.expenses) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount)
    const dates = [...byDate.keys()].sort()
    const points: SeriesPoint[] = []
    const startIso = d.group.startDate && (!dates[0] || d.group.startDate < dates[0]) ? d.group.startDate : undefined
    if (startIso) points.push({ key: startIso, label: formatDate(startIso), value: 0 })
    let run = 0
    for (const date of dates) {
      run += byDate.get(date)!
      points.push({ key: date, label: formatDate(date), value: run })
    }
    budget = { budget: budgetOf, spent: run, points }
  }

  return {
    total,
    count: rows.length,
    prevTotal: days === Infinity ? null : prevTotal,
    cats,
    bucket,
    series,
    members,
    people,
    top: [...rows].sort((a, b) => b.v - a.v).slice(0, 5),
    budget,
  }
}

/** "+12%" / "−8%" against the previous period, or null when there is nothing to compare with. */
export function deltaPercent(total: number, prevTotal: number | null): number | null {
  if (prevTotal === null || prevTotal <= 0) return null
  return Math.round(((total - prevTotal) / prevTotal) * 100)
}
