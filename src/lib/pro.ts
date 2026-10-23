/*
 * The badge (docs/PENDING.md, Pro badge): one word beside a person, in three versions.
 *  - PRO: they finished Help. Cosmetic: the app sets it on their own profile (users/{uid}.proAt,
 *    the date earned, set once) and shares `pro: true` with their groups (member entries and
 *    per-group profiles) unless they turned it off in Preferences (proHidden). No server check.
 *  - DEV: they are an admin (admins/{uid}, the rules' isAdmin()). Shared as `dev: true`, which the
 *    rules accept only from an admin, so it can't be faked; off in Preferences with devHidden.
 *  - PRO DEV: both.
 * Only PRO is tappable (it opens Help on how to earn it); DEV and PRO DEV are just marks.
 */

/** Which word a badge says. */
export type BadgeWord = 'pro' | 'dev' | 'prodev'

/** Help's section on how Pro is earned; tapping someone else's mark opens it. */
export const EARN_PRO_PATH = '/help/earn-pro'

export interface ProFields {
  /** when Help reached 100% (epoch ms); set once, never cleared by the app */
  proAt?: number
  /** Preferences → Show my Pro badge, off: no badge anywhere, for anyone; proAt stays */
  proHidden?: boolean
  /** Preferences → Show my Dev badge (admins), off */
  devHidden?: boolean
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

/** Whether their Dev badge shows: an admin who hasn't turned it off. */
export function devShown(p: ProFields | null | undefined, isAdmin: boolean): boolean {
  return isAdmin && p?.devHidden !== true
}

const wordOf = (pro: boolean, dev: boolean): BadgeWord | null => (pro && dev ? 'prodev' : pro ? 'pro' : dev ? 'dev' : null)

/**
 * Your own badge, if any: PRO once Help is done (unless hidden), DEV for an admin (unless hidden),
 * PRO DEV for both. The two switches are independent.
 */
export function badgeWord(p: ProFields | null | undefined, isAdmin: boolean): BadgeWord | null {
  return wordOf(proShown(p), devShown(p, isAdmin))
}

/** Someone else's badge, from their member entry or per-group profile (`pro`, `dev`: only true counts). */
export function memberBadge(m: { pro?: unknown; dev?: unknown } | null | undefined): BadgeWord | null {
  return wordOf(m?.pro === true, m?.dev === true)
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

/** Where tapping someone else's badge goes: only a plain PRO links anywhere (DEV and PRO DEV are just marks). */
export function badgeTapTarget(word: BadgeWord, viewerEarned: boolean): string | null {
  return word === 'pro' ? proTapTarget(viewerEarned) : null
}

const SPOKEN: Record<BadgeWord, string> = { pro: 'Pro', dev: 'Dev', prodev: 'Pro, Dev' }

/** The spoken name of a mark: what it says, and what tapping does when it does something. */
export function badgeLabel(word: BadgeWord, tappable: boolean): string {
  return tappable ? `${SPOKEN[word]}. How to earn it` : SPOKEN[word]
}

/** The badge of a 1:1's friend (their member entry's marks), if any. */
export function friendBadge(g: {
  type?: string
  peer?: string
  members?: Record<string, { name?: string; pro?: unknown; dev?: unknown } | undefined>
}): BadgeWord | null {
  return g.type === 'direct' && g.peer ? memberBadge(g.members?.[g.peer]) : null
}

/**
 * Profile's name line with the badge pill beside it (owner, 23 Oct 2026), from measured widths:
 * the full name and the pill when both fit; else the first name and the pill; else the full name
 * alone (cut short if it must), and the ring round the photo says the badge.
 */
export function nameWithPill(o: { full: string; first: string; fullW: number; firstW: number; pillW: number; gap: number; room: number }): {
  text: string
  pill: boolean
} {
  if (o.fullW + o.gap + o.pillW <= o.room) return { text: o.full, pill: true }
  if (o.first && o.first !== o.full && o.firstW + o.gap + o.pillW <= o.room) return { text: o.first, pill: true }
  return { text: o.full, pill: false }
}
