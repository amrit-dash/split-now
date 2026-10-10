/*
 * Pay me links (payLinks/{code}): the payee shares a link that works without an account. The
 * debtor opens /r/{code}, pays with the payee's UPI QR / app buttons / handles, and taps "I've
 * paid" (optionally with a screenshot). That flips the document open → paid, which is the only
 * change a stranger may make (firestore.rules), and the `onPayLinkPaid` trigger records the
 * settlement in the group on the payee's behalf.
 *
 * Live table links nobody in particular owns (no `forUid`: a guest the host added by hand, or a
 * member several guests were matched to) go open → claimed instead: the host confirms (→ paid,
 * then recorded as above) or dismisses (→ open again). Recording never depends on the `payLinks`
 * flag: the flag only stops new links being made and hides the screens that show them.
 *
 * Shared by the app (src/lib/paylinks.ts, the demo repo) and the Cloud Function, so the demo
 * records exactly what the server would. Pure: no Firebase, no DOM, no `@/types` (documents are
 * matched structurally).
 */

export type PayLinkStatus = 'open' | 'claimed' | 'paid' | 'cancelled'

/** The handles a Pay me link may carry. Bank account numbers (account, IFSC, BSB) stay in the group. */
export const LINK_HANDLE_KEYS = ['upi', 'phone', 'payid', 'paypal', 'revolut'] as const
export type LinkHandleKey = (typeof LINK_HANDLE_KEYS)[number]
export type LinkHandles = Partial<Record<LinkHandleKey, string>>

/**
 * One group a Pay me link clears, when the link is in another currency than the group or covers
 * several groups (Collect in my currency): what to record there, in that group's currency, and
 * its share of the link's amount (minor units of the link's currency).
 */
export interface PayLinkPart {
  groupId: string
  groupName: string
  from: string
  to: string
  /** minor units of `currency`, the group's currency */
  amount: number
  currency: string
  /** this group's share of the link amount, minor units of the link's currency */
  paid: number
}

/** A link with `parts` holds at most this many groups (firestore.rules). */
export const MAX_LINK_PARTS = 8

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
  /** minor units of `currency` (the group currency; with `parts`, the currency the payee collects in) */
  amount: number
  currency: string
  /** set instead of `groupId` when the link is paid in another currency or clears several groups */
  parts?: PayLinkPart[]
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

/** The fields "I've paid" writes besides `status`; a dismissed claim clears them again. */
export const CLAIM_FIELDS = ['paidAt', 'paidBy', 'method', 'proofPath'] as const

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

/**
 * Whether "I've paid" waits for the payee: a live table link not locked to one guest (anyone at
 * the table could tap it), so the host confirms it before it counts. Remind links (person to
 * person) and a guest's own link are recorded straight away.
 */
export const needsHostConfirm = (l: Pick<PayLinkDoc, 'tableCode' | 'forUid'>): boolean => !!l.tableCode && !l.forUid

/** What "I've paid" moves the link to. A member who recorded it in Settle up has settled it already. */
export function claimStatus(l: Pick<PayLinkDoc, 'tableCode' | 'forUid'>, claim: PayLinkClaim): 'paid' | 'claimed' {
  return !claim.settlementId && needsHostConfirm(l) ? 'claimed' : 'paid'
}

/** The exact update "I've paid" writes: status, paidAt, paidBy and only the claim fields given. */
export function markPaidPatch(code: string, claim: PayLinkClaim, uid: string, now: number, status: 'paid' | 'claimed' = 'paid'): Partial<PayLinkDoc> {
  if (status === 'claimed' && claim.settlementId) throw new Error('A recorded payment is paid, not waiting')
  const patch: Partial<PayLinkDoc> = { status, paidAt: now, paidBy: uid }
  const method = claim.method?.trim().slice(0, 40)
  if (method) patch.method = method
  if (claim.proofPath !== undefined) {
    if (!isProofPath(code, claim.proofPath)) throw new Error('That screenshot path doesn’t belong to this link')
    patch.proofPath = claim.proofPath
  }
  if (claim.settlementId) patch.settlementId = claim.settlementId.slice(0, 64)
  return patch
}

/**
 * What the trigger does with a change (whatever the `payLinks` flag says: a claim is always honoured):
 *  record   → paid from open (or from claimed, the host confirming), unless a member already
 *             recorded it (settlementId) or it was handled (recordedAt)
 *  claimed  open → claimed: tell the host there is a payment to confirm
 */
