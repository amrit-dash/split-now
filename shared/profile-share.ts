/*
 * What a person's profile shares with the groups they are in, decided in one place for the app
 * and the server. Each group keeps two copies of it: the member entry (`members.{id}`: name, photo,
 * Pro and Dev marks) and the per-group profile (`groups/{gid}/profiles/{uid}`: the shared part of
 * users/{uid}, for Settle up and avatars). The person's own app writes both when it runs
 * (src/hooks/auth.tsx useOwnMemberSync, firebaseRepo saveProfile), and the server writes the same
 * values the moment the profile changes or the person joins (functions/src/profileSync.ts), so
 * co-members don't wait for that person to open the app. Both sides compute from these functions,
 * so they always agree and neither rewrites what the other wrote.
 * Pure: shared by the app and Cloud Functions, matched structurally (no @/types).
 */

export const MAX_PHOTO_URL = 2048
export const MAX_MEMBER_NAME = 100

/**
 * A photo URL that may be shown to co-members: https only (rules check the same), or a data:
 * URL in demo mode (stays on this device). Anything else is dropped.
 */
export function sharedPhotoURL(url: string | undefined | null, allowData = false): string | undefined {
  if (!url) return undefined
  if (/^https:\/\/./.test(url) && url.length <= MAX_PHOTO_URL) return url
  if (allowData && url.startsWith('data:image/')) return url
  return undefined
}

export interface BadgeFields {
  /** when Help reached 100% (epoch ms); set once, never cleared by the app */
  proAt?: number
  /** Preferences → Show my Pro badge, off: no badge anywhere, for anyone; proAt stays */
  proHidden?: boolean
  /** Preferences → Show my Dev badge (admins), off */
  devHidden?: boolean
}

/** Whether this person finished Help (whatever they chose to show). */
export function hasEarnedPro(p: BadgeFields | null | undefined): boolean {
  return typeof p?.proAt === 'number' && Number.isFinite(p.proAt) && p.proAt > 0
}

/** Whether their badge shows: earned, and not turned off. */
export function proShown(p: BadgeFields | null | undefined): boolean {
  return hasEarnedPro(p) && p?.proHidden !== true
}

/** Whether their Dev badge shows: an admin who hasn't turned it off. */
export function devShown(p: BadgeFields | null | undefined, isAdmin: boolean): boolean {
  return isAdmin && p?.devHidden !== true
}

/** The parts of users/{uid} that groups get a copy of. */
export interface ShareableProfile<P = unknown> extends BadgeFields {
  displayName?: string
  photoURL?: string | null
  payment?: P
  currency?: string
  collectInHome?: boolean
}

/** groups/{gid}/profiles/{uid}: what the rules accept there, no undefined values. */
export interface SharedProfileCopy<P = unknown> {
  displayName?: string
  payment: P | Record<string, never>
  photoURL?: string
  currency?: string
  collect: boolean
  pro?: true
  dev?: true
}

/** The per-group profile copy of `p` (`admin`: admins/{uid} exists, so Dev shows unless hidden). */
export function sharedProfileCopy<P>(p: ShareableProfile<P>, admin = false): SharedProfileCopy<P> {
  const photo = sharedPhotoURL(p.photoURL)
  const currency = p.currency && /^[A-Z]{3}$/.test(p.currency) ? p.currency : undefined
  // Absent fields are left out (not undefined): Firestore refuses undefined, and the copy is compared as JSON.
  return {
    ...(p.displayName !== undefined ? { displayName: p.displayName } : {}),
    payment: p.payment ?? {},
    ...(photo ? { photoURL: photo } : {}),
    ...(currency ? { currency } : {}),
    // On unless turned off (src/lib/collect.ts collectsInHome); always written, so payers see the choice.
    collect: p.collectInHome !== false,
    // Only while it shows: turning the badge off removes it (the doc is replaced, not merged).
    ...(proShown(p) ? { pro: true as const } : {}),
    ...(devShown(p, admin) ? { dev: true as const } : {}),
  }
}

/** JSON with object keys sorted, so two documents with the same content give the same text. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

/**
 * Whether anything a group sees of this profile changed between two versions of users/{uid}.
 * Most profile writes (help progress, preferences, voiceTried) don't, and the server stops there.
 */
export function sharedPartChanged(before: ShareableProfile | null | undefined, after: ShareableProfile | null | undefined): boolean {
  if (!after) return false
  if (!before) return true
  // admin = true includes devHidden in the comparison; the admin bit itself isn't in users/{uid}.
  return stableJson(sharedProfileCopy(before, true)) !== stableJson(sharedProfileCopy(after, true))
}

/** What a linked member's entry should say: their profile name, photo and marks (absent = remove it). */
export interface MemberEntryPatch {
  name: string
  photoURL?: string
  /** true while their Pro badge shows; absent = remove it */
  pro?: boolean
  /** true while their Dev badge shows (admins only); absent = remove it */
  dev?: boolean
}

export interface MemberEntryLike {
  name?: string
  uid?: string
  removedAt?: number
  photoURL?: string
  pro?: unknown
  dev?: unknown
}

/**
 * What a member entry should say for this profile, or null when it already does. A blank profile
 * name keeps the entry's name.
 */
export function memberEntryPatch(
  entry: MemberEntryLike,
  profile: Pick<ShareableProfile, 'displayName' | 'photoURL' | 'proAt' | 'proHidden' | 'devHidden'>,
  opts: { admin?: boolean; allowData?: boolean } = {},
): MemberEntryPatch | null {
  const photo = sharedPhotoURL(profile.photoURL, opts.allowData)
  const pro = proShown(profile)
  const dev = devShown(profile, opts.admin === true)
  const name = profile.displayName?.trim().slice(0, MAX_MEMBER_NAME) || entry.name || ''
  if (entry.name === name && (entry.photoURL ?? undefined) === photo && (entry.pro === true) === pro && (entry.dev === true) === dev) return null
  return { name, ...(photo ? { photoURL: photo } : {}), ...(pro ? { pro: true } : {}), ...(dev ? { dev: true } : {}) }
}
