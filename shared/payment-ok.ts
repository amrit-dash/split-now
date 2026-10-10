/*
 * "Payments need the recipient's OK" (a group setting, Group → Edit; docs/PLAN.md §3).
 *
 * With it on, a payment someone else records for you (they paid you) waits for your OK and is
 * left out of balances until then, like an expense that needs approval. A payment screenshot,
 * checked on the server by AI against you (amount, your name or UPI ID, a successful payment,
 * recent, not used before), clears it without you, marked so you can still flag it. Flagging a
 * payment ("Not received") takes it out of balances again until you OK it. With the setting off
 * every payment counts at once, as before. Imported by the app and by Cloud Functions, so it is
 * pure and matches documents structurally.
 */

export interface PaymentOk {
  by: string
  at: number
  /** 'payee': the recipient tapped OK; 'ai': the server matched the screenshot */
  via: 'payee' | 'ai'
}

export interface PaymentFlag {
  by: string
  at: number
  reason?: string
}

export interface OkSettlement {
  from: string
  to: string
  createdBy: string
  needsOk?: boolean
  ok?: PaymentOk
  flag?: PaymentFlag
  deletedAt?: number
}

type MembersLite = Record<string, { uid?: string; removedAt?: number } | undefined>

/** The payee's account, when they have one and are still in the group. */
export function payeeUid(s: Pick<OkSettlement, 'to'>, members: MembersLite): string | undefined {
  const m = members[s.to]
  return m?.uid && typeof m.removedAt !== 'number' ? m.uid : undefined
}

/**
 * Whether a new payment must wait for the payee's OK: the group asks for it, the payee has an
 * account, and someone else is recording it (a payee recording money they got needs no OK).
 */
export function needsOkOnCreate(groupOn: boolean | undefined, s: Pick<OkSettlement, 'to'>, members: MembersLite, creatorUid: string): boolean {
  const payee = payeeUid(s, members)
  return groupOn === true && !!payee && payee !== creatorUid
}

/**
 * Waiting for the payee's OK (left out of balances): asked for, not OK'd (or flagged since), and
 * the payee is still there to give it. Someone who left can't, so their payments count. With the
 * group setting off, nothing waits.
 */
export function awaitingOk(s: Omit<OkSettlement, 'from' | 'createdBy'>, members: MembersLite, groupOn: boolean | undefined): boolean {
  if (groupOn !== true || s.needsOk !== true || typeof s.deletedAt === 'number') return false
  if (!payeeUid(s, members)) return false
  return !s.ok || !!s.flag
}

/** Counts towards balances: not trashed and not waiting for an OK. */
export const settlementCounts = (s: Omit<OkSettlement, 'from' | 'createdBy'>, members: MembersLite, groupOn: boolean | undefined): boolean =>
  typeof s.deletedAt !== 'number' && !awaitingOk(s, members, groupOn)

/* ─────────────── Checking a payment screenshot ─────────────── */

/** What AI read from one payment screenshot (functions/src/lib/gemini.ts paymentPrompt). */
export interface PaymentRead {
  /** minor units of `currency` */
  amount?: number
  currency?: string
  /** the name the money went to, as the app shows it */
  payee?: string
  /** a UPI ID (name@bank), phone, PayID or email the money went to */
  payeeHandle?: string
  /** yyyy-mm-dd */
  date?: string
  status?: 'success' | 'pending' | 'failed' | 'unknown'
  /** the app's reference (UPI ref / UTR / transaction id) */
  ref?: string
}

export interface PaymentExpect {
  /** minor units of `currency`: the settlement, or what was paid in another currency (Settlement.paid) */
  amount: number
  currency: string
  /** the payee's names: their name in the group and the one on their profile */
  names: string[]
  /** the payee's handles (Settle up details): UPI ID, UPI number, PayID, PayPal, Revolut */
  handles: string[]
  /** the payment's date (yyyy-mm-dd) */
  date: string
  /** references already used by other payments in the group */
  usedRefs?: string[]
}

