import type { Category, Expense, MemberId, Settlement } from '@/types'

export interface ActivityFilter {
  /** free text, matched case- and accent-insensitively against description and notes */
  q: string
  /** empty = all categories */
  categories: Category[]
  /** only rows the given member paid for, owes on, sent or received */
  involving?: MemberId
  /** expenses only, payments only, or both (default) */
  kind?: RowKind
  /** expenses this member paid for (any share), payments they made */
  paidBy?: MemberId
  /** spent (or paid) on or after / on or before, local ISO days */
  from?: string
  to?: string
}

export type RowKind = 'all' | 'expenses' | 'payments'

export const EMPTY_FILTER: ActivityFilter = { q: '', categories: [] }

export const isFiltering = (f: ActivityFilter) =>
  !!f.q.trim() || f.categories.length > 0 || !!f.involving || (!!f.kind && f.kind !== 'all') || !!f.paidBy || !!f.from || !!f.to

/** How many of the sheet's own filters are on (the dot and count on the sort-and-filter button). */
export const sheetFilterCount = (f: ActivityFilter) => [f.kind && f.kind !== 'all', f.paidBy, f.from || f.to].filter(Boolean).length

const inRange = (date: string, f: ActivityFilter) => (!f.from || date >= f.from) && (!f.to || date <= f.to)

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

function textMatches(q: string, ...fields: Array<string | undefined>) {
  const terms = norm(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = norm(fields.filter(Boolean).join(' '))
  return terms.every((t) => hay.includes(t))
}

export function expenseMatches(e: Expense, f: ActivityFilter): boolean {
  if (f.kind === 'payments') return false
  if (f.paidBy && !e.paidBy[f.paidBy]) return false
  if (!inRange(e.date, f)) return false
  if (f.categories.length && !f.categories.includes(e.category)) return false
  if (f.involving && !e.paidBy[f.involving] && e.splits[f.involving] === undefined) return false
  return textMatches(f.q, e.description, e.notes)
}

/** Settlements have no category, so a category filter hides them. Text matches the note, method and names. */
export function settlementMatches(s: Settlement, f: ActivityFilter, name: (id: MemberId) => string): boolean {
  if (f.categories.length || f.kind === 'expenses') return false
  if (f.paidBy && s.from !== f.paidBy) return false
  if (!inRange(s.date, f)) return false
  if (f.involving && s.from !== f.involving && s.to !== f.involving) return false
  return textMatches(f.q, s.note, s.method, name(s.from), name(s.to))
}

// ---- Sort ---------------------------------------------------------------------------------

/**
 * How the group's list is ordered. "Spent" is the date on the expense (or the day a payment was
 * made); "added" is when it was written into the app (createdAt), which can be days later.
 */
export type SortKey = 'spent-desc' | 'spent-asc' | 'added-desc' | 'added-asc' | 'amount-desc' | 'amount-asc'
export const DEFAULT_SORT: SortKey = 'spent-desc'
export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'spent-desc', label: 'Date spent, newest first' },
  { value: 'spent-asc', label: 'Date spent, oldest first' },
  { value: 'added-desc', label: 'Date added, newest first' },
  { value: 'added-asc', label: 'Date added, oldest first' },
  { value: 'amount-desc', label: 'Amount, biggest first' },
  { value: 'amount-asc', label: 'Amount, smallest first' },
]
export const isSortKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.value === v)

export interface SortableRow {
  /** local ISO day spent or paid */
  date: string
  /** epoch ms it was added */
  createdAt: number
  /** minor units of the group currency */
  amount: number
}

/** Ordered by `key`; ties fall back to the newest added, so the order is stable. */
export function sortRows<T extends SortableRow>(rows: T[], key: SortKey): T[] {
  const added = (a: T, b: T) => b.createdAt - a.createdAt
  const cmp: Record<SortKey, (a: T, b: T) => number> = {
    'spent-desc': (a, b) => b.date.localeCompare(a.date) || added(a, b),
    'spent-asc': (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
    'added-desc': added,
    'added-asc': (a, b) => a.createdAt - b.createdAt,
    'amount-desc': (a, b) => b.amount - a.amount || added(a, b),
    'amount-asc': (a, b) => a.amount - b.amount || added(a, b),
  }
  return [...rows].sort(cmp[key])
}

/**
 * The list's sections: by the month spent, by the month added ("Added in October 2026"), or
 * none for an amount order (months would break up the ranking). Sections keep the rows' order.
 */
export function sectionRows<T extends SortableRow>(rows: T[], key: SortKey, month: (d: string | number) => string): Array<{ label: string; rows: T[] }> {
  if (key.startsWith('amount')) return rows.length ? [{ label: key === 'amount-desc' ? 'Biggest first' : 'Smallest first', rows }] : []
  const byAdded = key.startsWith('added')
  const out: Array<{ label: string; rows: T[] }> = []
  for (const r of rows) {
    const label = byAdded ? `Added in ${month(r.createdAt)}` : month(r.date)
    const last = out[out.length - 1]
    if (last?.label === label) last.rows.push(r)
    else out.push({ label, rows: [r] })
  }
  return out
}

/** Days between the date spent and the day it was added, when it was added later (shown as "added 3 Oct"). */
export function addedLater(row: Pick<SortableRow, 'date' | 'createdAt'>, dayOf: (ms: number) => string): string | null {
  const added = dayOf(row.createdAt)
  return added > row.date ? added : null
}
