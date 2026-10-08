import type { Capture, Category, Cents, Expense, Group, MemberId, OriginalAmount, Recurrence, RecurrenceFreq, SplitInput, SplitType } from '@/types'
import { CATEGORIES, guessCategory } from './categories'
import { CURRENCIES, formatMoney, fromHundredths, minorDigits } from './money'
import { convertExpense, toOriginal, type FxRate } from './fx'
import { computeSplits, SplitError } from './splits'
import type { ParsedReceipt } from './ocr-parse'
import { pastCategory, sanitizeSplit, type LastSplit, type Suggestion } from './recents'
import { firstNextDate, nextAfter } from './recurrence'
import { todayISO, uid } from './id'

/*
 * The expense form's state machine, kept pure so the trickiest rules in the app (seeding from
 * the last split, switching group, scanned bills, FX, recurrence, edit mode) are unit-tested.
 * The form (src/features/expense-form) is a thin view over `reduce` + the selectors here.
 *
 * Money in a draft is always integer minor units of `draft.cur` (the entry currency), never
 * strings: the inputs keep their own text (src/components/MoneyInput.tsx) and report minor
 * units, so re-rendering never rewrites what is being typed. An absent entry means "empty".
 */

/** Minor units per member; an absent key is an empty field. */
export type Amounts = Partial<Record<MemberId, Cents>>
export type Numbers = Partial<Record<MemberId, number>>

export interface ItemDraft {
  /** stable key for the row (never stored) */
  id: string
  name: string
  /** minor units of the entry currency; undefined while empty */
  amount?: Cents
  members: MemberId[]
  /** portions per member (2 of 3 beers); absent means equal */
  shares?: Record<MemberId, number>
}

export interface SplitDraft {
  /** members included (equal / adjust) */
  selected: MemberId[]
  exact: Amounts
  percent: Numbers
  shares: Numbers
  adjust: Amounts
  items: ItemDraft[]
}

export interface Draft {
  /** entry currency; a foreign one is converted to the group's at a locked rate on save */
  cur: string
  /** minor units of `cur`; undefined while empty */
  amount?: Cents
  description: string
  category: Category
  /** the category was chosen by hand, so typing no longer changes it */
  catTouched: boolean
  date: string
  notes: string
  /** the single payer */
  payer: MemberId
  multiPay: boolean
  /** what each person paid, when several did */
  payers: Amounts
  splitType: SplitType
  split: SplitDraft
  /** a suggestion was just picked: hide the chips until the description is typed again */
  picked: boolean
  repeat: RecurrenceFreq | 'never'
  /** last date of the repeat, or '' for never */
  until: string
  /** the exchange rate locked for a foreign-currency expense; null until known */
  fx: FxRate | null
  /** the group (and its currency) the payer and split were seeded for; a different group re-seeds */
  seededFor: { id: string; currency: string }
}

export const SPLIT_TYPE_LABEL: Record<SplitType, string> = {
  equal: 'Split equally',
  exact: 'Exact amounts',
  percent: 'By percentage',
  shares: 'By shares',
  adjust: 'Equal with adjustments',
  itemized: 'Split by items',
}

export const REPEAT_OPTIONS: Array<RecurrenceFreq | 'never'> = ['never', 'weekly', 'fortnightly', 'monthly', 'yearly']

// ---- Seeding -------------------------------------------------------------------------

export const emptySplit = (order: MemberId[]): SplitDraft => ({ selected: [...order], exact: {}, percent: {}, shares: {}, adjust: {}, items: [] })

const newItem = (it: Partial<ItemDraft> & { members: MemberId[] }): ItemDraft => ({ id: uid('it_'), name: '', ...it })

/** A stored split input (an expense's, or the remembered one) over a blank split. */
export function fromSplitInput(input: SplitInput | undefined, order: MemberId[]): SplitDraft {
  const s = emptySplit(order)
  if (!input) return s
  if (input.selected) s.selected = [...input.selected]
  if (input.exact) s.exact = { ...input.exact }
  if (input.percent) s.percent = { ...input.percent }
  if (input.shares) s.shares = { ...input.shares }
  if (input.adjust) s.adjust = { ...input.adjust }
  if (input.items) s.items = input.items.map((it) => newItem({ name: it.name, amount: it.amount, members: [...it.members], shares: it.shares && { ...it.shares } }))
  return s
}

