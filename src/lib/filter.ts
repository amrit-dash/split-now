import type { Category, Expense, MemberId, Settlement } from '@/types'

export interface ActivityFilter {
  /** free text, matched case- and accent-insensitively against description and notes */
  q: string
  /** empty = all categories */
  categories: Category[]
  /** only rows the given member paid for, owes on, sent or received */
  involving?: MemberId
}

export const EMPTY_FILTER: ActivityFilter = { q: '', categories: [] }

export const isFiltering = (f: ActivityFilter) => !!f.q.trim() || f.categories.length > 0 || !!f.involving

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

function textMatches(q: string, ...fields: Array<string | undefined>) {
  const terms = norm(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = norm(fields.filter(Boolean).join(' '))
  return terms.every((t) => hay.includes(t))
}

export function expenseMatches(e: Expense, f: ActivityFilter): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) return false
  if (f.involving && !e.paidBy[f.involving] && e.splits[f.involving] === undefined) return false
  return textMatches(f.q, e.description, e.notes)
}

/** Settlements have no category, so a category filter hides them. Text matches the note, method and names. */
export function settlementMatches(s: Settlement, f: ActivityFilter, name: (id: MemberId) => string): boolean {
  if (f.categories.length) return false
  if (f.involving && s.from !== f.involving && s.to !== f.involving) return false
  return textMatches(f.q, s.note, s.method, name(s.from), name(s.to))
}
