/*
 * What the server copies of a person's profile into their groups (profileSync.ts), decided here so
 * it can be tested. The values come from shared/profile-share.ts, the same functions the person's
 * own app uses, so the two never disagree and neither rewrites the other's copy.
 *
 * Private groups (vault: true, docs/VAULT.md): names and photo links there are tokens sealed on a
 * phone with the group's key, and the server must never put a readable name or photo into one.
 * So there it only sets the Pro and Dev marks on the member entry (readable to the server on purpose,
 * VAULT.md "Readable to the server"), and leaves the name, the photo and the per-group profile copy
 * to the person's own app.
 */
import {
  type MemberEntryLike,
  memberEntryPatch,
  proShown,
  devShown,
  type ShareableProfile,
  type SharedProfileCopy,
  stableJson,
} from '../../../shared/profile-share'

export interface SyncGroup {
  id: string
  vault?: boolean
  deletedAt?: unknown
  memberUids?: string[]
  members?: Record<string, MemberEntryLike | undefined>
}

/** One member entry's fields to set; null removes the field. */
export interface MemberWrite {
  groupId: string
  memberId: string
  fields: Record<string, string | true | null>
}

const live = (g: SyncGroup) => typeof g.deletedAt !== 'number'

/** The entries of `uid` in live groups whose name, photo or marks differ from the profile. */
export function planMemberWrites(groups: SyncGroup[], uid: string, profile: ShareableProfile, admin: boolean): MemberWrite[] {
  const pro = proShown(profile)
  const dev = devShown(profile, admin)
  const out: MemberWrite[] = []
  for (const g of groups) {
    if (!live(g)) continue
    for (const [memberId, m] of Object.entries(g.members ?? {})) {
      // a removed entry is history (old expenses name it); it isn't theirs any more
      if (!m || m.uid !== uid || typeof m.removedAt === 'number') continue
      if (g.vault === true) {
        const fields: MemberWrite['fields'] = {}
        if ((m.pro === true) !== pro) fields.pro = pro ? true : null
        if ((m.dev === true) !== dev) fields.dev = dev ? true : null
        if (Object.keys(fields).length) out.push({ groupId: g.id, memberId, fields })
        continue
      }
      const patch = memberEntryPatch(m, profile, { admin })
      if (!patch) continue
      out.push({
        groupId: g.id,
        memberId,
        fields: { name: patch.name, photoURL: patch.photoURL ?? null, pro: patch.pro ? true : null, dev: patch.dev ? true : null },
      })
    }
  }
  return out
}

/** The groups that get a copy of the profile: live, not private, and the person still in them. */
export function profileCopyGroups(groups: SyncGroup[], uid: string): string[] {
  return groups.filter((g) => live(g) && g.vault !== true && (g.memberUids ?? []).includes(uid)).map((g) => g.id)
}

/**
 * The groups whose stored copy differs from `copy`. A profile with no name writes nothing (the
 * rules require one, and the app wouldn't have written it either).
 */
export function staleProfileCopies(groupIds: string[], stored: ReadonlyMap<string, unknown>, copy: SharedProfileCopy): string[] {
  if (typeof copy.displayName !== 'string') return []
  const want = stableJson(copy)
  return groupIds.filter((id) => {
    const have = stored.get(id)
    return have === undefined || stableJson(have) !== want
  })
}

/** Accounts that are in the group now and weren't before (all of them for a new group). */
export function joinedUids(before: string[] | undefined, after: string[] | undefined): string[] {
  const had = new Set(before ?? [])
  return [...new Set(after ?? [])].filter((u) => typeof u === 'string' && !had.has(u))
}

/** Firestore takes at most 500 writes in a batch; 450 leaves room. */
export const BATCH_SIZE = 450

export function chunks<T>(xs: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}