/** Only what the chosen split type uses gets stored (the rest was scratch while switching types). */
export function toSplitInput(s: SplitDraft, t: SplitType): SplitInput {
  const defined = <T,>(r: Partial<Record<MemberId, T>>): Record<MemberId, T> =>
    Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as Record<MemberId, T>
  switch (t) {
    case 'equal': return { selected: [...s.selected] }
    case 'exact': return { exact: defined(s.exact) }
    case 'percent': return { percent: defined(s.percent) }
    case 'shares': return { shares: defined(s.shares) }
    case 'adjust': return { selected: [...s.selected], adjust: defined(s.adjust) }
    case 'itemized': return { items: s.items.map((it) => ({ name: it.name, amount: it.amount ?? 0, members: [...it.members], ...(it.shares ? { shares: { ...it.shares } } : {}) })) }
  }
}

const hasEntries = (r: object) => Object.values(r).some((v) => v !== undefined)

/** When switching split type, pre-fill sensible defaults from what's already chosen. */
export function seedSplit(s: SplitDraft, t: SplitType, order: MemberId[], amount: Cents | undefined, cur?: string): SplitDraft {
  const sel = s.selected.length ? s.selected : [...order]
  switch (t) {
    case 'equal':
    case 'adjust':
      return { ...s, selected: sel }
    case 'shares':
      return hasEntries(s.shares) ? s : { ...s, selected: sel, shares: Object.fromEntries(sel.map((m) => [m, 1])) }
    case 'percent': {
      if (hasEntries(s.percent)) return s
      const each = Math.floor(10000 / sel.length) / 100
      const pct: Numbers = Object.fromEntries(sel.map((m) => [m, each]))
      pct[sel[0]] = Math.round((100 - each * (sel.length - 1)) * 100) / 100
      return { ...s, selected: sel, percent: pct }
    }
    case 'exact': {
      if (hasEntries(s.exact) || !amount || amount <= 0) return { ...s, selected: sel }
      return { ...s, selected: sel, exact: computeSplits(amount, 'equal', { selected: sel }, order, cur) }
    }
    case 'itemized':
      return s.items.length ? s : { ...s, selected: sel, items: [newItem({ amount: amount && amount > 0 ? amount : undefined, members: [...sel] })] }
  }
}

export interface SeedArgs {
  group: Group
  order: MemberId[]
  me: MemberId
  /** the expense being edited */
  existing?: Expense
  /** "Add again": a copy dated today */
  again?: Expense
  /** a captured payment being filed */
  capture?: Capture
  history: Suggestion[]
  /** what this device used last time in this group (src/lib/recents.ts) */
  last: LastSplit
  lastCurrency?: string
  today?: string
}

/**
 * Where the form starts: the expense being edited (in its original currency, with its locked
 * rate), a copy for "add again" (dated today, not repeating), a captured payment (always paid by
 * you), or a blank one seeded from what was used last time in this group, else "you paid,
 * split equally".
 */
export function initialDraft(a: SeedArgs): Draft {
  const { group, order, me, existing, capture, history, last } = a
  const src = existing ?? a.again
  const today = a.today ?? todayISO()
  const cur = src ? src.original?.currency ?? group.currency : capture ? capture.currency ?? group.currency : a.lastCurrency ?? group.currency
  const paidBy = src ? (src.original ? toOriginal(src.paidBy, src.original) : src.paidBy) : {}
  const payerIds = Object.keys(paidBy)
  const multiPay = payerIds.length > 1
  return {
    cur,
    amount: src ? src.original?.amount ?? src.amount : capture?.amount,
    description: src?.description ?? capture?.merchant ?? '',
    category: src?.category ?? (capture && (pastCategory(history, capture.merchant) ?? guessCategory(capture.merchant))) ?? 'other',
    catTouched: !!src,
    date: existing?.date ?? capture?.date ?? today,
    notes: src?.notes ?? capture?.note ?? '',
    payer: payerIds[0] ?? (!capture && last.payer ? last.payer : me),
    multiPay,
    payers: multiPay ? { ...paidBy } : {},
    splitType: src?.splitType ?? last.splitType ?? 'equal',
    split: fromSplitInput(src?.splitInput ?? last.input ?? { selected: order }, order),
    picked: !!src,
    repeat: existing?.recurrence?.freq ?? 'never',
    until: existing?.recurrence?.until ?? '',
    fx: existing?.original ? { rate: existing.original.rate, date: existing.original.rateDate, source: existing.original.source } : null,
    seededFor: { id: group.id, currency: group.currency },
  }
}

