import type { ActivityEntry, ActivityType, Cents, Expense, ImportedFrom, MemberId, OriginalAmount, Settlement } from '@/types'
import { CATEGORIES } from './categories'
import { formatMoney } from './money'
import { FREQ_LABEL } from './recurrence'
import { formatDate } from './locale'

/**
 * Activity log / edit history. Every expense, settlement and membership change writes one
 * entry (in the same batch as the change) built by the functions below, so the text and the
 * diff are the same whichever repo wrote it.
 */

/** An entry before it has an id (the repo assigns it) or a group (the path does). */
export type NewActivity = Omit<ActivityEntry, 'id' | 'groupId'>

export interface ActivityCtx {
  actorUid: string
  actorName: string
  /** the group's currency: amount, paidBy and splits are always in it */
  currency: string
  memberName: (id: MemberId) => string
  now?: number
}

type Snapshot = Record<string, unknown>

/** Expense fields whose changes are recorded, in display order. Others (receipt, ids, timestamps) are not. */
export const TRACKED_FIELDS = ['description', 'amount', 'original', 'date', 'category', 'paidBy', 'splits', 'splitType', 'notes', 'recurrence'] as const

const SPLIT_TYPE_LABEL: Record<string, string> = { equal: 'equally', exact: 'exact amounts', percent: 'percentages', shares: 'shares', adjust: 'adjustments', itemized: 'itemized' }
const MAX_SUMMARY = 480

/** Stable JSON (sorted keys) so maps with the same entries compare equal. */
function stable(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Snapshot)[k])}`).join(',')}}`
}

