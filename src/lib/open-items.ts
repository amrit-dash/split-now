import type { Category, Cents, Expense, MemberId, OpenItem } from '@/types'
import { CATEGORIES, guessCategory } from './categories'
import { expenseEmoji, guessExpenseIcon, isIcon } from './icons'
import { formatMoney } from './money'
import { formatDate } from './locale'
import type { QuickPrefill } from './nl-expense'
import { type AiPick, altsOffered } from './group-icon-follow'
import { cleanSvg } from '../../shared/svg-icon'
import { cleanIconImage } from '../../shared/icon-ai'

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
    // A claimed item keeps its icon: the expense starts from it (and drops a drawing in a private group when saved).
    ...(isIcon(item.icon) ? { icon: item.icon, ...(item.iconAuto ? { iconAuto: true as const } : {}) } : {}),
    ...(cleanSvg(item.iconSvg) ? { iconSvg: cleanSvg(item.iconSvg) as string } : {}),
    ...(cleanIconImage(item.iconImage) ? { iconImage: item.iconImage } : {}),
  }
}

/**
 * The face an open item shows, as an expense's does (src/lib/icons.ts expenseEmoji): the icon
 * someone chose (or the AI picked), else the app's own rules from the title, else the category's.
 * A drawn icon or picture goes over it where the app draws icons (IconFace).
 */
export const openItemEmoji = (item: Pick<OpenItem, 'icon' | 'title' | 'category'>) =>
  expenseEmoji({ icon: item.icon, description: item.title, category: item.category && item.category in CATEGORIES ? item.category : 'other' })

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
  /** a chosen icon, or the automatic one's AI pick with `iconAuto` (as Expense stores them) */
  icon?: string
  iconAuto?: true
  /** an AI-drawn icon or a picture (never kept in a private group) */
  iconSvg?: string
  iconImage?: string
  /** the sheet only: `category` is the AI pick's, not a choice (a new title guesses again); never saved as such */
  categoryAuto?: true
}

/** The fields an edit of an item writes (status, claim and trash have their own writes). */
export const OPEN_ITEM_EDIT_FIELDS = ['title', 'category', 'date', 'amount', 'notes', 'suspects', 'icon', 'iconAuto', 'iconSvg', 'iconImage'] as const

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

/** A new item from the sheet's fields (trimmed, empty fields dropped; no drawn icon in a private group). */
export function newOpenItem(input: OpenItemInput, ctx: { id: string; groupId: string; uid: string; now: number; vault?: boolean }): OpenItem {
  return {
    ...cleanInput(input, !!ctx.vault),
    id: ctx.id,
    groupId: ctx.groupId,
    status: 'open',
    createdBy: ctx.uid,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }
}

/** An item with the sheet's edits applied. */
export function editOpenItem(item: OpenItem, input: OpenItemInput, now: number, opts: { vault?: boolean } = {}): OpenItem {
  const { title: _t, amount: _a, date: _d, category: _c, notes: _n, suspects: _s, icon: _i, iconAuto: _ia, iconSvg: _is, iconImage: _ip, ...rest } = item
  return { ...rest, ...cleanInput(input, !!opts.vault), updatedAt: now }
}

function cleanInput(input: OpenItemInput, vault: boolean): OpenItemInput {
  const out: OpenItemInput = { title: input.title.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX) }
  if (input.amount !== undefined && input.amount > 0) out.amount = input.amount
  if (input.date) out.date = input.date
  const category = input.category ?? guessCategory(out.title) ?? undefined
  if (category && category !== 'other') out.category = category
  const notes = input.notes?.trim().slice(0, NOTES_MAX)
  if (notes) out.notes = notes
  const suspects = [...new Set(input.suspects ?? [])]
  if (suspects.length) out.suspects = suspects
  if (isIcon(input.icon)) {
    out.icon = input.icon
    if (input.iconAuto) out.iconAuto = true
  }
  // A private group has no drawn icons (they can't be sealed; the rules refuse them).
  const svg = vault ? null : cleanSvg(input.iconSvg)
  if (svg) out.iconSvg = svg
  const image = vault ? null : cleanIconImage(input.iconImage)
  if (image) out.iconImage = image
  return out
}

/*
 * The sheet's icon, as the expense form's (src/lib/expense-draft.ts icon, autoIcon, iconSvg,
 * iconImage): chosen in the icon sheet, or the automatic one (the app's rules from the title,
 * else the AI's pick for it, kept as `icon` with `iconAuto`). Pure, so every choice is tested.
 */

/** The category the sheet shows: the one chosen, else the words' guess, else Other. */
export const sheetCategory = (f: Pick<OpenItemInput, 'title' | 'category'>): Category => f.category ?? guessCategory(f.title) ?? 'other'

/** A new title: the AI's pick was for the old one, so it goes (a chosen icon stays). */
export function withTitle(f: OpenItemInput, title: string): OpenItemInput {
  if (title === f.title) return f
  let out: OpenItemInput = { ...f, title }
  if (out.iconAuto) {
    const { icon: _i, iconAuto: _a, ...rest } = out
    out = rest
  }
  if (out.categoryAuto) {
    const { category: _c, categoryAuto: _ca, ...rest } = out
    out = rest
  }
  return out
}

