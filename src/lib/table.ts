import type { Cents, Group, MemberId, PaymentHandles, ReceiptItem, SplitInput, SplitType } from '@/types'
import { allocate, computeSplits } from './splits'

/*
 * Live table split: everyone at the table opens tables/{code} on their phone and taps the
 * items they had. Claims are stored per participant (claims[pid][itemId] = shares) rather than
 * inside each item, so security rules can confine a guest's write to their own key.
 */

export type ParticipantId = string
export type ItemId = string

export interface TableItem {
  name: string
  amount: Cents
  /** display order */
  pos: number
}

export interface TableParticipant {
  name: string
  /** auth uid (anonymous for guests). Absent for people the host added who have no phone. */
  uid?: string
  joinedAt: number
}

export interface TableExtras {
  tax: Cents
  tip: Cents
  discount: Cents
}

export type TableStatus = 'open' | 'closed'

/**
 * How tax/fees and discounts are shared: 'items' in proportion to what each person had (the
 * default), or 'equal' between the people who had something. The tip is always split equally.
 */
export type TaxSplit = 'items' | 'equal'

/** tables/{code}. The doc id is the share code. */
export interface LiveTable {
  code: string
  groupId?: string
  hostUid: string
  merchant: string
  currency: string
  date: string
  items: Record<ItemId, TableItem>
  extras: TableExtras
  /** absent means 'items' (tables started before the option existed) */
  taxSplit?: TaxSplit
  participants: Record<ParticipantId, TableParticipant>
  claims: Record<ParticipantId, Record<ItemId, number>>
  /** the host's payment handles, shown to guests so they can pay them back */
  hostPayment?: PaymentHandles
  status: TableStatus
  createdAt: number
  expiresAt: number
  /** set when the host finishes into a group */
  expenseId?: string
  closedGroupId?: string
  /** set when the host finishes: each guest's Pay me link (payLinks/{code}), so "I've paid" reaches the host */
  payLinks?: Record<ParticipantId, string>
}

export type NewTable = Omit<LiveTable, 'code' | 'createdAt' | 'expiresAt' | 'status' | 'claims'>

export const TABLE_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_SHARES = 20
export const MAX_NAME = 40

/** Item as the UI shows it: ordered, with who claimed it. */
export interface TableItemView extends TableItem {
  id: ItemId
  claims: Record<ParticipantId, number>
}

export function orderedItems(t: Pick<LiveTable, 'items' | 'claims'>): TableItemView[] {
  return Object.entries(t.items)
    .sort(([a, x], [b, y]) => x.pos - y.pos || a.localeCompare(b))
    .map(([id, it]) => {
      const claims: Record<ParticipantId, number> = {}
      for (const [pid, c] of Object.entries(t.claims ?? {})) {
        const s = c?.[id]
        if (validShares(s)) claims[pid] = s
      }
      return { ...it, id, claims }
    })
}

/** Host first, then in the order people joined. */
export function participantOrder(t: Pick<LiveTable, 'participants' | 'hostUid'>): ParticipantId[] {
  return Object.keys(t.participants).sort((a, b) => {
    if (a === t.hostUid) return -1
    if (b === t.hostUid) return 1
    return t.participants[a].joinedAt - t.participants[b].joinedAt || a.localeCompare(b)
  })
}

export const validShares = (s: unknown): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= MAX_SHARES

/** Net of tax + tip − discount (may be negative). */
export const extrasNet = (e: TableExtras) => (e.tax || 0) + (e.tip || 0) - (e.discount || 0)
export const itemsTotal = (t: Pick<LiveTable, 'items'>) => Object.values(t.items).reduce((s, i) => s + i.amount, 0)
export const tableTotal = (t: Pick<LiveTable, 'items' | 'extras'>) => itemsTotal(t) + extrasNet(t.extras)

/**
 * Keep only claims on items that exist, with whole-number shares in 1..MAX_SHARES.
 * Used before writing (so stale or tampered input never reaches the server) and when reading.
 */
