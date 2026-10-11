import type { Category, Cents, Expense, MemberId, OpenItem } from '@/types'
import { guessCategory } from './categories'
import { formatMoney } from './money'
import { formatDate } from './locale'
import { parseNlExpense, type NlContext, type QuickPrefill } from './nl-expense'

/*
 * Open items: something the group spent that nobody has added yet ("Lunch at Cafe Blue, 2 Oct,
 * who paid?"). Anyone writes one down; anyone claims it, which opens Add expense prefilled (paid
 * by them, split equally among everyone, as a starting point they can change). Saving the expense
 * claims the item in the same write (repo.saveExpense with `claim`).
 *
 * A claimed item lives on as an expense. When that expense is deleted the item counts as open
 * again, so it reappears under Open items without anything being written: its state is derived
 * here from the item and the group's expenses.
 */

export type OpenItemState = 'open' | 'claimed' | 'deleted'

/**
 * How long a claimed item whose expense this device can't see still counts as claimed. The item
 * and the expense arrive through two listeners and can be a moment apart; after that, a missing
 * expense was deleted for good and the item is open again.
 */
export const CLAIM_SETTLE_MS = 60_000

export function openItemState(item: OpenItem, expenses: ReadonlyMap<string, Pick<Expense, 'deletedAt'>> | null, now = Date.now()): OpenItemState {
  if (typeof item.deletedAt === 'number') return 'deleted'
  if (item.status !== 'claimed' || !item.expenseId) return 'open'
  // Expenses still loading: don't flash a claimed item back as open.
  if (!expenses) return 'claimed'
  const e = expenses.get(item.expenseId)
  if (e) return typeof e.deletedAt === 'number' ? 'open' : 'claimed'
  return now - (item.claimedAt ?? item.updatedAt) < CLAIM_SETTLE_MS ? 'claimed' : 'open'
}

export interface SortedOpenItems {
  /** newest date first; undated ones by when they were written down */
  open: OpenItem[]
  /** most recently claimed first */
  claimed: OpenItem[]
}

/** The Open tab's two lists. Deleted items are left out. */
export function sortOpenItems(items: OpenItem[] | null, expenses: Expense[] | null, now = Date.now()): SortedOpenItems {
  const byId = expenses ? new Map(expenses.map((e) => [e.id, e])) : null
  const open: OpenItem[] = []
  const claimed: OpenItem[] = []
  for (const it of items ?? []) {
    const s = openItemState(it, byId, now)
    if (s === 'open') open.push(it)
    else if (s === 'claimed') claimed.push(it)
  }
  const day = (it: OpenItem) => it.date ?? ''
  open.sort((a, b) => day(b).localeCompare(day(a)) || b.createdAt - a.createdAt)
  claimed.sort((a, b) => (b.claimedAt ?? b.updatedAt) - (a.claimedAt ?? a.updatedAt))
  return { open, claimed }
}

/** Where Claim goes: the expense form, prefilled from the item. */
export const claimHref = (groupId: string, id: string) => `/add?group=${encodeURIComponent(groupId)}&open=${encodeURIComponent(id)}`

/**
 * What the expense form starts from when someone claims an item: its title, amount, date and
 * category, paid by the claimer and split equally among everyone in the group now. A starting
 * point: the claimer can change any of it before saving.
 */
export function openItemPrefill(item: OpenItem, ctx: { order: MemberId[]; me: MemberId; currency: string }): QuickPrefill {
  return {
    text: item.title,
    description: item.title,
    amount: item.amount,
    currency: ctx.currency,
    payer: ctx.me,
    participants: [...ctx.order],
    date: item.date,
    category: item.category,
  }
}

/** "2 Oct · ₹290", "2 Oct · amount not known", "No date · ₹290". */
export function openItemMeta(item: Pick<OpenItem, 'date' | 'amount'>, currency: string, today?: string): string {
  const date = item.date ? formatDate(item.date, today && item.date.slice(0, 4) !== today.slice(0, 4) ? 'dayYear' : 'day') : 'No date'
  const amount = item.amount ? formatMoney(item.amount, currency) : 'amount not known'
  return `${date} · ${amount}`
}