// ---- Reducer -------------------------------------------------------------------------

export type Action =
  | { type: 'amount'; amount?: Cents }
  | { type: 'description'; value: string; history: Suggestion[] }
  | { type: 'category'; category: Category }
  | { type: 'currency'; cur: string }
  | { type: 'date'; date: string }
  | { type: 'notes'; notes: string }
  | { type: 'repeat'; repeat: RecurrenceFreq | 'never' }
  | { type: 'until'; until: string }
  | { type: 'fx'; fx: FxRate | null }
  | { type: 'payer'; id: MemberId }
  | { type: 'multiPay'; on: boolean }
  | { type: 'payerAmount'; id: MemberId; amount?: Cents }
  | { type: 'splitType'; splitType: SplitType; order: MemberId[] }
  | { type: 'selected'; ids: MemberId[] }
  | { type: 'toggleMember'; id: MemberId }
  | { type: 'exact'; id: MemberId; amount?: Cents }
  | { type: 'percent'; id: MemberId; value?: number }
  | { type: 'shares'; id: MemberId; value?: number }
  | { type: 'adjust'; id: MemberId; amount?: Cents }
  | { type: 'items'; items: ItemDraft[] }
  /** the expense moved to another group: keep what was typed, re-seed payer and split from the new members */
  | { type: 'switchGroup'; group: Group; order: MemberId[]; me: MemberId; capture?: Capture; last: LastSplit; lastCurrency?: string }
  /** a scanned bill: total, merchant, date and (when the reader saw one) currency */
  | { type: 'applyReceipt'; parsed: ParsedReceipt }
  /** "Assign items myself": the scanned line items become an itemised split */
  | { type: 'assignItems'; items: ParsedReceipt['items']; order: MemberId[] }
  /** a past description: repeat its category, payer and split when they still fit the group */
  | { type: 'pickSuggestion'; s: Suggestion; order: MemberId[]; personal: boolean }

/** Minor units of one currency re-expressed in another's digits (₹12.50 → ¥13), so a typed figure survives a currency switch. */
export function rescaleMinor(v: Cents, from: string, to: string): Cents {
  const dd = minorDigits(to) - minorDigits(from)
  return dd === 0 ? v : Math.round(v * 10 ** dd)
}

const mapAmounts = (r: Amounts, f: (v: Cents) => Cents): Amounts =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === undefined ? undefined : f(v)]))

const setEntry = <T,>(r: Partial<Record<MemberId, T>>, id: MemberId, v: T | undefined): Partial<Record<MemberId, T>> => {
  const next = { ...r }
  if (v === undefined) delete next[id]
  else next[id] = v
  return next
}

