/*
 * Pay me links (payLinks/{code}): the payee shares a link that works without an account. The
 * debtor opens /r/{code}, pays with the payee's UPI QR / app buttons / handles, and taps "I've
 * paid" (optionally with a screenshot). That flips the document open → paid, which is the only
 * change a stranger may make (firestore.rules), and the `onPayLinkPaid` trigger records the
 * settlement in the group on the payee's behalf.
 *
 * Shared by the app (src/lib/paylinks.ts, the demo repo) and the Cloud Function, so the demo
 * records exactly what the server would. Pure: no Firebase, no DOM, no `@/types` (documents are
 * matched structurally).
 */

export type PayLinkStatus = 'open' | 'paid' | 'cancelled'

/** The handles a Pay me link may carry. Bank account numbers (account, IFSC, BSB) stay in the group. */
export const LINK_HANDLE_KEYS = ['upi', 'phone', 'payid', 'paypal', 'revolut'] as const
export type LinkHandleKey = (typeof LINK_HANDLE_KEYS)[number]
export type LinkHandles = Partial<Record<LinkHandleKey, string>>

/** payLinks/{code}. `from` / `to` are member ids (or, for a live table without a group, participant ids). */
export interface PayLinkDoc {
  groupId?: string
  /** the group's name, or the place for a live table without a group */
  groupName: string
  emoji?: string
  /** set when the link was made for a live table guest */
  tableCode?: string
  from: string
  to: string
  /** minor units of `currency` (the group currency) */
  amount: number
  currency: string
  payeeName: string
  payerName: string
  payment: LinkHandles
  /** when set, only this uid may mark it paid (a live table guest's own link) */
  forUid?: string
  createdBy: string
  createdAt: number
  expiresAt: number
  status: PayLinkStatus
  paidAt?: number
  /** the uid (anonymous for guests) that tapped "I've paid" */
  paidBy?: string
  /** how they say they paid ('UPI', 'Cash', …) */
  method?: string
  /** payproofs/{code}/{file}.jpg */
  proofPath?: string
  cancelledAt?: number
  /** the settlement that cleared it: the trigger's, or a member's own from Settle up */
  settlementId?: string
  /** server: when the trigger handled the claim (recorded, or told the payee) */
  recordedAt?: number
}

/** "I've paid": what the payer adds when flipping the link to paid. */
export interface PayLinkClaim {
  method?: string
  proofPath?: string
  /** a group member who recorded the payment in Settle up themselves */
  settlementId?: string
}

export const PAY_LINK_TTL_MS = 30 * 86_400_000
export const PAY_LINK_CODE_LEN = 24
/** The rules accept 20–40 lowercase letters and digits (firestore.rules `payLinks`). */
export const isPayLinkCode = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{20,40}$/.test(s)

/** Settlements and activity entries written for a link use this id, so a re-run can never record twice. */
export const payLinkSettlementId = (code: string) => `pl_${code}`

/** Only proof images under this link's own folder are accepted. */
export function isProofPath(code: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(`payproofs/${code}/`) && /^payproofs\/[a-z0-9]{20,40}\/[A-Za-z0-9_-]{1,64}\.jpg$/.test(path)
}

/** Keep only the handles a link may carry, trimmed, non-empty, at most 100 characters. */
export function linkHandles(payment: Record<string, unknown> | undefined | null): LinkHandles {
  const out: LinkHandles = {}
  for (const k of LINK_HANDLE_KEYS) {
    const v = payment?.[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 100)
  }
  return out
}

/** What the link is now: expired only matters while it is still open. */
export function payLinkState(l: Pick<PayLinkDoc, 'status' | 'expiresAt'>, now: number): PayLinkStatus | 'expired' {
  if (l.status === 'open' && now >= l.expiresAt) return 'expired'
  return l.status
}

/** Whether `uid` may tap "I've paid" right now (mirrors the rules). */
export function canMarkPaid(l: Pick<PayLinkDoc, 'status' | 'expiresAt' | 'forUid'>, now: number, uid: string | undefined): boolean {
  return payLinkState(l, now) === 'open' && (!l.forUid || l.forUid === uid)
}