/**
 * "Rahul might have paid", "You might have paid", "Rahul or Priya might have paid"; null when
 * nobody was named. Names for people no longer in the group are skipped.
 */
export function suspectLine(suspects: MemberId[] | undefined, me: MemberId | undefined, name: (id: MemberId) => string | undefined): string | null {
  const names = (suspects ?? []).flatMap((id) => {
    const n = id === me ? 'You' : name(id)
    return n ? [n] : []
  })
  if (!names.length) return null
  // "You" reads best first.
  names.sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0))
  const list = names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return `${list} might have paid`
}

/** Whether `me` is one of the people someone thinks paid (their "Did you pay?" line). */
export const askedMe = (item: Pick<OpenItem, 'suspects'>, me: MemberId | undefined) => !!me && !!item.suspects?.includes(me)

/** What the add/edit sheet edits. */
export interface OpenItemInput {
  title: string
  amount?: Cents
  date?: string
  category?: Category
  notes?: string
  suspects?: MemberId[]
}

export const TITLE_MAX = 120
export const NOTES_MAX = 500

export type OpenItemErrors = Partial<Record<'title' | 'amount' | 'date', string>>

export function openItemErrors(input: OpenItemInput, today: string): OpenItemErrors {
  const out: OpenItemErrors = {}
  const title = input.title.trim()
  if (!title) out.title = 'Say what it was, like “Lunch at Cafe Blue”'
  else if (title.length > TITLE_MAX) out.title = `Keep it under ${TITLE_MAX} characters`
  if (input.amount !== undefined && (!Number.isInteger(input.amount) || input.amount <= 0)) out.amount = 'Enter an amount above 0, or leave it empty'
  if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > today)) out.date = 'Pick a day that has already happened'
  return out
}

/** A new item from the sheet's fields (trimmed, empty fields dropped). */
export function newOpenItem(input: OpenItemInput, ctx: { id: string; groupId: string; uid: string; now: number }): OpenItem {
  return {
    ...cleanInput(input),
    id: ctx.id,
    groupId: ctx.groupId,
    status: 'open',
    createdBy: ctx.uid,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }
}

/** An item with the sheet's edits applied. */
export function editOpenItem(item: OpenItem, input: OpenItemInput, now: number): OpenItem {
  const { title: _t, amount: _a, date: _d, category: _c, notes: _n, suspects: _s, ...rest } = item
  return { ...rest, ...cleanInput(input), updatedAt: now }
}

function cleanInput(input: OpenItemInput): OpenItemInput {
  const out: OpenItemInput = { title: input.title.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX) }
  if (input.amount !== undefined && input.amount > 0) out.amount = input.amount
  if (input.date) out.date = input.date
  const category = input.category ?? guessCategory(out.title) ?? undefined
  if (category && category !== 'other') out.category = category
  const notes = input.notes?.trim().slice(0, NOTES_MAX)
  if (notes) out.notes = notes
  const suspects = [...new Set(input.suspects ?? [])]
  if (suspects.length) out.suspects = suspects
  return out
}

/**
 * The one-line way in: "lunch 290 2nd Oct Cafe Blue" → title "Lunch Cafe Blue", ₹290, 2 Oct.
 * Read with the Quick add grammar; a name it reads as the payer ("Rahul paid") becomes a
 * suspect, since nobody is sure yet. Nothing is required but some words.
 */
export function openItemFromLine(line: string, ctx: NlContext): OpenItemInput {
  const p = parseNlExpense(line, ctx)
  const title = p.description || line.trim()
  const out: OpenItemInput = { title }
  // An amount in another currency than the group's would need a rate: leave it for the claimer.
  if (p.amount !== undefined && p.currency === ctx.currency) out.amount = p.amount
  if (p.date) out.date = p.date
  const category = guessCategory(title)
  if (category) out.category = category
  if (p.payerExplicit) out.suspects = [p.payer]
  return out
}