export function triggerAction(before: Partial<PayLinkDoc> | undefined, after: Partial<PayLinkDoc> | undefined): 'record' | 'claimed' | null {
  if (!before || !after) return null
  if ((before.status === 'open' || before.status === 'claimed') && after.status === 'paid' && !after.settlementId && !after.recordedAt) return 'record'
  if (before.status === 'open' && after.status === 'claimed') return 'claimed'
  return null
}

/** The trigger records only on → paid (see triggerAction). */
export const shouldHandle = (before: Partial<PayLinkDoc> | undefined, after: Partial<PayLinkDoc> | undefined): boolean =>
  triggerAction(before, after) === 'record'

/** The group's activity line for a claim waiting for the host (targetId: the link code). */
export function claimSummary(l: Pick<PayLinkDoc, 'payerName' | 'payeeName' | 'amount'>, fmt: (minor: number) => string): string {
  return clip(`${l.payerName || 'Someone'} says they’ve paid ${fmt(l.amount)} to ${l.payeeName || 'Someone'}. Waiting for them to confirm.`, 500)
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

export interface PayLinkPaid {
  currency: string
  amount: number
  rate: number
  rateDate: string
  source: 'ecb'
}

export type RecordPlan =
  | { kind: 'record'; settlementId: string; settlement: PayLinkSettlement & { paid?: PayLinkPaid }; summary: string; payeeUid?: string }
  | { kind: 'notify'; payeeUid: string }
  | { kind: 'skip'; reason: 'no_group' | 'not_member' | 'bad_amount' | 'currency' | 'not_payee' }

/** Settlement ids for a link's parts: pl_{code}_{index}, so a re-run can never record twice. */
export const payLinkPartId = (code: string, i: number) => `${payLinkSettlementId(code)}_${i}`

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

/**
 * A link with `parts` (another currency, or several groups): one record per part, each checked
 * like a single link (both people in the group, the payee is the link's maker, the currency is the
 * group's), with the part's share of what was paid kept as `paid` when the currencies differ, at
 * the rate the two amounts imply. Parts that don't check out are skipped; the rest are recorded.
 */
export function planRecordParts(
  code: string,
  l: PayLinkDoc,
  groups: Record<string, GroupLite | null | undefined>,
  date: string,
  now: number,
  fmt: (minor: number, currency: string) => string,
  digits: (currency: string) => number,
): { records: Extract<RecordPlan, { kind: 'record' }>[]; skipped: { groupId: string; reason: Extract<RecordPlan, { kind: 'skip' }>['reason'] }[] } {
  const records: Extract<RecordPlan, { kind: 'record' }>[] = []
  const skipped: { groupId: string; reason: Extract<RecordPlan, { kind: 'skip' }>['reason'] }[] = []
  const parts = Array.isArray(l.parts) ? l.parts.slice(0, MAX_LINK_PARTS) : []
  parts.forEach((p, i) => {
    const one = planRecord(
      code,
      { ...l, groupId: p.groupId, from: p.from, to: p.to, amount: p.amount, currency: p.currency, parts: undefined },
      groups[p.groupId],
      date,
      now,
      (m) => fmt(m, p.currency),
    )
    if (one.kind !== 'record') {
      skipped.push({ groupId: String(p.groupId), reason: one.kind === 'skip' ? one.reason : 'no_group' })
      return
    }
    const other = p.currency !== l.currency && Number.isInteger(p.paid) && p.paid > 0
    const paid: PayLinkPaid | undefined = other
      ? {
          currency: l.currency,
          amount: p.paid,
          rate: Number((p.amount / 10 ** digits(p.currency) / (p.paid / 10 ** digits(l.currency))).toPrecision(10)),
          rateDate: date,
          source: 'ecb',
        }
      : undefined
    const paidText = paid ? `, paid ${fmt(paid.amount, paid.currency)}` : ''
    records.push({
      ...one,
      settlementId: payLinkPartId(code, i),
      settlement: { ...one.settlement, ...(paid ? { paid } : {}) },
      summary: clip(`${one.summary.replace(/ with a Pay me link\./, `${paidText} with a Pay me link.`)}`, 500),
    })
  })
  return { records, skipped }
}

/** Whether "I've paid" records a payment in a group (one group, or each of `parts`), rather than only telling the payee. */
export const recordsInGroup = (l: Pick<PayLinkDoc, 'groupId' | 'parts'>): boolean => !!l.groupId || !!l.parts?.length
