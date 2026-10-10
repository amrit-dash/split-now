import type { Cents, MemberId, PaymentHandles } from '@/types'
import {
  canMarkPaid,
  isPayLinkCode,
  linkHandles,
  PAY_LINK_CODE_LEN,
  PAY_LINK_TTL_MS,
  payLinkState,
  recordsInGroup,
  type PayLinkDoc,
  type PayLinkPart,
  type PayLinkStatus,
} from '../../shared/paylinks'

/*
 * Pay me links on the app side (shared/paylinks.ts has the document and the rules' logic).
 * The Remind sheet and a finished live table create them; /r/{code} (src/pages/PayLink.tsx)
 * opens them for anyone with the code, account or not.
 */

export * from '../../shared/paylinks'

/** A link as the app reads it: the document plus its id. */
export interface PayLink extends PayLinkDoc {
  code: string
}
export type NewPayLink = Omit<PayLinkDoc, 'status' | 'paidAt' | 'paidBy' | 'method' | 'proofPath' | 'cancelledAt' | 'settlementId' | 'recordedAt'>

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** 24 random characters from 32 symbols (120 bits): unguessable, like a capture key. */
export function newPayLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAY_LINK_CODE_LEN))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** https://split-now.web.app/r/{code} */
export const payLinkUrl = (origin: string, code: string) => `${origin}/r/${code}`

/** A code from a pasted link or the bare code; '' when it isn't one. */
export function parsePayLinkCode(input: string): string {
  const m = input.match(/\/r\/([A-Za-z0-9]+)/)
  const c = (m ? m[1] : input).trim().toLowerCase()
  return isPayLinkCode(c) ? c : ''
}

export interface PayLinkArgs {
  groupId?: string
  groupName: string
  emoji?: string
  tableCode?: string
  from: { id: MemberId; name: string }
  to: { id: MemberId; name: string }
  amount: Cents
  currency: string
  /** the payee's own handles; only the ones a link may carry are kept */
  payment?: PaymentHandles
  forUid?: string
  createdBy: string
  /** instead of groupId: the groups it clears, in their own currencies (another currency or several groups) */
  parts?: PayLinkPart[]
}

/** The document a payee creates. Pure (`now` given) so the shape is tested against the rules' whitelist. */
export function buildPayLink(a: PayLinkArgs, now: number): NewPayLink {
  const l: NewPayLink = {
    groupName: a.groupName.trim().slice(0, 80) || 'Split Now',
    from: a.from.id,
    to: a.to.id,
    amount: Math.round(a.amount),
    currency: a.currency,
    payeeName: a.to.name.trim().slice(0, 80) || 'Someone',
    payerName: a.from.name.trim().slice(0, 80) || 'Someone',
    payment: linkHandles(a.payment as Record<string, unknown> | undefined),
    createdBy: a.createdBy,
    createdAt: now,
    expiresAt: now + PAY_LINK_TTL_MS,
  }
  if (a.groupId) l.groupId = a.groupId
  if (a.emoji) l.emoji = a.emoji.slice(0, 16)
  if (a.tableCode) l.tableCode = a.tableCode
  if (a.forUid) l.forUid = a.forUid
  if (a.parts?.length) {
    delete l.groupId
    l.parts = a.parts.map((p) => ({ ...p, groupName: p.groupName.trim().slice(0, 80) || 'Group', amount: Math.round(p.amount), paid: Math.round(p.paid) }))
  }
  return l
}

/** Settle up, prefilled, for a member who opens a link of their own group (the in-app path). */
export function settleUpPath(l: Pick<PayLink, 'code' | 'groupId' | 'from' | 'to' | 'amount'>): string {
  const q = new URLSearchParams({ from: l.from, to: l.to, amount: String(l.amount), link: l.code })
  return `/groups/${encodeURIComponent(l.groupId ?? '')}/settle?${q}`
}

/**
 * Which screen /r/{code} shows:
 *  settle   a signed-in member of the link's group: their prefilled Settle up (the in-app path)
 *  payee    the person who made the link: its status, the screenshot, Cancel
 *  pay      anyone else, while it is open (and, for a table guest's link, only that guest)
 *  claimed  someone said they paid; the host still has to confirm
 *  paid / expired / cancelled / missing / notYours
 */
export type PayLinkView = 'loading' | 'missing' | 'settle' | 'payee' | 'pay' | 'notYours' | 'claimed' | 'paid' | 'expired' | 'cancelled'

export function payLinkView(
  l: PayLink | null | undefined,
  v: { uid?: string; anonymous: boolean; member: boolean | undefined; guestMode?: boolean },
  now: number,
): PayLinkView {
  if (l === undefined) return 'loading'
  if (l === null) return 'missing'
  const state: PayLinkStatus | 'expired' = payLinkState(l, now)
  if (!v.guestMode && v.uid && v.uid === l.createdBy) return 'payee'
  if (state !== 'open') return state
  if (!v.guestMode && !v.anonymous && v.uid && l.groupId) {
    if (v.member === undefined) return 'loading'
    if (v.member) return 'settle'
  }
  return canMarkPaid(l, now, v.uid) ? 'pay' : 'notYours'
}

/**
 * What the `payLinks` flag switches (owner's decision): off stops new links (Remind shares the
 * members-only Settle up link, a finished table makes no guest links) and hides the guest
 * screens. A claim on a link that already exists is always recorded, and the payee can always
 * confirm or dismiss one, so nothing waits for the flag.
 */
export function payLinkFeatures(flagOn: boolean): { createLinks: boolean; guestPages: boolean; recordClaims: true; payeeTools: true } {
  return { createLinks: flagOn, guestPages: flagOn, recordClaims: true, payeeTools: true }
}

