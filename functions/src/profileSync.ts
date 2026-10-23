/*
 * A person's name, photo and badges reach their groups from the server (owner, 23 Oct 2026). Each
 * group keeps its own copy of them (the member entry, and groups/{gid}/profiles/{uid}); before this
 * only the person's own app wrote those, so co-members saw an old name, or no photo at all in a new
 * group, until that person happened to open the app.
 *  - onProfileShared: users/{uid} written and the part groups see changed → every live group of theirs
 *  - onAdminMarkChanged: admins/{uid} created or deleted → the Dev mark in every group of theirs
 *  - onGroupJoined: groups/{gid} written with new accounts in memberUids (a new group, a join, a
 *    link by email) → their entries and profile copies in that group
 * What is written is decided in lib/profile-sync.ts with the app's own functions, so the app's sync
 * (src/hooks/auth.tsx) finds nothing left to change, and the server finds nothing to undo.
 *
 * No loops: these write only member entries and profile copies. onGroupJoined returns before any
 * read unless memberUids gained someone, which these writes never do; nothing here writes users/ or
 * admins/. Every write is skipped when the stored value already matches. Private groups get only
 * the Pro and Dev marks (lib/profile-sync.ts says why). Off with config/app flags.profileSync.
 */
import { type DocumentData, type DocumentSnapshot, FieldValue, type WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { type ShareableProfile, sharedPartChanged, sharedProfileCopy } from '../../shared/profile-share'
import { db } from './admin'
import { REGION } from './config'
import { flagOn } from './lib/limits'
import { chunks, joinedUids, planMemberWrites, profileCopyGroups, staleProfileCopies, type MemberWrite, type SyncGroup } from './lib/profile-sync'

type Write = (b: WriteBatch) => void

const groupOf = (s: DocumentSnapshot<DocumentData>): SyncGroup => ({ id: s.id, ...(s.data() as Omit<SyncGroup, 'id'>) })

function memberWrite(w: MemberWrite): Write {
  const patch: Record<string, unknown> = {}
  // Not touching updatedAt: a profile change shouldn't reorder everyone's group list (as the app does).
  for (const [k, v] of Object.entries(w.fields)) patch[`members.${w.memberId}.${k}`] = v === null ? FieldValue.delete() : v
  return (b) => b.update(db().doc(`groups/${w.groupId}`), patch)
}

/**
 * Commit in batches. A batch that fails (a group deleted meanwhile) is retried one write at a
 * time, so one gone group doesn't stop the copies into the others.
 */
async function commit(writes: Write[]): Promise<number> {
  let failed = 0
  for (const part of chunks(writes)) {
    const batch = db().batch()
    for (const w of part) w(batch)
    try {
      await batch.commit()
    } catch {
      for (const w of part) {
        const one = db().batch()
        w(one)
        await one.commit().catch(() => failed++)
      }
    }
  }
  return failed
}

/**
 * Copy `uid`'s profile into `groups` (as read just now). The profile and the admin mark are read
 * fresh rather than taken from the event, so a late or repeated event can't write an old name back.
 */
async function syncInto(uid: string, groups: SyncGroup[]): Promise<number> {
  if (!groups.length) return 0
  const [user, admin] = await db().getAll(db().doc(`users/${uid}`), db().doc(`admins/${uid}`))
  if (!user?.exists) return 0
  const profile = user.data() as ShareableProfile
  const isAdmin = !!admin?.exists
  const writes: Write[] = planMemberWrites(groups, uid, profile, isAdmin).map(memberWrite)
  const targets = profileCopyGroups(groups, uid)
  if (targets.length) {
    const copy = sharedProfileCopy(profile, isAdmin)
    const stored = new Map<string, unknown>()
    for (const part of chunks(targets, 300)) {
      const snaps = await db().getAll(...part.map((g) => db().doc(`groups/${g}/profiles/${uid}`)))
      for (const s of snaps) if (s.exists) stored.set(s.ref.parent.parent!.id, s.data())
    }
    // Replaced, not merged, as the app's saveProfile does: a removed photo or badge goes.
    for (const g of staleProfileCopies(targets, stored, copy)) writes.push((b) => b.set(db().doc(`groups/${g}/profiles/${uid}`), copy))
  }
  if (!writes.length) return 0
  const failed = await commit(writes)
  logger.info('profile copied into groups', { uid, writes: writes.length, failed })
  return writes.length
}

async function syncEverywhere(uid: string): Promise<void> {
  const snap = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
  await syncInto(uid, snap.docs.map(groupOf))
}

export const onProfileShared = onDocumentWritten({ document: 'users/{uid}', region: REGION }, async (event) => {
  // Most profile writes (Help progress, preferences) change nothing a group sees: no reads at all then.
  if (!sharedPartChanged(event.data?.before.data(), event.data?.after.data())) return
  if (!(await flagOn('profileSync'))) return
  const { uid } = event.params
  try {
    await syncEverywhere(uid)
  } catch (e) {
    logger.warn('profile sync failed', { uid, error: (e as Error).message })
  }
})

export const onAdminMarkChanged = onDocumentWritten({ document: 'admins/{uid}', region: REGION }, async (event) => {
  if (!!event.data?.before.exists === !!event.data?.after.exists) return
  if (!(await flagOn('profileSync'))) return
  const { uid } = event.params
  try {
    await syncEverywhere(uid)
  } catch (e) {
    logger.warn('dev mark sync failed', { uid, error: (e as Error).message })
  }
})

export const onGroupJoined = onDocumentWritten({ document: 'groups/{groupId}', region: REGION }, async (event) => {
  const after = event.data?.after.data() as SyncGroup | undefined
  if (!after || typeof after.deletedAt === 'number') return
  // Cheap on purpose: every group write lands here, and only a newcomer is worth a read.
  const joined = joinedUids((event.data?.before.data() as SyncGroup | undefined)?.memberUids, after.memberUids)
  if (!joined.length) return
  if (!(await flagOn('profileSync'))) return
  const { groupId } = event.params
  try {
    // The group as it is now: another write may have come in since this event.
    const fresh = await db().doc(`groups/${groupId}`).get()
    if (!fresh.exists) return
    const group = groupOf(fresh)
    for (const uid of joined) await syncInto(uid, [group])
  } catch (e) {
    logger.warn('new member profile sync failed', { groupId, error: (e as Error).message })
  }
})
