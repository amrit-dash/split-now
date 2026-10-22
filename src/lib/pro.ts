/*
 * Pro (docs/PENDING.md, Pro badge): a mark for people who finished Help. It is cosmetic: the
 * app sets it on the person's own profile (users/{uid}.proAt, the date earned, set once) and
 * shares `pro: true` with their groups (their member entries and per-group profiles) unless they
 * turned the badge off in Preferences (proHidden). No server checks it; nothing depends on it.
 */

/** Help's section on how Pro is earned; tapping someone else's mark opens it. */
export const EARN_PRO_PATH = '/help/earn-pro'

export interface ProFields {
  /** when Help reached 100% (epoch ms); set once, never cleared by the app */
  proAt?: number
  /** Preferences → Show my Pro badge, off: no badge anywhere, for anyone; proAt stays */
  proHidden?: boolean
}

/** Whether this person finished Help (whatever they chose to show). */
export function hasEarnedPro(p: ProFields | null | undefined): boolean {
  return typeof p?.proAt === 'number' && Number.isFinite(p.proAt) && p.proAt > 0
}

/** Whether their badge shows: earned, and not turned off. */
export function proShown(p: ProFields | null | undefined): boolean {
  return hasEarnedPro(p) && p?.proHidden !== true
}

/** A co-member's mark, from their member entry (or per-group profile): only `true` counts. */
export function memberPro(m: { pro?: unknown } | null | undefined): boolean {
  return m?.pro === true
}

/**
 * The profile with Pro awarded `now`, or null when it already was (the first date stays; turning
 * the badge off and on again doesn't make it new).
 */
export function withProAwarded<T extends ProFields>(p: T, now: number): T | null {
  if (hasEarnedPro(p)) return null
  return { ...p, proAt: now }
}

/**
 * What tapping someone else's mark does: someone who hasn't earned Pro learns how; someone who
 * has needs no telling, so the mark is just a mark (not a button) for them.
 */
export function proTapTarget(viewerEarned: boolean): string | null {
  return viewerEarned ? null : EARN_PRO_PATH
}

/** The spoken name of a mark: what it is, and what tapping does when it does something. */
export function proMarkLabel(tappable: boolean): string {
  return tappable ? 'Pro. How to earn it' : 'Pro'
}
