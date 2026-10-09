import type { ActivityEntry, Cents, MemberId } from '@/types'

/*
 * Nudges: a push to someone who owes you, sent by the `nudge` callable (functions/src/nudge.ts),
 * at most once per day per (you, them, group). The server writes a `settlement.nudged` activity
 * entry, which is how every device learns a nudge went out; this device also remembers it
 * (demo mode has no server entry, and the activity listener takes a moment to catch up).
 */

export const NUDGE_COOLDOWN_MS = 24 * 3_600_000

export type NudgeResult =
  /** `groups`: how many groups a cross-group nudge covered */
  | { sent: true; amount: Cents; groups?: number }
  /** no device to push to: the server still wrote the reminder, which the debtor sees in the app */
  | { sent: false; reason: 'no_push'; amount?: Cents; groups?: number }
  | { sent: false; reason: 'rate_limited' | 'not_owed' | 'not_member' | 'off' | 'unavailable'; nextAllowedAt?: number }

/** One group of a cross-group nudge (the callable's `items`); `amount` is the figure shown, a hint only. */
export interface NudgeItem {
  groupId: string
  memberId: MemberId
  amount?: Cents
}

/**
 * When the signed-in user last nudged this member in this group, from the activity feed: a
 * group's own feed, or several groups' merged (then pass `groupId`, member ids are per group).
 */
export function lastNudgeAt(feed: ActivityEntry[] | null | undefined, byUid: string, memberId: MemberId, groupId?: string): number | undefined {
  let last: number | undefined
  for (const a of feed ?? []) {
    if (a.type !== 'settlement.nudged' || a.actorUid !== byUid || a.targetId !== memberId || (groupId !== undefined && a.groupId !== groupId)) continue
    if (last === undefined || a.createdAt > last) last = a.createdAt
  }
  return last
}

export const nudgedRecently = (lastAt: number | undefined, now = Date.now()) => lastAt !== undefined && now - lastAt < NUDGE_COOLDOWN_MS

/** "Already nudged today. You can nudge Rahul again tomorrow." */
export function nudgeCooldownText(name: string): string {
  return `Already nudged today. You can nudge ${name} again tomorrow.`
}

/** Several groups' nudges at once count as one: the newest of them, if any. */
export function lastNudgeAcross(
  parts: Array<{ groupId: string; memberId: MemberId }>,
  feed: ActivityEntry[] | null | undefined,
  byUid: string,
  local: (groupId: string, memberId: MemberId) => number | undefined = localNudgeAt,
): number | undefined {
  let last: number | undefined
  for (const p of parts) {
    const at = lastNudgeAt(feed, byUid, p.memberId, p.groupId) ?? local(p.groupId, p.memberId)
    if (at !== undefined && (last === undefined || at > last)) last = at
  }
  return last
}

/** "Rahul has notifications off, so share it instead": the toast that comes with the share sheet. */
export const noPushText = (name: string) => `${name} has notifications off, so share it instead`

export function nudgeResultText(r: NudgeResult, name: string, money: (c: Cents) => string): string {
  if (r.sent) return r.groups && r.groups > 1 ? `Nudged ${name}: ${money(r.amount)} across ${r.groups} groups` : `Nudged ${name}: you owe ${money(r.amount)}`
  switch (r.reason) {
    case 'rate_limited':
      return nudgeCooldownText(name)
    case 'no_push':
      return noPushText(name)
    case 'not_owed':
      return `${name} doesn’t owe you anything here right now.`
    case 'not_member':
      return `${name} hasn’t joined Split Now yet. Share a reminder instead.`
    case 'off':
      return 'Nudges are turned off right now. Share a reminder instead.'
    default:
      return 'Couldn’t send the nudge. Share a reminder instead.'
  }
}

// ---- Per-device memory ------------------------------------------------------------

export interface NudgeStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

let storage: NudgeStorage | undefined = (() => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
})()

/** Tests: swap in an in-memory store (or undefined for "no storage"). */
export function setNudgeStorage(s: NudgeStorage | undefined) {
  storage = s
}

const KEY = 'splitit-nudged'

function readAll(): Record<string, number> {
  try {
    return (JSON.parse(storage?.getItem(KEY) ?? '{}') as Record<string, number>) ?? {}
  } catch {
    return {}
  }
}

export function rememberNudge(groupId: string, memberId: MemberId, at = Date.now()) {
  try {
    const all = readAll()
    // Drop stale entries so the map never grows past what matters.
    for (const [k, v] of Object.entries(all)) if (at - v >= NUDGE_COOLDOWN_MS) delete all[k]
    all[`${groupId}/${memberId}`] = at
    storage?.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
}

/** When this device last nudged them, if within the cooldown. */
export function localNudgeAt(groupId: string, memberId: MemberId, now = Date.now()): number | undefined {
  const at = readAll()[`${groupId}/${memberId}`]
  return typeof at === 'number' && now - at < NUDGE_COOLDOWN_MS ? at : undefined
}