export function sanitizeClaims(claims: Record<string, unknown> | undefined, items: Record<ItemId, unknown>): Record<ItemId, number> {
  const out: Record<ItemId, number> = {}
  for (const [id, s] of Object.entries(claims ?? {})) if (id in items && validShares(s)) out[id] = s
  return out
}

/** Tap an item: claim it with 1 share, or drop the claim. */
export function toggleClaim(claims: Record<ItemId, number>, itemId: ItemId): Record<ItemId, number> {
  const { [itemId]: had, ...rest } = claims
  return had ? rest : { ...claims, [itemId]: 1 }
}

/** Set shares for one item (0 removes the claim). Clamped to 0..MAX_SHARES. */
export function setShares(claims: Record<ItemId, number>, itemId: ItemId, shares: number): Record<ItemId, number> {
  const n = Math.max(0, Math.min(MAX_SHARES, Math.round(shares) || 0))
  const { [itemId]: _, ...rest } = claims
  return n ? { ...rest, [itemId]: n } : rest
}

export interface PersonTotal {
  items: Cents
  /** tax/fees minus discount (may be negative) */
  extras: Cents
  /** always an equal share */
  tip: Cents
  total: Cents
}

export interface TableTotals {
  people: Record<ParticipantId, PersonTotal>
  /** per item, what each claimer pays for it (before extras) */
  itemSplits: Record<ItemId, Record<ParticipantId, Cents>>
  unclaimed: ItemId[]
  unclaimedAmount: Cents
  /** items + extras */
  total: Cents
  allClaimed: boolean
}

export const taxSplitOf = (t: Pick<LiveTable, 'taxSplit'>): TaxSplit => (t.taxSplit === 'equal' ? 'equal' : 'items')

/**
 * Running totals. Each item is split among its claimers by shares (largest remainder, ties by
 * participant order). The tip is divided equally between the people who have claimed something
 * (everyone at the table while nobody has), so it moves as people claim. Tax/fees minus discount
 * follows the table's `taxSplit`: by items, in proportion to item subtotals with unclaimed items
 * holding their share in reserve (so a person's tax doesn't jump as others claim), or equally
 * between the same people as the tip. Once everything is claimed, the people's totals add up
 * exactly to the bill.
 */
export function computeTableTotals(t: LiveTable): TableTotals {
  const order = participantOrder(t)
  const items = orderedItems(t)
  const sub: Record<ParticipantId, Cents> = {}
  const claimed = new Set<ParticipantId>()
  const itemSplits: Record<ItemId, Record<ParticipantId, Cents>> = {}
  const unclaimed: ItemId[] = []
  let unclaimedAmount = 0
  for (const it of items) {
    const weights = order.filter((p) => it.claims[p]).map((p) => [p, it.claims[p]] as [string, number])
    if (!weights.length) {
      unclaimed.push(it.id)
      unclaimedAmount += it.amount
      continue
    }
    for (const [p] of weights) claimed.add(p)
    const part = allocate(it.amount, weights)
    itemSplits[it.id] = part
    for (const [p, v] of Object.entries(part)) sub[p] = (sub[p] ?? 0) + v
  }
  const sharers = claimed.size ? order.filter((p) => claimed.has(p)) : order
  const equally = sharers.map((p) => [p, 1] as [string, number])
  const tipParts = allocate(t.extras.tip || 0, equally)
  const taxNet = (t.extras.tax || 0) - (t.extras.discount || 0)
  const RESERVE = '\u0000unclaimed'
  const taxParts =
    taxSplitOf(t) === 'equal'
      ? allocate(taxNet, equally)
      : allocate(taxNet, [...order.filter((p) => sub[p]).map((p) => [p, sub[p]] as [string, number]), [RESERVE, unclaimedAmount]])
  const people: Record<ParticipantId, PersonTotal> = {}
  for (const p of order) {
    const items = sub[p] ?? 0
    const extras = taxParts[p] ?? 0
    const tip = tipParts[p] ?? 0
    people[p] = { items, extras, tip, total: items + extras + tip }
  }
  return {
    people,
    itemSplits,
    unclaimed,
    unclaimedAmount,
    total: itemsTotal(t) + extrasNet(t.extras),
    allClaimed: items.length > 0 && unclaimed.length === 0,
  }
}

