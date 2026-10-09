import { formatMoney } from './notify-text'

/*
 * The pure parts of the `nudge` callable (functions/src/nudge.ts): how much a nudge is about,
 * and what the activity entry says. The push text is nudgeNote in notify-text.ts.
 */

/*
 * A nudge also lands in the app: the activity entry is written even when the debtor gets no push
 * (no device registered, or reminders turned off), and their Home and Inbox show it
 * (src/lib/nudge-inbox.ts), so a sender is told `no_push` but the reminder still counts.
 */

/** One manual nudge per (sender, debtor, group) per day: the fixed windows of lib/ratelimit.ts. */
export const NUDGE_LIMIT = { perHour: 1, perDay: 1 }
export const DAY_MS = 86_400_000

/**
 * The amount a nudge is about: what the debtor still owes in the group, capped at what the
 * sender is owed (the debtor may owe several people). The app may pass the figure it shows
 * (the simplified debt); it is clamped to that cap and never trusted on its own. 0 = nothing
 * to nudge about.
 */
export function nudgeAmount(net: Record<string, number>, senderMemberId: string, debtorMemberId: string, requested?: unknown): number {
  const owedByDebtor = -(net[debtorMemberId] ?? 0)
  const owedToSender = net[senderMemberId] ?? 0
  const cap = Math.min(owedByDebtor, owedToSender)
  if (!Number.isFinite(cap) || cap <= 0) return 0
  const r = typeof requested === 'number' && Number.isInteger(requested) && requested > 0 ? requested : cap
  return Math.min(r, cap)
}

/** "Priya nudged Rahul to settle up (₹1,240)" */
export function nudgeSummary(fromName: string, toName: string, amount: number, currency: string): string {
  return `${fromName.slice(0, 40)} nudged ${toName.slice(0, 40)} to settle up (${formatMoney(amount, currency)})`
}

/** The server-only state after a nudge, and when the next one may go out. */
export function nextNudgeAt(prevDayStart: unknown, now: number): number {
  return typeof prevDayStart === 'number' ? prevDayStart + DAY_MS : now + DAY_MS
}

// ---- Several groups at once (the Balances screen's "by person" rows) ------------------------

/** At most this many groups in one cross-group nudge (one person rarely shares more). */
export const NUDGE_MAX_ITEMS = 20

export interface NudgeItem {
  groupId: string
  memberId: string
  /** the figure the app shows for this group (a hint, clamped like the single-group one) */
  amount?: number
}

const idShaped = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t)

/**
 * The callable's input: the original `{ groupId, memberId, amount? }` or `{ items: [...] }`
 * (1 to NUDGE_MAX_ITEMS, one entry per group; repeats of a group are dropped). `multi` is true
 * only when more than one group is left, so a one-item list behaves like the old call.
 * null = malformed (the callable answers invalid-argument).
 */
export function parseNudgeRequest(data: unknown): { items: NudgeItem[]; multi: boolean } | null {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const raw: unknown[] = Array.isArray(d.items) ? d.items : d.items === undefined ? [d] : []
  if (raw.length === 0 || raw.length > NUDGE_MAX_ITEMS) return null
  const items: NudgeItem[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    if (!idShaped(x.groupId) || !idShaped(x.memberId)) return null
    if (seen.has(x.groupId)) continue
    seen.add(x.groupId)
    const amount = typeof x.amount === 'number' && Number.isInteger(x.amount) && x.amount > 0 ? x.amount : undefined
    items.push(amount === undefined ? { groupId: x.groupId, memberId: x.memberId } : { groupId: x.groupId, memberId: x.memberId, amount })
  }
  return { items, multi: items.length > 1 }
}

/** One group of a cross-group nudge, after the server worked out the balances there. */
export interface GroupNudge {
  groupId: string
  groupName: string
  emoji?: string
  currency: string
  /** the debtor's member id in this group */
  memberId: string
  senderMemberId: string
  /** what the debtor owes the sender here (nudgeAmount), ≥ 0 */
  owed: number
  /** what the sender owes the debtor here (the other direction), ≥ 0 */
  owes: number
}

/**
 * What a cross-group nudge is about: one currency (the first group where something is owed;
 * groups in other currencies are a different balance and sit out), the net across those groups
 * (what the sender is owed minus what they owe the debtor, matching the Balances screen's
 * "by person" figure), and the groups where the debtor owes something (each gets an activity
 * entry). null = nothing owed overall.
 */
export function crossGroupPlan(parts: GroupNudge[]): { currency: string; total: number; owed: GroupNudge[] } | null {
  const first = parts.find((p) => p.owed > 0)
  if (!first) return null
  const same = parts.filter((p) => p.currency === first.currency)
  const total = same.reduce((s, p) => s + p.owed - p.owes, 0)
  if (!(total > 0)) return null
  return { currency: first.currency, total, owed: same.filter((p) => p.owed > 0) }
}

/** The debtor's cross-group Settle up screen, keyed by the sender (src/lib/settleAll.ts personKey + currency). */
export const settleWithPath = (senderUid: string, currency: string) => `/settle/with/${encodeURIComponent(`u:${senderUid}|${currency}`)}`