/** Claims waiting for the payee, newest claim first (ties by code, so the order is stable). */
export function sortClaims<T extends { paidAt?: number; code: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0) || a.code.localeCompare(b.code))
}

/** The claims that belong to one group (its card on the group screen); table links without a group live only in the Inbox. */
export function claimsInGroup<T extends { groupId?: string; status: string }>(list: readonly T[] | null | undefined, groupId: string): T[] {
  return (list ?? []).filter((l) => l.groupId === groupId && l.status === 'claimed')
}

/** The SettleUp link param: the code, only when the payment recorded is the one the link asked for. */
export function linkToClose(param: string | null, link: { from: string; to: string }, recorded: { from: string; to: string }): string | undefined {
  return param && isPayLinkCode(param) && link.from === recorded.from && link.to === recorded.to ? param : undefined
}

/** "Paid 7 Oct", "Open until 6 Nov", … for the payee's status line. */
export function statusLine(
  l: Pick<PayLink, 'status' | 'expiresAt' | 'paidAt' | 'cancelledAt' | 'settlementId' | 'groupId' | 'parts'>,
  now: number,
  fmt: (ms: number) => string,
): string {
  const s = payLinkState(l, now)
  if (s === 'claimed') return `Says they’ve paid${l.paidAt ? ` ${fmt(l.paidAt)}` : ''} · confirm it`
  if (s === 'paid')
    return `Marked paid${l.paidAt ? ` ${fmt(l.paidAt)}` : ''}${recordsInGroup(l) ? (l.settlementId ? ` · recorded in the group${l.parts && l.parts.length > 1 ? 's' : ''}` : ' · recording…') : ''}`
  if (s === 'cancelled') return `Cancelled${l.cancelledAt ? ` ${fmt(l.cancelledAt)}` : ''}`
  if (s === 'expired') return `Expired ${fmt(l.expiresAt)}`
  return `Waiting for payment · open until ${fmt(l.expiresAt)}`
}

// ---- Live tables -------------------------------------------------------------------------

/** What a finished table needs to give each guest their own Pay me link. */
export interface TableLinkSource {
  code: string
  hostUid: string
  merchant: string
  currency: string
  participants: Record<string, { name: string; uid?: string }>
  hostPayment?: PaymentHandles
}

export interface PlannedLink {
  code: string
  link: NewPayLink
}

export interface TableLinks {
  links: PlannedLink[]
  /** participant id → link code (stored on the table as `payLinks`) */
  byParticipant: Record<string, string>
}

/**
 * Finished into a group: one link per member who owes the payer, for exactly their share of the
 * expense (so recording it clears that share). Participants mapped to the same member share it;
 * it is locked to a guest's uid only when that member is one guest with a phone.
 */
export function groupTableLinks(
  t: TableLinkSource,
  g: { id: string; name: string; emoji?: string; members: Record<MemberId, { name: string }> },
  mapping: Record<string, MemberId>,
  payer: MemberId,
  splits: Record<MemberId, Cents>,
  createdBy: string,
  now: number,
  newCode: () => string = newPayLinkCode,
): TableLinks {
  const out: TableLinks = { links: [], byParticipant: {} }
  const byMember = new Map<MemberId, string[]>()
  for (const [pid, m] of Object.entries(mapping)) {
    if (pid === t.hostUid || m === payer || !((splits[m] ?? 0) > 0)) continue
    byMember.set(m, [...(byMember.get(m) ?? []), pid])
  }
  for (const [m, pids] of byMember) {
    const uids = pids.map((p) => t.participants[p]?.uid).filter((u): u is string => !!u && u !== t.hostUid)
    const code = newCode()
    out.links.push({
      code,
      link: buildPayLink(
        {
          groupId: g.id,
          groupName: g.name,
          emoji: g.emoji,
          tableCode: t.code,
          from: { id: m, name: g.members[m]?.name ?? t.participants[pids[0]]?.name ?? 'Someone' },
          to: { id: payer, name: g.members[payer]?.name ?? t.participants[t.hostUid]?.name ?? 'Someone' },
          amount: splits[m],
          currency: t.currency,
          payment: t.hostPayment,
          forUid: pids.length === 1 && uids.length === 1 ? uids[0] : undefined,
          createdBy,
        },
        now,
      ),
    })
    for (const p of pids) out.byParticipant[p] = code
  }
  return out
}

/** Closed without a group ("just show who owes what"): one link per guest for their table total; "I've paid" only tells the host. */
export function openTableLinks(
  t: TableLinkSource,
  totals: Record<string, { total: Cents }>,
  createdBy: string,
  now: number,
  newCode: () => string = newPayLinkCode,
): TableLinks {
  const out: TableLinks = { links: [], byParticipant: {} }
  for (const [pid, p] of Object.entries(t.participants)) {
    const amount = totals[pid]?.total ?? 0
    if (pid === t.hostUid || amount <= 0) continue
    const code = newCode()
    out.links.push({
      code,
      link: buildPayLink(
        {
          groupName: t.merchant,
          emoji: '🍽️',
          tableCode: t.code,
          from: { id: pid, name: p.name },
          to: { id: t.hostUid, name: t.participants[t.hostUid]?.name ?? 'The host' },
          amount,
          currency: t.currency,
          payment: t.hostPayment,
          forUid: p.uid && p.uid !== t.hostUid ? p.uid : undefined,
          createdBy,
        },
        now,
      ),
    })
    out.byParticipant[pid] = code
  }
  return out
}