/**
 * What a person's total adds on top of their items, for "incl. …" lines: tax/fees (or a
 * discount, when that outweighs them) and the tip, separately, leaving out zeros. Amounts are signed.
 */
export function extrasParts(p: Pick<PersonTotal, 'extras' | 'tip'>): Array<{ label: 'tax/fees' | 'discount' | 'tip'; amount: Cents }> {
  const out: Array<{ label: 'tax/fees' | 'discount' | 'tip'; amount: Cents }> = []
  if (p.extras) out.push({ label: p.extras < 0 ? 'discount' : 'tax/fees', amount: p.extras })
  if (p.tip) out.push({ label: 'tip', amount: p.tip })
  return out
}

/** The line under the tax/tip/discount fields, for the chosen mode. */
export const taxSplitHint = (mode: TaxSplit) =>
  `${mode === 'equal' ? 'Tax, fees and discounts are split equally between everyone who had something.' : 'Tax, fees and discounts are shared in proportion to what each person had.'} Tip is always split equally.`

/** Claims that give every unclaimed item to everyone at the table (1 share each). */
export function claimLeftoversForAll(t: LiveTable): Record<ParticipantId, Record<ItemId, number>> {
  const { unclaimed } = computeTableTotals(t)
  const out: Record<ParticipantId, Record<ItemId, number>> = {}
  for (const p of participantOrder(t)) {
    const mine = sanitizeClaims(t.claims?.[p], t.items)
    for (const id of unclaimed) mine[id] = 1
    out[p] = mine
  }
  return out
}

export function validateName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Enter your name'
  if (n.length > MAX_NAME) return `Keep it under ${MAX_NAME} characters`
  return null
}

// ---- Participants → group members --------------------------------------

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const first = (s: string) => norm(s).split(' ')[0]

/**
 * Suggest which group member each participant is: by uid first, then by exact name, then by a
 * unique first-name match. A member is matched at most once; unmatched participants map to
 * undefined (the host picks a member or adds them as a new one).
 */
export function matchParticipants(
  participants: Record<ParticipantId, TableParticipant>,
  members: Group['members'],
  order: ParticipantId[] = Object.keys(participants),
): Record<ParticipantId, MemberId | undefined> {
  const out: Record<ParticipantId, MemberId | undefined> = Object.fromEntries(order.map((p) => [p, undefined]))
  const used = new Set<MemberId>()
  const take = (p: ParticipantId, m: MemberId) => {
    out[p] = m
    used.add(m)
  }
  const free = () => Object.keys(members).filter((m) => !used.has(m))

  for (const p of order) {
    const u = participants[p].uid
    const m = u && Object.keys(members).find((id) => members[id].uid === u)
    if (m && !used.has(m)) take(p, m)
  }
  for (const p of order) {
    if (out[p]) continue
    const m = free().find((id) => norm(members[id].name) === norm(participants[p].name))
    if (m) take(p, m)
  }
  for (const p of order) {
    if (out[p]) continue
    const f = first(participants[p].name)
    if (!f) continue
    const candidates = free().filter((id) => first(members[id].name) === f)
    // Only when unambiguous on both sides (one member and one waiting participant with that first name).
    const rivals = order.filter((q) => !out[q] && first(participants[q].name) === f)
    if (candidates.length === 1 && rivals.length === 1) take(p, candidates[0])
  }
  return out
}

// ---- Finish: table → expense split ---------------------------------------

export interface TableSplit {
  amount: Cents
  splits: Record<MemberId, Cents>
  splitType: SplitType
  splitInput: SplitInput
}

