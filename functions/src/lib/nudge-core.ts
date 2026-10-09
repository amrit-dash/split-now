import { formatMoney } from './notify-text'

/*
 * The pure parts of the `nudge` callable (functions/src/nudge.ts): how much a nudge is about,
 * and what the activity entry says. The push text is nudgeNote in notify-text.ts.
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
