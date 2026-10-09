import type { Cents, Expense } from '@/types'
import { formatDate } from './locale'
import { formatMoney } from './money'
import { addDaysISO } from './recents'

/*
 * Duplicate warning for the expense form: SMS capture, statement import, a live table and two
 * people typing the same dinner all create expenses, so before a save the form looks for an
 * expense in the same group with the same amount, a date within a day, and a description made
 * of (roughly) the same words. Advisory only: the user can always save anyway.
 */

const STOP = new Set(['the', 'a', 'an', 'at', 'and', 'of', 'for', 'in', 'on', 'with', 'to', 'from', 'by', 'our', 'my', 'some'])

/** Lower-case word stems without punctuation, accents or filler words ("Dinner at Toit!" → ["dinner", "toit"]). */
export function normaliseTokens(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .map((w) => w.replace(/s$/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
}

/**
 * Two descriptions are "the same" when one's words are all in the other's, or when at least
 * half of the combined words are shared. A description with no words at all (nothing typed
 * yet, or only filler) compares equal to anything: the amount and date carry the warning then.
 */
export function similarDescription(a: string, b: string): boolean {
  const ta = new Set(normaliseTokens(a))
  const tb = new Set(normaliseTokens(b))
  if (!ta.size || !tb.size) return true
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  let shared = 0
  for (const w of small) if (big.has(w)) shared++
  if (shared === small.size) return true
  return shared / (ta.size + tb.size - shared) >= 0.5
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

export interface DuplicateDraft {
  /** minor units of `cur` */
  amount: Cents
  /** the entry currency (a foreign draft is matched against the stored `original`) */
  cur: string
  date: string
  description: string
  /** the expense being edited: never its own duplicate */
  excludeId?: string
}

type Candidate = Pick<Expense, 'id' | 'description' | 'amount' | 'date' | 'createdAt' | 'deletedAt' | 'original' | 'recurrence' | 'recurringFrom'>

/**
 * The most likely duplicate of a draft among the group's expenses, or undefined. Trashed items
 * don't count; repeating templates and their copies are left alone (the same rent every month
 * is expected, not a mistake). Closest date wins, then the newest entry.
 */
export function findDuplicate<E extends Candidate>(expenses: E[], draft: DuplicateDraft, groupCurrency: string): E | undefined {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return undefined
  let best: E | undefined
  let bestDiff = Infinity
  for (const e of expenses) {
    if (e.id === draft.excludeId || typeof e.deletedAt === 'number' || e.recurrence || e.recurringFrom) continue
    const sameAmount = draft.cur === groupCurrency ? e.amount === draft.amount : e.original?.currency === draft.cur && e.original.amount === draft.amount
    if (!sameAmount) continue
    const diff = dayDiff(e.date, draft.date)
    if (!(diff <= 1)) continue
    if (!similarDescription(e.description, draft.description)) continue
    if (diff < bestDiff || (diff === bestDiff && best && e.createdAt > best.createdAt)) {
      best = e
      bestDiff = diff
    }
  }
  return best
}

/** "yesterday", "today", or the date. */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === addDaysISO(today, -1)) return 'yesterday'
  if (date === addDaysISO(today, 1)) return 'tomorrow'
  return formatDate(date, 'day')
}

/** "Looks like a duplicate of “Dinner” (₹1,200.00, yesterday)". */
export function duplicateLine(dup: Pick<Expense, 'description' | 'amount' | 'original' | 'date'>, groupCurrency: string, today: string): string {
  const money = dup.original ? formatMoney(dup.original.amount, dup.original.currency) : formatMoney(dup.amount, groupCurrency)
  return `Looks like a duplicate of “${dup.description}” (${money}, ${relativeDay(dup.date, today)})`
}

/**
 * Inbox "Add all": for each captured payment, the expense it probably already is (same amount,
 * within a day, similar description), keyed by capture id. Captures are in the group's currency.
 */
export function bulkDuplicates<E extends Candidate>(
  captures: Array<{ id: string; amount: Cents; date: string; merchant: string }>,
  expenses: E[],
  groupCurrency: string,
): Map<string, E> {
  const out = new Map<string, E>()
  for (const c of captures) {
    const dup = findDuplicate(expenses, { amount: c.amount, cur: groupCurrency, date: c.date, description: c.merchant }, groupCurrency)
    if (dup) out.set(c.id, dup)
  }
  return out
}