export class TableError extends Error {}

/**
 * The expense split for a finished table, in group member space. `mapping` sends each
 * participant who claimed something to a member (several participants may share one member).
 * With no tip and tax shared by items, this is an ordinary itemized split (re-editable in the
 * expense form; uneven portions ride on the item). Otherwise it is an exact split of what each
 * person saw at the table. Either way the splits sum exactly to the total.
 */
export function tableToSplit(t: LiveTable, mapping: Record<ParticipantId, MemberId | undefined>, memberOrder: MemberId[]): TableSplit {
  const items = orderedItems(t)
  if (!items.length) throw new TableError('The table has no items')
  const amount = tableTotal(t)
  if (amount <= 0) throw new TableError('The bill total must be positive')
  const { unclaimed } = computeTableTotals(t)
  if (unclaimed.length) throw new TableError(`${unclaimed.length} item${unclaimed.length > 1 ? 's are' : ' is'} still unclaimed`)

  const memberItems = items.map((it) => {
    const shares: Record<MemberId, number> = {}
    for (const [p, s] of Object.entries(it.claims)) {
      const m = mapping[p]
      if (!m) throw new TableError(`Choose who ${t.participants[p]?.name ?? 'everyone'} is in the group`)
      shares[m] = (shares[m] ?? 0) + s
    }
    return { it, shares }
  })

  // Always itemized, so the expense can be corrected item by item later.
  const receipt: ReceiptItem[] = memberItems.map(({ it, shares }) => {
    const members = memberOrder.filter((m) => shares[m])
    const even = new Set(members.map((m) => shares[m])).size <= 1
    return { name: it.name, amount: it.amount, members, ...(even ? {} : { shares: Object.fromEntries(members.map((m) => [m, shares[m]])) }) }
  })
  if (!(t.extras.tip || 0) && taxSplitOf(t) === 'items') {
    return { amount, splits: computeSplits(amount, 'itemized', { items: receipt }, memberOrder), splitType: 'itemized', splitInput: { items: receipt } }
  }
  // An itemized expense would spread the tip and the tax in proportion to the items, which isn't
  // what the table showed (tip equal, maybe tax equal too). So the group gets exactly what each
  // person saw, as exact amounts; the items ride along so switching to "Split by items" later in
  // the expense form starts from them.
  const exact: Record<MemberId, Cents> = {}
  for (const [p, pt] of Object.entries(computeTableTotals(t).people)) {
    if (!pt.total) continue
    const m = mapping[p]
    if (!m) throw new TableError(`Choose who ${t.participants[p]?.name ?? 'everyone'} is in the group`)
    exact[m] = (exact[m] ?? 0) + pt.total
  }
  if (Object.values(exact).some((v) => v < 0)) throw new TableError('The discount is bigger than someone’s share')
  const ordered = Object.fromEntries(memberOrder.filter((m) => exact[m]).map((m) => [m, exact[m]]))
  return { amount, splits: computeSplits(amount, 'exact', { exact: ordered }, memberOrder), splitType: 'exact', splitInput: { exact: ordered, items: receipt } }
}

// ---- Starting a table ------------------------------------------------------

export interface TableDraft {
  merchant: string
  currency: string
  date: string
  /** item amounts in minor units */
  items: Array<{ name: string; amount: Cents }>
  /** bill total, if known; the difference from the items becomes tax/tip (or a discount) */
  total?: Cents
  /** explicit tax/tip/discount; when given, `total` is not used to infer them */
  extras?: TableExtras
  /** how tax/fees and discounts are shared; 'items' is stored as absent */
  taxSplit?: TaxSplit
  groupId?: string
}

