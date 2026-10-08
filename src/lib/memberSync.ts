import type { Group, MemberId, UserProfile } from '@/types'

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

/** What a linked member's entry should say: their profile name and photo (none = remove it). */
export interface OwnMemberPatch {
  name: string
  photoURL?: string
}

export interface PendingMemberSync {
  group: Group
  memberId: MemberId
  patch: OwnMemberPatch
}

/**
 * Member entries of `uid` whose name or photo differ from the profile. A blank profile name
 * keeps the entry's name.
 */
export function ownMemberSyncs(groups: Group[], uid: string, profile: Pick<UserProfile, 'displayName' | 'photoURL'>, allowData = false): PendingMemberSync[] {
  const photo = sharedPhotoURL(profile.photoURL, allowData)
  const profileName = profile.displayName?.trim().slice(0, MAX_MEMBER_NAME)
  const out: PendingMemberSync[] = []
  for (const group of groups) {
    for (const [memberId, m] of Object.entries(group.members ?? {})) {
      if (!m || m.uid !== uid) continue
      const name = profileName || m.name
      if (m.name === name && (m.photoURL ?? undefined) === photo) continue
      out.push({ group, memberId, patch: photo ? { name, photoURL: photo } : { name } })
    }
  }
  return out
}