export function reduce(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'amount': return { ...d, amount: a.amount }
    case 'description': {
      // This group's own habit for the description beats the keyword guess.
      const category = d.catTouched ? d.category : pastCategory(a.history, a.value) ?? guessCategory(a.value) ?? 'other'
      return { ...d, description: a.value, category, picked: false }
    }
    case 'category': return { ...d, category: a.category, catTouched: true }
    case 'currency': {
      if (a.cur === d.cur) return d
      const f = (v: Cents) => rescaleMinor(v, d.cur, a.cur)
      return {
        ...d, cur: a.cur,
        amount: d.amount === undefined ? undefined : f(d.amount),
        payers: mapAmounts(d.payers, f),
        split: { ...d.split, exact: mapAmounts(d.split.exact, f), adjust: mapAmounts(d.split.adjust, f), items: d.split.items.map((it) => ({ ...it, amount: it.amount === undefined ? undefined : f(it.amount) })) },
      }
    }
    case 'date': return { ...d, date: a.date }
    case 'notes': return { ...d, notes: a.notes }
    case 'repeat': return { ...d, repeat: a.repeat }
    case 'until': return { ...d, until: a.until }
    case 'fx': return { ...d, fx: a.fx }
    case 'payer': return { ...d, payer: a.id, multiPay: false }
    case 'multiPay':
      // Turning it on starts from the single payer covering the whole amount.
      return a.on === d.multiPay ? d : { ...d, multiPay: a.on, payers: a.on ? (d.amount ? { [d.payer]: d.amount } : {}) : {} }
    case 'payerAmount': return { ...d, payers: setEntry(d.payers, a.id, a.amount) }
    case 'splitType': return { ...d, splitType: a.splitType, split: seedSplit(d.split, a.splitType, a.order, d.amount, d.cur) }
    case 'selected': return { ...d, split: { ...d.split, selected: [...a.ids] } }
    case 'toggleMember': {
      const sel = d.split.selected
      return { ...d, split: { ...d.split, selected: sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id] } }
    }
    case 'exact': return { ...d, split: { ...d.split, exact: setEntry(d.split.exact, a.id, a.amount) } }
    case 'percent': return { ...d, split: { ...d.split, percent: setEntry(d.split.percent, a.id, a.value) } }
    case 'shares': return { ...d, split: { ...d.split, shares: setEntry(d.split.shares, a.id, a.value) } }
    case 'adjust': return { ...d, split: { ...d.split, adjust: setEntry(d.split.adjust, a.id, a.amount) } }
    case 'items': return { ...d, split: { ...d.split, items: a.items } }
    case 'switchGroup': {
      if (d.seededFor.id === a.group.id) return d
      // Typing in the old group's own currency: follow the new group's. A foreign currency stays.
      const cur = d.cur === d.seededFor.currency ? a.lastCurrency ?? a.group.currency : d.cur
      const base = reduce(d, { type: 'currency', cur })
      return {
        ...base,
        payer: !a.capture && a.last.payer ? a.last.payer : a.me,
        multiPay: false,
        payers: {},
        splitType: a.last.splitType ?? 'equal',
        split: fromSplitInput(a.last.input ?? { selected: a.order }, a.order),
        seededFor: { id: a.group.id, currency: a.group.currency },
      }
    }
    case 'applyReceipt': {
      const p = a.parsed
      const cur = p.currency && CURRENCIES.includes(p.currency) ? p.currency : d.cur
      const base = reduce(d, { type: 'currency', cur })
      // The reader gives hundredths; the group may count in whole yen.
      const total = p.total ? fromHundredths(p.total, cur) : undefined
      const guess = p.merchant ? guessCategory(p.merchant) : null
      return {
        ...base,
        amount: total ?? base.amount,
        description: p.merchant ? titleCase(p.merchant) : base.description,
        category: guess && !base.catTouched ? guess : base.category,
        date: p.date ?? base.date,
      }
    }
    case 'assignItems': {
      const items = a.items.map((it) => newItem({ name: it.name, amount: fromHundredths(it.amount, d.cur), members: [...a.order] }))
      return { ...d, splitType: 'itemized', split: { ...d.split, items } }
    }
    case 'pickSuggestion': {
      const next: Draft = { ...d, description: a.s.description, category: a.s.category, picked: true }
      if (a.personal) return next
      // Repeat who paid and how it was split last time (when that still fits the group).
      const payer = Object.keys(a.s.last.paidBy)
      if (payer.length === 1 && a.order.includes(payer[0])) { next.payer = payer[0]; next.multiPay = false; next.payers = {} }
      const sp = sanitizeSplit({ splitType: a.s.last.splitType, input: a.s.last.splitInput }, a.order)
      if (sp.splitType && sp.input) { next.splitType = sp.splitType; next.split = fromSplitInput(sp.input, a.order) }
      return next
    }
  }
}

// ---- Selectors -----------------------------------------------------------------------

export const validAmount = (d: Pick<Draft, 'amount'>): d is Draft & { amount: Cents } => d.amount !== undefined && Number.isFinite(d.amount) && d.amount > 0

/** No description: a category says enough ("Groceries"); "Other" doesn't. */
export const descriptionOf = (d: Pick<Draft, 'description' | 'category'>) => d.description.trim() || (d.category !== 'other' ? CATEGORIES[d.category].label : '')