/** The exact update "I've paid" writes: status, paidAt, paidBy and only the claim fields given. */
export function markPaidPatch(code: string, claim: PayLinkClaim, uid: string, now: number): Partial<PayLinkDoc> {
  const patch: Partial<PayLinkDoc> = { status: 'paid', paidAt: now, paidBy: uid }
  const method = claim.method?.trim().slice(0, 40)
  if (method) patch.method = method
  if (claim.proofPath !== undefined) {
    if (!isProofPath(code, claim.proofPath)) throw new Error('That screenshot path doesn’t belong to this link')
    patch.proofPath = claim.proofPath
  }
  if (claim.settlementId) patch.settlementId = claim.settlementId.slice(0, 64)
  return patch
}

/** The trigger acts once: on the open → paid change, unless a member already recorded it or it was handled. */
export function shouldHandle(before: Partial<PayLinkDoc> | undefined, after: Partial<PayLinkDoc> | undefined): boolean {
  return !!before && !!after && before.status === 'open' && after.status === 'paid' && !after.settlementId && !after.recordedAt
}

interface MembersLite {
  [memberId: string]: { name?: string; uid?: string } | undefined
}

export interface GroupLite {
  name?: string
  currency?: string
  members?: MembersLite
  memberUids?: string[]
}

export interface PayLinkSettlement {
  groupId: string
  from: string
  to: string
  amount: number
  method: string
  note: string
  date: string
  createdBy: string
  createdAt: number
  /** the link it came from (the group screen links to it, onSettlementCreated stays quiet) */
  payLink: string
}

export type RecordPlan =
  | { kind: 'record'; settlementId: string; settlement: PayLinkSettlement; summary: string; payeeUid?: string }
  | { kind: 'notify'; payeeUid: string }
  | { kind: 'skip'; reason: 'no_group' | 'not_member' | 'bad_amount' | 'currency' | 'not_payee' }

export const PAY_LINK_NOTE = 'Marked paid from a Pay me link'

/**
 * What to do with a link that was just marked paid. With a group: a settlement from → to for the
 * link's amount, written as the payee (who asked to be paid), dated `date`, with the method the
 * payer chose; without one (a live table closed without a group): only tell the payee.
 * The group must still have both members, the payee must still be the account that made the
 * link, and the currency must match, else nothing is recorded.
 */
export function planRecord(
  code: string,
  l: PayLinkDoc,
  g: GroupLite | null | undefined,
  date: string,
  now: number,
  fmt: (minor: number) => string,
): RecordPlan {
  if (!l.groupId) return { kind: 'notify', payeeUid: l.createdBy }
  if (!g) return { kind: 'skip', reason: 'no_group' }
  const members = g.members ?? {}
  const uids = Array.isArray(g.memberUids) ? g.memberUids : []
  if (!members[l.from] || !members[l.to] || l.from === l.to) return { kind: 'skip', reason: 'not_member' }
  if (members[l.to]?.uid !== l.createdBy || !uids.includes(l.createdBy)) return { kind: 'skip', reason: 'not_payee' }
  if (!Number.isInteger(l.amount) || l.amount <= 0) return { kind: 'skip', reason: 'bad_amount' }
  if (g.currency && g.currency !== l.currency) return { kind: 'skip', reason: 'currency' }
  const fromName = members[l.from]?.name || l.payerName || 'Someone'
  const toName = members[l.to]?.name || l.payeeName || 'Someone'
  const note = l.proofPath ? `${PAY_LINK_NOTE}, with a screenshot` : PAY_LINK_NOTE
  return {
    kind: 'record',
    settlementId: payLinkSettlementId(code),
    payeeUid: l.createdBy,
    settlement: {
      groupId: l.groupId,
      from: l.from,
      to: l.to,
      amount: l.amount,
      method: (l.method?.trim() || 'Other').slice(0, 40),
      note,
      date,
      createdBy: l.createdBy,
      createdAt: now,
      payLink: code,
    },
    summary: clip(`${fromName} marked ${fmt(l.amount)} paid to ${toName} with a Pay me link. Not right? Delete the payment.`, 500),
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