/** A category picked by hand. */
export function withCategory(f: OpenItemInput, category: Category): OpenItemInput {
  const { categoryAuto: _ca, ...rest } = f
  return { ...rest, category }
}

/** Whether the category is the person's (chosen, or read from their line), so the AI isn't asked for one. */
export const categoryChosen = (f: Pick<OpenItemInput, 'category' | 'categoryAuto'>) => f.category !== undefined && !f.categoryAuto

/** An icon picked in the icon sheet; none goes back to the automatic one. Either drops a drawn icon. */
export function withIcon(f: OpenItemInput, icon: string | undefined): OpenItemInput {
  const { icon: _i, iconAuto: _a, iconSvg: _s, iconImage: _p, ...rest } = f
  return isIcon(icon) ? { ...rest, icon } : rest
}

/** An AI-drawn icon picked in the icon sheet (drops a picture). */
export function withIconSvg(f: OpenItemInput, svg: string): OpenItemInput {
  const clean = cleanSvg(svg)
  const { iconImage: _p, ...rest } = f
  return clean ? { ...rest, iconSvg: clean } : f
}

/** A picture from Draw a picture (drops a drawn icon). */
export function withIconImage(f: OpenItemInput, image: string): OpenItemInput {
  const clean = cleanIconImage(image)
  const { iconSvg: _s, ...rest } = f
  return clean ? { ...rest, iconImage: clean } : f
}

/** The icon chosen by hand (the icon sheet's selection); the AI's pick is not a choice. */
export const chosenIcon = (f: Pick<OpenItemInput, 'icon' | 'iconAuto'>) => (f.iconAuto ? undefined : f.icon)

/** The automatic icon now: the AI's pick, else the app's rules from the title, else the category's. */
export const autoIcon = (f: Pick<OpenItemInput, 'icon' | 'iconAuto' | 'title' | 'category'>) =>
  f.iconAuto && isIcon(f.icon) ? f.icon : openItemEmoji({ title: f.title, category: sheetCategory(f) })

/** The face the sheet shows (the emoji under any drawn icon). */
export const sheetEmoji = (f: Pick<OpenItemInput, 'icon' | 'iconAuto' | 'title' | 'category'>) =>
  openItemEmoji({ icon: f.icon, title: f.title, category: sheetCategory(f) })

/** The automatic icon may ask AI: nothing chosen or picked yet, no drawing, and the app's own rules find no icon for the title. */
export const needsItemAutoPick = (f: OpenItemInput) =>
  !f.icon && !f.iconSvg && !f.iconImage && !!f.title.trim() && guessExpenseIcon(f.title, sheetCategory(f)) === null

/**
 * The AI's pick for a title: its emoji as the automatic icon, and its category while none was
 * chosen and the words found none. Ignored once the title has changed, or when an icon was chosen meanwhile.
 */
export function withAutoPick(f: OpenItemInput, a: { title: string; icon?: string; category?: Category }): OpenItemInput {
  if (a.title !== f.title || (f.icon && !f.iconAuto) || f.iconSvg || f.iconImage) return f
  const takeCategory = !!a.category && a.category in CATEGORIES && !categoryChosen(f) && sheetCategory(f) === 'other'
  return {
    ...f,
    ...(isIcon(a.icon) ? { icon: a.icon, iconAuto: true as const } : {}),
    ...(takeCategory ? { category: a.category, categoryAuto: true as const } : {}),
  }
}

/**
 * The AI's other good fits to offer as pills under the title: while the icon is one of its answer
 * for this title (picking one keeps the rest on offer, as on a group: src/lib/group-icon-follow.ts),
 * and not over a drawn icon or picture.
 */
export function itemAltsOffered(pick: AiPick | null, f: OpenItemInput, picking: boolean): string[] {
  if (f.iconSvg || f.iconImage) return []
  return altsOffered(pick, { name: f.title, emoji: sheetEmoji(f), picking })
}

/** The AI's answer for a title as the pills keep it: its pick, then its others (null when it picked nothing). */
export const aiPickOf = (title: string, a: { emoji?: string; alts?: string[] }): AiPick | null =>
  isIcon(a.emoji) ? { title, emojis: [a.emoji, ...(a.alts ?? []).filter((e) => isIcon(e) && e !== a.emoji)] } : null

/** The sheet's starting fields for an item being edited. */
export function itemInput(item: OpenItem): OpenItemInput {
  const out: OpenItemInput = { title: item.title, amount: item.amount, date: item.date, category: item.category, notes: item.notes, suspects: item.suspects }
  if (isIcon(item.icon)) {
    out.icon = item.icon
    if (item.iconAuto) out.iconAuto = true
  }
  if (typeof item.iconSvg === 'string') out.iconSvg = item.iconSvg
  if (typeof item.iconImage === 'string') out.iconImage = item.iconImage
  return out
}
