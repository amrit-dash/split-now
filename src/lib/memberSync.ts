import type { Group, MemberId, UserProfile } from '@/types'
import { devShown, proShown } from './pro'

/**
 * Member photos are denormalised into each group's `members` map (like names already are), so
 * every screen that has the group doc can show them: no extra reads, and it works offline.
 * Each user's own app copies their profile name + photo into the member entries that carry
 * their uid (rules let a member edit only their own entry's name/photoURL).
 */

export const MAX_PHOTO_URL = 2048

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

export const MAX_MEMBER_NAME = 100

/** What a linked member's entry should say: their profile name, photo and Pro mark (none = remove it). */
export interface OwnMemberPatch {
  name: string
  photoURL?: string
  /** true while their Pro badge shows (src/lib/pro.ts); absent = remove it */
  pro?: boolean
  /** true while their Dev badge shows (admins only); absent = remove it */
  dev?: boolean
}

export interface PendingMemberSync {
  group: Group
  memberId: MemberId
  patch: OwnMemberPatch
}

/**
 * Member entries of `uid` whose name, photo or Pro mark differ from the profile. A blank profile
 * name keeps the entry's name.
 */
export function ownMemberSyncs(
  groups: Group[],
  uid: string,
  profile: Pick<UserProfile, 'displayName' | 'photoURL'> & Partial<Pick<UserProfile, 'proAt' | 'proHidden' | 'devHidden'>>,
  allowData = false,
  admin = false,
): PendingMemberSync[] {
  const photo = sharedPhotoURL(profile.photoURL, allowData)
  const pro = proShown(profile)
  const dev = devShown(profile, admin)
  const profileName = profile.displayName?.trim().slice(0, MAX_MEMBER_NAME)
  const out: PendingMemberSync[] = []
  for (const group of groups) {
    for (const [memberId, m] of Object.entries(group.members ?? {})) {
      // an entry you left behind isn't yours to edit any more (and the rules refuse it)
      if (!m || m.uid !== uid || typeof m.removedAt === 'number') continue
      const name = profileName || m.name
      if (m.name === name && (m.photoURL ?? undefined) === photo && (m.pro === true) === pro && (m.dev === true) === dev) continue
      out.push({ group, memberId, patch: { name, ...(photo ? { photoURL: photo } : {}), ...(pro ? { pro: true } : {}), ...(dev ? { dev: true } : {}) } })
    }
  }
  return out
}

/**
 * The groups a profile save copies the shared part into (groups/{id}/profiles/{uid}): the ones
 * still in use. A group in Recently deleted refuses the write (the rules' groupLive), and in one
 * batch with the profile that refusal used to undo the whole save, photo and all.
 */
export function profileCopyTargets(groups: ReadonlyArray<{ id: string; data: { deletedAt?: unknown } }>): string[] {
  return groups.filter((g) => typeof g.data.deletedAt !== 'number').map((g) => g.id)
}