/** Build a new table from an expense draft or a scanned receipt. `ids` makes tests deterministic. */
export function draftToTable(
  d: TableDraft,
  host: { uid: string; name: string; payment?: PaymentHandles },
  now = Date.now(),
  ids: (i: number) => string = (i) => `i${i}_${Math.random().toString(36).slice(2, 8)}`,
): NewTable {
  const items: Record<ItemId, TableItem> = {}
  d.items
    .filter((it) => it.amount > 0)
    .forEach((it, i) => {
      items[ids(i)] = { name: it.name.trim() || `Item ${i + 1}`, amount: it.amount, pos: i }
    })
  const sum = Object.values(items).reduce((s, it) => s + it.amount, 0)
  const diff = d.total && d.total > 0 ? d.total - sum : 0
  const hasPayment = host.payment && Object.values(host.payment).some(Boolean)
  return {
    groupId: d.groupId,
    hostUid: host.uid,
    merchant: d.merchant.trim() || 'Bill',
    currency: d.currency,
    date: d.date,
    items,
    extras: d.extras ?? { tax: diff > 0 ? diff : 0, tip: 0, discount: diff < 0 ? -diff : 0 },
    ...(d.taxSplit === 'equal' ? { taxSplit: 'equal' as const } : {}),
    participants: { [host.uid]: { name: host.name, uid: host.uid, joinedAt: now } },
    hostPayment: hasPayment ? host.payment : undefined,
  }
}

export const isExpired = (t: Pick<LiveTable, 'expiresAt'>, now = Date.now()) => now >= t.expiresAt

/** "ABCD2345" → "ABCD-2345" for reading aloud. */
export const formatCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c)
/** Accepts "abcd-2345", "ABCD 2345" or a pasted link. */
export function parseCode(input: string): string {
  const m = input.match(/\/t\/([A-Za-z0-9-]+)/)
  return (m ? m[1] : input).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * Tax / tip / discount for a scanned bill. Receipts print taxes either on top (Indian CGST + SGST)
 * or as an "includes GST" note, so the parsed extras are only trusted when they make the items add
 * up to the printed total; otherwise the gap between items and total becomes tax (or a discount).
 */
export function receiptExtras(items: Cents[], parsed: { total?: Cents; tax?: Cents; tip?: Cents; discount?: Cents }): TableExtras {
  const sum = items.reduce((s, a) => s + a, 0)
  const e = { tax: parsed.tax ?? 0, tip: parsed.tip ?? 0, discount: parsed.discount ?? 0 }
  if (!parsed.total) return e
  const close = (v: number) => Math.abs(v - parsed.total!) <= Math.max(1, Math.round(parsed.total! * 0.002))
  if (close(sum + extrasNet(e))) return e
  if (close(sum)) return { tax: 0, tip: 0, discount: 0 }
  const diff = parsed.total - sum
  return { tax: diff > 0 ? diff : 0, tip: 0, discount: diff < 0 ? -diff : 0 }
}

export interface BillCheck {
  /** 'ok': matches the printed total (or there is none); 'tipOnTop': matches once the tip is left out; 'mismatch': doesn't */
  kind: 'ok' | 'tipOnTop' | 'mismatch'
  /** printed total minus items + tax − discount (the tip left out, since a tip is usually paid on top of the bill); 0 unless 'mismatch' */
  gap: Cents
}

/**
 * Do the items and extras match the total printed on a scanned bill? A tip is often paid on top
 * of the printed figure, so a bill that matches without the tip is fine. When it doesn't match,
 * `gap` is what "Fix with tax" adds to the tax: measured without the tip, so the tip never ends
 * up folded into the tax.
 */
export function billCheck({ itemsSum, extras, printed }: { itemsSum: Cents; extras: TableExtras; printed?: Cents }): BillCheck {
  if (!printed) return { kind: 'ok', gap: 0 }
  const tip = extras.tip || 0
  const beforeTip = itemsSum + (extras.tax || 0) - (extras.discount || 0)
  if (printed === beforeTip + tip) return { kind: 'ok', gap: 0 }
  if (tip && printed === beforeTip) return { kind: 'tipOnTop', gap: 0 }
  return { kind: 'mismatch', gap: printed - beforeTip }
}