export function selectPaidBy(d: Draft, me: MemberId, personal: boolean): Record<MemberId, Cents> {
  if (!validAmount(d)) return {}
  if (personal) return { [me]: d.amount }
  if (!d.multiPay) return { [d.payer]: d.amount }
  return Object.fromEntries(Object.entries(d.payers).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0))
}

export const sumOf = (r: Partial<Record<string, number>>) => Object.values(r).reduce<number>((s, v) => s + (v ?? 0), 0)

export function selectSplits(d: Draft, order: MemberId[], me: MemberId, personal: boolean): { splits?: Record<MemberId, Cents>; error?: string } {
  if (!validAmount(d)) return {}
  if (personal) return { splits: { [me]: d.amount } }
  try {
    // The message for a short exact split is formatted in the currency being typed.
    return { splits: computeSplits(d.amount, d.splitType, toSplitInput(d.split, d.splitType), order, d.cur) }
  } catch (e) {
    return { error: e instanceof SplitError ? e.message : String(e) }
  }
}

export type ErrorKey = 'amount' | 'description' | 'payers' | 'split' | 'fx' | 'until'
export type Errors = Partial<Record<ErrorKey, string>>

export interface DraftCtx {
  group: Group
  order: MemberId[]
  me: MemberId
  personal: boolean
}

/** Everything that stops a save, keyed by the field to point at. Empty when the draft is good. */
export function validate(d: Draft, ctx: DraftCtx): Errors {
  const errors: Errors = {}
  if (!validAmount(d)) errors.amount = 'Enter an amount'
  if (!descriptionOf(d)) errors.description = 'Add a description'
  if (d.repeat !== 'never' && d.until && d.until < d.date) errors.until = 'The repeat end date is before the expense date'
  if (!validAmount(d)) return errors
  const paidBy = selectPaidBy(d, ctx.me, ctx.personal)
  const paidSum = sumOf(paidBy)
  if (paidSum !== d.amount) errors.payers = `Payers add up to ${formatMoney(paidSum, d.cur)}, not ${formatMoney(d.amount, d.cur)}`
  const sp = selectSplits(d, ctx.order, ctx.me, ctx.personal)
  if (sp.error || !sp.splits) errors.split = sp.error ?? 'Check the split'
  else if (sumOf(sp.splits) !== d.amount) errors.split = 'The split doesn’t add up to the total'
  const foreign = d.cur !== ctx.group.currency
  if (foreign) {
    if (!d.fx) errors.fx = `Enter the ${d.cur} → ${ctx.group.currency} exchange rate`
    else if (sp.splits && !errors.payers && !convertExpense({ amount: d.amount, paidBy, splits: sp.splits }, d.cur, ctx.group.currency, d.fx.rate)) {
      errors.fx = `That’s less than the smallest ${ctx.group.currency} amount`
    }
  }
  return errors
}

export interface SaveCtx extends DraftCtx {
  existing?: Expense
  /** the signed-in user's uid */
  userUid: string
  now: number
  today?: string
}

/**
 * The expense to store. Converts a foreign-currency draft to the group currency once, here
 * (balances only ever see group-currency amounts) and keeps the typed amount in `original`.
 * Assumes `validate()` passed; throws otherwise.
 */
