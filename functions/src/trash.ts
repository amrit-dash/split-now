/*
 * Safe delete (shared/group-trash.ts): deleting a group sets deletedAt / deletedBy and it sits in
 * Recently deleted for TRASH_DAYS days.
 *  - onGroupTrashed: someone deleted a group → the other members hear it, and that they can restore it
 *  - purgeDeletedGroups: daily, removes groups deleted TRASH_DAYS days ago for good (the group
 *    document and its invite; onGroupDeleted sweeps the rest, receipts included)
 */
import { logger } from 'firebase-functions/logger'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { purgeAt, TRASH_DAYS } from '../../shared/group-trash'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { groupDeletedNote } from './lib/notify-text'
import { memberNameForUid, type MemberLite } from './lib/recipients'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  emoji?: string
  memberUids?: string[]
  members?: Record<string, MemberLite>
  inviteCode?: string
  deletedAt?: number
  deletedBy?: string
}

export const onGroupTrashed = onDocumentUpdated({ document: 'groups/{groupId}', region: REGION }, async (event) => {
  const before = event.data?.before.data() as GroupLite | undefined
  const after = event.data?.after.data() as GroupLite | undefined
  if (!before || !after || typeof before.deletedAt === 'number' || typeof after.deletedAt !== 'number') return
  const { groupId } = event.params
  const by = after.deletedBy
  const uids = (Array.isArray(after.memberUids) ? after.memberUids : []).filter((u): u is string => typeof u === 'string' && u !== by)
  if (!uids.length) return
  const note = groupDeletedNote({
    groupId,
    groupName: after.name ?? 'Group',
    emoji: after.emoji,
    byName: memberNameForUid(after.members, by) ?? 'Someone',
    days: TRASH_DAYS,
  })
  const sent = await Promise.all(uids.map((u) => sendToUser(u, ['expenses'], note)))
  logger.info('group deleted push', { groupId, sent: sent.reduce((a, b) => a + b, 0) })
})

/** Groups due for the purge at `now`, a page at a time (single-field index on deletedAt). */
export async function purgeDue(now: number, pageSize = 50): Promise<number> {
  // Deleted at or before this moment means its TRASH_DAYS are up (purgeAt(0) is the whole span).
  const cutoff = now - purgeAt(0)
  let removed = 0
  for (;;) {
    const page = await db().collection('groups').where('deletedAt', '<=', cutoff).limit(pageSize).get()
    if (page.empty) break
    for (const d of page.docs) {
      const g = d.data() as GroupLite
      const batch = db().batch()
      // The invite only if it still points here (a code is never reused, but be safe).
      if (g.inviteCode) {
        const inv = await db().doc(`invites/${g.inviteCode}`).get()
        if (inv.exists && inv.get('groupId') === d.id) batch.delete(inv.ref)
      }
      batch.delete(d.ref)
      await batch.commit()
      removed++
    }
    if (page.size < pageSize) break
  }
  return removed
}

export const purgeDeletedGroups = onSchedule(
  { schedule: 'every day 03:30', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, retryCount: 1 },
  async () => {
    const removed = await purgeDue(Date.now())
    logger.info('purged deleted groups', { removed })
  },
)