/** The tracked fields of an expense, dropping empty ones. */
export function expenseSnapshot(e: Partial<Expense>): Snapshot {
  const out: Snapshot = {}
  for (const k of TRACKED_FIELDS) {
    const v = (e as Snapshot)[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

/** Changed tracked fields between two expenses, as compact before/after snapshots. */
export function diffExpense(prev: Partial<Expense>, next: Partial<Expense>): { fields: string[]; before: Snapshot; after: Snapshot } {
  const a = expenseSnapshot(prev), b = expenseSnapshot(next)
  const fields = TRACKED_FIELDS.filter((k) => stable(a[k]) !== stable(b[k]))
  const pick = (s: Snapshot) => Object.fromEntries(fields.filter((k) => k in s).map((k) => [k, s[k]]))
  return { fields: [...fields], before: pick(a), after: pick(b) }
}

const money = (v: unknown, cur: string) => (typeof v === 'number' ? formatMoney(v, cur) : '—')
const orig = (o: unknown) => {
  const x = o as OriginalAmount | undefined
  return x && typeof x.amount === 'number' ? formatMoney(x.amount, x.currency) : undefined
}
/** "฿1,200.00 (A$50.52)" for a foreign-currency expense, else just "A$50.52". */
export function amountLabel(amount: unknown, original: unknown, cur: string): string {
  const o = orig(original)
  return o ? `${o} (${money(amount, cur)})` : money(amount, cur)
}
const expenseAmount = (e: Pick<Expense, 'amount' | 'original'>, cur: string) => amountLabel(e.amount, e.original, cur)
const day = (v: unknown) => (typeof v === 'string' && v ? formatDate(v, 'day') : '—')
const quote = (v: unknown) => (typeof v === 'string' && v ? `“${v}”` : '—')
const cat = (v: unknown) => CATEGORIES[v as keyof typeof CATEGORIES]?.label ?? String(v ?? '—')

function shares(v: unknown, cur: string, name: (id: string) => string): string {
  const r = (v ?? {}) as Record<string, Cents>
  const ids = Object.keys(r)
  if (!ids.length) return 'nobody'
  if (ids.length === 1) return name(ids[0])
  return ids.map((id) => `${name(id)} ${money(r[id], cur)}`).join(', ')
}

/** Per-person differences between two {member: cents} maps, e.g. "Jay A$20.00 → A$21.00". */
function shareChanges(a: unknown, b: unknown, cur: string, name: (id: string) => string): string {
  const x = (a ?? {}) as Record<string, Cents>, y = (b ?? {}) as Record<string, Cents>
  const ids = [...new Set([...Object.keys(x), ...Object.keys(y)])]
  const parts: string[] = []
  for (const id of ids) {
    if (x[id] === y[id]) continue
    if (x[id] === undefined) parts.push(`${name(id)} added (${money(y[id], cur)})`)
    else if (y[id] === undefined) parts.push(`${name(id)} removed`)
    else parts.push(`${name(id)} ${money(x[id], cur)} → ${money(y[id], cur)}`)
  }
  return parts.length > 4 ? `${parts.slice(0, 3).join(', ')} and ${parts.length - 3} more` : parts.join(', ')
}

function recurrenceLabel(v: unknown): string {
  const r = v as Expense['recurrence']
  return r ? FREQ_LABEL[r.freq]?.toLowerCase() ?? r.freq : 'never'
}

/** One human phrase for a changed field, e.g. "amount A$80.00 → A$84.00". */
export function describeChange(field: string, before: Snapshot, after: Snapshot, ctx: Pick<ActivityCtx, 'currency' | 'memberName'>): string {
  const b = before[field], a = after[field]
  const curA = ctx.currency
  switch (field) {
    case 'description': return `description ${quote(b)} → ${quote(a)}`
    // with a foreign original, show both ("฿1,200.00 (A$50.52)"); unchanged originals aren't in the
    // snapshot, so they are looked up in `ctx.original` (the expense as it is now)
    case 'amount': {
      const ob = 'original' in before || 'original' in after ? before.original : (ctx as OrigCtx).original
      const oa = 'original' in before || 'original' in after ? after.original : (ctx as OrigCtx).original
      return `amount ${amountLabel(b, ob, curA)} → ${amountLabel(a, oa, curA)}`
    }
    case 'original': return `currency ${orig(b) ?? curA} → ${orig(a) ?? curA}`
    case 'date': return `date ${day(b)} → ${day(a)}`
    case 'category': return `category ${cat(b)} → ${cat(a)}`
    case 'notes': return b === undefined ? 'added a note' : a === undefined ? 'removed the note' : 'edited the note'
    case 'splitType': return `split ${SPLIT_TYPE_LABEL[b as string] ?? b} → ${SPLIT_TYPE_LABEL[a as string] ?? a}`
    case 'recurrence': return `repeat ${recurrenceLabel(b)} → ${recurrenceLabel(a)}`
    case 'paidBy': {
      const sb = shares(b, curA, ctx.memberName), sa = shares(a, curA, ctx.memberName)
      return sb === sa ? `who paid (${shareChanges(b, a, curA, ctx.memberName)})` : `paid by ${sb} → ${sa}`
    }
    case 'splits': {
      const c = shareChanges(b, a, curA, ctx.memberName)
      return c ? `split (${c})` : 'the split'
    }
    default: return `${field}`
  }
}

/** All changed fields as phrases (for the History list). */
export function describeChanges(before: Snapshot = {}, after: Snapshot = {}, ctx: Pick<ActivityCtx, 'currency' | 'memberName'>): string[] {
  const fields = TRACKED_FIELDS.filter((k) => k in before || k in after)
  // A changed amount re-computes who paid and the split; the amount line says enough unless
  // the split type or the people involved changed too.
  const implied = (k: string) => ((k === 'splits' || k === 'paidBy') && 'amount' in after && !('splitType' in after) && sameKeys(before[k], after[k]))
    // a new foreign amount is shown on the amount line
    || (k === 'original' && ('amount' in before || 'amount' in after))
  return fields
    .filter((k) => !implied(k))
    .map((k) => describeChange(k, before, after, ctx))
}
const sameKeys = (a: unknown, b: unknown) => stable(Object.keys((a ?? {}) as object).sort()) === stable(Object.keys((b ?? {}) as object).sort())

type OrigCtx = { original?: OriginalAmount }

const clip = (s: string) => (s.length > MAX_SUMMARY ? s.slice(0, MAX_SUMMARY - 1) + '…' : s)
const base = (type: ActivityType, targetId: string, ctx: ActivityCtx) => ({ type, actorUid: ctx.actorUid, actorName: ctx.actorName, targetId, createdAt: ctx.now ?? Date.now() })
const label = (e: Pick<Expense, 'description'>) => `“${e.description}”`

/**
 * The entry for saving an expense: created when there was no previous version, updated when
 * a tracked field changed, or null when nothing worth recording changed (e.g. a receipt).
 */
export function expenseSaveActivity(prev: Expense | undefined, next: Expense, ctx: ActivityCtx): NewActivity | null {
  if (!prev) {
    return {
      ...base('expense.created', next.id, ctx),
      summary: clip(`${ctx.actorName} added ${label(next)} (${expenseAmount(next, ctx.currency)})`),
      after: { description: next.description, amount: next.amount, ...(next.original ? { original: next.original } : {}) },
    }
  }
  const d = diffExpense(prev, next)
  if (!d.fields.length) return null
  const phrases = describeChanges(d.before, d.after, { ...ctx, original: next.original } as ActivityCtx)
  const summary = phrases.length === 1
    ? `${ctx.actorName} changed ${phrases[0]} on ${label(next)}`
    : `${ctx.actorName} edited ${label(next)}: ${phrases.join('; ')}`
  return { ...base('expense.updated', next.id, ctx), summary: clip(summary), before: d.before, after: d.after }
}

export function expenseEventActivity(kind: 'deleted' | 'restored' | 'purged', e: Expense, ctx: ActivityCtx): NewActivity {
  const verb = { deleted: 'deleted', restored: 'restored', purged: 'permanently deleted' }[kind]
  return {
    ...base(`expense.${kind}`, e.id, ctx),
    summary: clip(`${ctx.actorName} ${verb} ${label(e)} (${expenseAmount(e, ctx.currency)})`),
    ...(kind === 'deleted' ? { before: { description: e.description, amount: e.amount } } : {}),
  }
}

export function disputeActivity(kind: 'disputed' | 'resolved' | 'approved', e: Expense, ctx: ActivityCtx, reason?: string): NewActivity {
  const text = {
    disputed: `${ctx.actorName} flagged ${label(e)}${reason ? `: ${reason}` : ''}`,
    resolved: `${ctx.actorName} resolved their flag on ${label(e)}`,
    approved: `${ctx.actorName} approved ${label(e)} (${expenseAmount(e, ctx.currency)})`,
  }[kind]
  return { ...base(`expense.${kind}`, e.id, ctx), summary: clip(text), ...(reason ? { after: { reason: reason.slice(0, 300) } } : {}) }
}

export function settlementActivity(kind: 'created' | 'deleted' | 'restored' | 'purged', s: Settlement, ctx: ActivityCtx): NewActivity {
  const what = `${ctx.memberName(s.from)} → ${ctx.memberName(s.to)} ${money(s.amount, ctx.currency)}`
  const text = {
    created: `${ctx.actorName} recorded a payment: ${what}`,
    deleted: `${ctx.actorName} deleted a payment: ${what}`,
    restored: `${ctx.actorName} restored a payment: ${what}`,
    purged: `${ctx.actorName} permanently deleted a payment: ${what}`,
  }[kind]
  return { ...base(`settlement.${kind}`, s.id, ctx), summary: clip(text) }
}

/** One summary entry per file import (individual rows aren't logged). */
export function importActivity(groupId: string, expenses: number, settlements: number, source: ImportedFrom | undefined, ctx: ActivityCtx): NewActivity {
  const what = [expenses && `${expenses} expense${expenses === 1 ? '' : 's'}`, settlements && `${settlements} payment${settlements === 1 ? '' : 's'}`].filter(Boolean).join(' and ') || 'nothing'
  const from = source === 'splitwise' ? ' from Splitwise' : source === 'csv' ? ' from a CSV file' : ''
  return { ...base('expense.imported', groupId, ctx), summary: clip(`${ctx.actorName} imported ${what}${from}`), after: { expenses, settlements } }
}

export function memberActivity(kind: 'added' | 'removed', memberId: MemberId, name: string, ctx: ActivityCtx, self = false): NewActivity {
  const text = kind === 'added'
    ? `${ctx.actorName} added ${name} to the group`
    : self ? `${ctx.actorName} left the group` : `${ctx.actorName} removed ${name} from the group`
  return { ...base(`member.${kind}`, memberId, ctx), summary: clip(text) }
}

/** The summary from the reader's point of view ("You changed …" for their own entries). */
export function activityText(a: Pick<ActivityEntry, 'summary' | 'actorUid' | 'actorName'>, myUid: string): string {
  if (a.actorUid === myUid && a.summary.startsWith(a.actorName + ' ')) {
    return 'You ' + a.summary.slice(a.actorName.length + 1).replace(/\btheir flag\b/, 'your flag')
  }
  return a.summary
}

/** Newest-first merge of several groups' feeds. */
export function mergeFeeds(lists: ActivityEntry[][], limit = 20): ActivityEntry[] {
  return lists.flat().sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(0, limit)
}

const ICONS: Record<ActivityType, string> = {
  'expense.created': '🧾', 'expense.updated': '✏️', 'expense.deleted': '🗑️', 'expense.restored': '↩️', 'expense.purged': '🔥',
  'expense.disputed': '🚩', 'expense.resolved': '✅', 'expense.approved': '👍', 'expense.imported': '📥',
  'settlement.created': '💸', 'settlement.deleted': '🗑️', 'settlement.restored': '↩️', 'settlement.purged': '🔥',
  'member.added': '👋', 'member.removed': '🚪',
}
/** An emoji for each kind of entry. */
export const activityIcon = (t: ActivityType): string => ICONS[t] ?? '•'

/** Relative time used by the feeds. */
export function fmtAgo(ts: number, now = Date.now()): string {
  const mins = Math.round((now - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d ago`
  return formatDate(ts, 'day')
}