export function toExpense(d: Draft, ctx: SaveCtx): { expense: Expense; remember: LastSplit } {
  const { group, order, me, personal, existing } = ctx
  if (!validAmount(d)) throw new Error('Enter an amount')
  const paidBy = selectPaidBy(d, me, personal)
  const sp = selectSplits(d, order, me, personal)
  if (!sp.splits) throw new Error(sp.error ?? 'Check the split')
  let money = { amount: d.amount, paidBy, splits: sp.splits }
  let original: OriginalAmount | undefined
  if (d.cur !== group.currency) {
    if (!d.fx) throw new Error(`Enter the ${d.cur} → ${group.currency} exchange rate`)
    const c = convertExpense(money, d.cur, group.currency, d.fx.rate)
    if (!c) throw new Error(`That’s less than the smallest ${group.currency} amount`)
    money = c
    original = { currency: d.cur, amount: d.amount, rate: d.fx.rate, rateDate: d.fx.date, source: d.fx.source }
  }
  const isOccurrence = !!existing?.recurringFrom
  const splitInput = personal ? { selected: [me] } : toSplitInput(d.split, d.splitType)
  const expense: Expense = {
    id: existing?.id ?? uid('e_'),
    groupId: group.id,
    description: descriptionOf(d),
    amount: money.amount,
    category: d.category,
    date: d.date,
    notes: d.notes.trim() || undefined,
    paidBy: money.paidBy,
    splits: money.splits,
    splitType: personal ? 'equal' : d.splitType,
    splitInput,
    receiptUrl: existing?.receiptUrl,
    receiptPath: existing?.receiptPath,
    recurrence: isOccurrence ? undefined : buildRecurrence(d.repeat, d.date, d.until, existing, ctx.today),
    recurringFrom: existing?.recurringFrom,
    original,
    importedFrom: existing?.importedFrom,
    createdBy: existing?.createdBy ?? ctx.userUid,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const remember: LastSplit = { payer: d.multiPay ? undefined : d.payer, splitType: d.splitType, input: splitInput }
  return { expense, remember }
}

/**
 * New templates start right after their date (so a back-dated monthly bill catches up).
 * When an existing template's schedule changes, start after today instead so already
 * generated copies aren't recreated on different dates.
 */
export function buildRecurrence(repeat: RecurrenceFreq | 'never', date: string, until: string, existing?: Expense, today = todayISO()): Recurrence | undefined {
  if (repeat === 'never') return undefined
  const prev = existing?.recurrence
  let nextDate: string
  if (prev && prev.freq === repeat && existing.date === date) nextDate = prev.nextDate
  else if (existing) nextDate = nextAfter(date, repeat, today)
  else nextDate = firstNextDate(date, repeat)
  return { freq: repeat, nextDate, until: until || undefined }
}

// ---- Summaries (the collapsed "You paid" / "Split equally · 4 people" rows) -------------------

const nameOf = (group: Pick<Group, 'members'>, me: MemberId, id: MemberId) => (id === me ? 'You' : group.members[id]?.name ?? 'Former member')

const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

export function describePayer(d: Draft, group: Pick<Group, 'members'>, me: MemberId, personal: boolean): string {
  if (personal || !d.multiPay) return `${nameOf(group, me, personal ? me : d.payer)} paid`
  const who = Object.entries(d.payers).filter(([, v]) => typeof v === 'number' && v > 0).map(([id]) => nameOf(group, me, id))
  if (who.length === 0) return 'Nobody yet'
  if (who.length <= 3) return `${list(who)} paid`
  return `${who.length} people paid`
}

export function describeSplit(d: Draft, order: MemberId[], group: Pick<Group, 'members'>, me: MemberId): string {
  switch (d.splitType) {
    case 'equal': {
      const sel = order.filter((m) => d.split.selected.includes(m))
      if (sel.length === 0) return 'Nobody selected'
      if (sel.length === order.length) return `Split equally · ${sel.length} ${sel.length === 1 ? 'person' : 'people'}`
      if (sel.length === 1) return `Only ${nameOf(group, me, sel[0])}`
      return `Split equally · ${sel.length} of ${order.length}`
    }
    case 'itemized': {
      const n = d.split.items.length
      return `${SPLIT_TYPE_LABEL.itemized} · ${n} ${n === 1 ? 'item' : 'items'}`
    }
    default:
      return SPLIT_TYPE_LABEL[d.splitType]
  }
}

// ---- Dirty check and on-device persistence ---------------------------------------------

/** Compared without the bookkeeping flags, so only what the user typed or chose counts. */
const comparable = ({ catTouched: _c, picked: _p, seededFor: _s, ...rest }: Draft) => JSON.stringify(rest)

export const isDirty = (a: Draft, b: Draft) => comparable(a) !== comparable(b)

export interface StoredDraft {
  v: 1
  groupId: string
  /** the "add again" / capture the draft started from, so a different one doesn't restore it */
  again?: string
  capture?: string
  draft: Draft
  at: number
}

export interface DraftStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

let storage: DraftStorage | undefined = (() => {
  try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage } catch { return undefined }
})()

/** Tests: swap in an in-memory store (or undefined for "no storage"). */
export function setDraftStorage(s: DraftStorage | undefined) { storage = s }

const PREFIX = 'splitit-expense-draft:'