export type PaymentVerdict = 'match' | 'mismatch' | 'unreadable'

export interface PaymentCheck {
  verdict: PaymentVerdict
  /** why it isn't a match, for the payee ("amount", "payee", ...) */
  reasons: Array<'amount' | 'currency' | 'payee' | 'status' | 'date' | 'reused'>
}

/** How far (days) a screenshot's date may be from the payment's and still match. */
export const PROOF_DAYS = 3

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const handleKey = (h: string) => {
  const s = norm(h).trim()
  // Phone numbers: digits only, the last 10 (+91 98765 43210 = 9876543210).
  const digits = s.replace(/\D/g, '')
  return /^[+\d\s()-]+$/.test(s) && digits.length >= 8 ? digits.slice(-10) : s.replace(/\s+/g, '')
}
const tokens = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)

/**
 * The money went to the payee: a handle matches exactly, or the names share a word (UPI apps
 * show the bank's name, "ROHAN K SHARMA", for someone the group calls "Rohan"). A handle that
 * names someone else is a mismatch even when a name word matches.
 */
export function payeeMatches(read: Pick<PaymentRead, 'payee' | 'payeeHandle'>, names: string[], handles: string[]): boolean | null {
  const known = new Set(handles.filter(Boolean).map(handleKey))
  if (read.payeeHandle?.trim()) {
    const h = handleKey(read.payeeHandle)
    if (known.has(h)) return true
    // A UPI ID or number we know nothing about can still be theirs; fall through to the name, but
    // one that clearly is another of the payee's kind of handle (we know their UPI ID) is not.
    if (h.includes('@') && [...known].some((k) => k.includes('@'))) return false
  }
  if (!read.payee?.trim()) return read.payeeHandle?.trim() ? false : null
  const want = new Set(names.flatMap(tokens))
  return tokens(read.payee).some((t) => want.has(t))
}

const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/**
 * Does the screenshot show this payment? Everything it shows must agree: the exact amount (to the
 * minor unit) in the right currency, to the payee, successful, within PROOF_DAYS of the payment,
 * and a reference no other payment in the group used. Without an amount or a payee it can't say
 * ("unreadable"), and the payment waits for the payee as it would without a screenshot.
 */
export function checkPayment(read: PaymentRead | null | undefined, want: PaymentExpect): PaymentCheck {
  if (!read || !(Number.isInteger(read.amount) && (read.amount as number) > 0)) return { verdict: 'unreadable', reasons: [] }
  const payee = payeeMatches(read, want.names, want.handles)
  if (payee === null) return { verdict: 'unreadable', reasons: [] }
  const reasons: PaymentCheck['reasons'] = []
  if (read.currency && read.currency.toUpperCase() !== want.currency.toUpperCase()) reasons.push('currency')
  if (read.amount !== want.amount) reasons.push('amount')
  if (!payee) reasons.push('payee')
  if (read.status && read.status !== 'success' && read.status !== 'unknown') reasons.push('status')
  if (read.date && /^\d{4}-\d{2}-\d{2}$/.test(read.date) && days(read.date, want.date) > PROOF_DAYS) reasons.push('date')
  const ref = read.ref?.trim().toLowerCase()
  if (ref && (want.usedRefs ?? []).some((r) => r.trim().toLowerCase() === ref)) reasons.push('reused')
  return { verdict: reasons.length ? 'mismatch' : 'match', reasons }
}

/** The payee-facing line for a check that didn't clear the payment. */
export function checkReasonText(reasons: PaymentCheck['reasons']): string {
  const words: Record<PaymentCheck['reasons'][number], string> = {
    amount: 'a different amount',
    currency: 'a different currency',
    payee: 'someone else as the payee',
    status: 'a payment that did not go through',
    date: 'a payment from another day',
    reused: 'a payment already used for another one',
  }
  return reasons.length ? `The screenshot shows ${reasons.map((r) => words[r]).join(', ')}` : 'The screenshot could not be read'
}
