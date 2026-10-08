import type { ActivityEntry, Cents, MemberId } from '@/types'

/*
 * Nudges: a push to someone who owes you, sent by the `nudge` callable (functions/src/nudge.ts),
 * at most once per day per (you, them, group). The server writes a `settlement.nudged` activity
 * entry, which is how every device learns a nudge went out; this device also remembers it
 * (demo mode has no server entry, and the activity listener takes a moment to catch up).
 */

export const NUDGE_COOLDOWN_MS = 24 * 3_600_000

export type NudgeResult =
  | { sent: true; amount: Cents }
  | { sent: false; reason: 'rate_limited' | 'no_push' | 'not_owed' | 'not_member' | 'off' | 'unavailable'; nextAllowedAt?: number }

/** When the signed-in user last nudged this member in this group, from the group's activity feed. */
export function lastNudgeAt(feed: ActivityEntry[] | null | undefined, byUid: string, memberId: MemberId): number | undefined {
  let last: number | undefined
  for (const a of feed ?? []) {
    if (a.type !== 'settlement.nudged' || a.actorUid !== byUid || a.targetId !== memberId) continue
    if (last === undefined || a.createdAt > last) last = a.createdAt
  }
  return last
}

export const nudgedRecently = (lastAt: number | undefined, now = Date.now()) => lastAt !== undefined && now - lastAt < NUDGE_COOLDOWN_MS

/** "Already nudged today. You can nudge Rahul again tomorrow." */
export function nudgeCooldownText(name: string): string {
  return `Already nudged today. You can nudge ${name} again tomorrow.`
}

export function nudgeResultText(r: NudgeResult, name: string, money: (c: Cents) => string): string {
  if (r.sent) return `Nudged ${name}: you owe ${money(r.amount)}`
  switch (r.reason) {
    case 'rate_limited':
      return nudgeCooldownText(name)
    case 'no_push':
      return `${name} isn’t getting notifications. Share a reminder instead.`
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