/** One draft per route: the new-expense form, or the edit form of one expense. */
export const draftKey = (expenseId?: string) => PREFIX + (expenseId ? `edit:${expenseId}` : 'new')

export function loadDraft(key: string): StoredDraft | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const rec = JSON.parse(raw) as Partial<StoredDraft>
    if (rec?.v !== 1 || typeof rec.groupId !== 'string' || !rec.draft || typeof rec.draft !== 'object') return null
    return rec as StoredDraft
  } catch {
    return null
  }
}

export function saveDraft(key: string, rec: Omit<StoredDraft, 'v' | 'at'>, now = Date.now()) {
  try { storage?.setItem(key, JSON.stringify({ v: 1, at: now, ...rec } satisfies StoredDraft)) } catch { /* storage unavailable or full */ }
}

export function clearDraft(key: string) {
  try { storage?.removeItem(key) } catch { /* storage unavailable */ }
}

/** A stored draft fitted to the group as it is now: members who left are dropped, missing fields filled in. */
export function hydrateDraft(stored: Partial<Draft>, base: Draft, order: MemberId[], me: MemberId): Draft {
  const has = (id: MemberId) => order.includes(id)
  const pick = <T,>(r: Partial<Record<MemberId, T>> | undefined): Partial<Record<MemberId, T>> =>
    Object.fromEntries(Object.entries(r ?? {}).filter(([k, v]) => has(k) && v !== undefined && v !== null))
  const s = stored.split
  const split: SplitDraft = {
    selected: (s?.selected ?? base.split.selected).filter(has),
    exact: pick(s?.exact), percent: pick(s?.percent), shares: pick(s?.shares), adjust: pick(s?.adjust),
    items: (s?.items ?? []).filter((it) => it && typeof it.name === 'string' && Array.isArray(it.members)).map((it) => newItem({
      name: it.name, amount: typeof it.amount === 'number' ? it.amount : undefined, members: it.members.filter(has),
      shares: it.shares && Object.fromEntries(Object.entries(it.shares).filter(([k]) => has(k))),
    })),
  }
  const d: Draft = { ...base, ...stored, split, payers: pick(stored.payers), seededFor: base.seededFor }
  if (!has(d.payer)) d.payer = has(base.payer) ? base.payer : me
  if (typeof d.cur !== 'string' || !d.cur) d.cur = base.cur
  if (typeof d.amount !== 'number' || !Number.isFinite(d.amount)) d.amount = undefined
  if (!(d.splitType in SPLIT_TYPE_LABEL)) d.splitType = base.splitType
  if (!REPEAT_OPTIONS.includes(d.repeat)) d.repeat = 'never'
  if (!(d.category in CATEGORIES)) d.category = base.category
  if (d.fx && (typeof d.fx.rate !== 'number' || !Number.isFinite(d.fx.rate) || d.fx.rate <= 0)) d.fx = null
  return d
}

/**
 * A stored draft brought back into the form. Typed in another group (the URL named a different
 * one): keep what was typed and seed payer and split for this group, as a group switch would.
 */
export function restoreDraft(stored: Partial<Draft>, base: Draft, a: SeedArgs): Draft {
  const h = hydrateDraft(stored, base, a.order, a.me)
  const from = stored.seededFor
  if (from && typeof from.id === 'string' && from.id !== a.group.id) {
    const seededFor = { id: from.id, currency: typeof from.currency === 'string' ? from.currency : h.cur }
    return reduce({ ...h, seededFor }, { type: 'switchGroup', group: a.group, order: a.order, me: a.me, capture: a.capture, last: a.last, lastCurrency: a.lastCurrency })
  }
  return h
}

// ---- Small helpers shared with the split-by-items page ---------------------------------

/** "12.5" → 12.5 with at most `maxDecimals` places; NaN when it isn't a plain non-negative number. */
export function parseDecimal(text: string, maxDecimals = 2): number {
  const t = text.trim().replace(',', '.')
  if (!/\d/.test(t) || !new RegExp(`^\\d*(\\.\\d{0,${maxDecimals}})?$`).test(t)) return NaN
  return Number(t)
}

/** "TOIT brewpub" → "Toit Brewpub"; works for accented and non-Latin letters too (unlike \b\w). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(\-/&])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}
