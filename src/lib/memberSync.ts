import type { Group, MemberId, UserProfile } from '@/types'
import { memberEntryPatch, type MemberEntryPatch } from '../../shared/profile-share'

/**
 * Member photos are denormalised into each group's `members` map (like names already are), so
 * every screen that has the group doc can show them: no extra reads, and it works offline.
 * Each user's own app copies their profile name + photo into the member entries that carry
 * their uid (rules let a member edit only their own entry's name/photoURL), and the server copies
 * the same values when the profile changes or they join (functions/src/profileSync.ts), so
 * co-members don't wait for them to open the app.
 */

// The rule itself is shared with the server, which makes the same copies (shared/profile-share.ts).
export { MAX_MEMBER_NAME, MAX_PHOTO_URL, sharedPhotoURL } from '../../shared/profile-share'

/** What a linked member's entry should say: their profile name, photo and Pro mark (none = remove it). */
export type OwnMemberPatch = MemberEntryPatch

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
  const out: PendingMemberSync[] = []
  for (const group of groups) {
    for (const [memberId, m] of Object.entries(group.members ?? {})) {
      // an entry you left behind isn't yours to edit any more (and the rules refuse it)
      if (!m || m.uid !== uid || typeof m.removedAt === 'number') continue
      const patch = memberEntryPatch(m, profile, { admin, allowData })
      if (patch) out.push({ group, memberId, patch })
    }
  }
  return out
}

/**
 * The groups a profile save copies the shared part into (groups/{id}/profiles/{uid}): the ones
 * still in use. A group in Recently deleted refuses the write (the rules' groupLive), and in one
 * batch with the profile that refusal used to undo the whole save, photo and all. A private group
 * is marked: its copy is sealed with its key on this phone, or not written at all (docs/VAULT.md).
 */
export function profileCopyTargets(
  groups: ReadonlyArray<{ id: string; data: { deletedAt?: unknown; vault?: unknown } }>,
): Array<{ id: string; vault: boolean }> {
  return groups.filter((g) => typeof g.data.deletedAt !== 'number').map((g) => ({ id: g.id, vault: g.data.vault === true }))
}

/**
 * The private groups whose profile copy this phone can write now: live, and opened here (their
 * key is on this phone, so the copy goes in sealed). A locked one waits until it is opened, so a
 * new member's name and payment details reach a private group when they first open it there.
 */
export function sealedCopyTargets(groups: ReadonlyArray<{ id: string; vault?: unknown; deletedAt?: unknown }>, isUnlocked: (id: string) => boolean): string[] {
  return groups.filter((g) => g.vault === true && typeof g.deletedAt !== 'number' && isUnlocked(g.id)).map((g) => g.id)
}
