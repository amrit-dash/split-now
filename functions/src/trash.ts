/*
 * Safe delete (shared/group-trash.ts): deleting a group sets deletedAt / deletedBy and it sits in
 * Recently deleted for config/app `tuning.trashDays` days (30 by default).
 *  - onGroupTrashed: someone deleted a group → the other members hear it, and that they can restore
 *    it; its open Pay me links go on hold (nobody pays into a group nobody sees), and a restore
 *    takes the hold off again
 *  - purgeDeletedGroups: daily, removes groups deleted that many days ago for good (the group
 *    document and its invite, its open Pay me links cancelled; onGroupDeleted sweeps the rest,
 *    receipts included)
 */
import { groupNameForRecipient } from '../../shared/names'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { purgeAt } from '../../shared/group-trash'
import { getTuning } from './lib/limits'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { groupDeletedNote } from './lib/notify-text'
import { memberNameForUid, type MemberLite } from './lib/recipients'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  type?: string
  emoji?: string
  memberUids?: string[]
  members?: Record<string, MemberLite>
  inviteCode?: string
  deletedAt?: number
  deletedBy?: string
}

/** Open Pay me links for the group: hold them (deleted), release them (restored), or cancel them (purged). */
export async function setLinksFor(groupId: string, to: 'held' | 'open' | 'cancelled'): Promise<number> {
  // Two equality filters: served by merging the single-field indexes.
  const open = await db().collection('payLinks').where('groupId', '==', groupId).where('status', '==', 'open').get()
  if (open.empty) return 0
  const batch = db().batch()
  const now = Date.now()
  for (const d of open.docs)
    batch.update(
      d.ref,
      to === 'held' ? { held: true } : to === 'open' ? { held: FieldValue.delete() } : { status: 'cancelled', cancelledAt: now, held: FieldValue.delete() },
    )
  await batch.commit()
  return open.size
}

export const onGroupTrashed = onDocumentUpdated({ document: 'groups/{groupId}', region: REGION }, async (event) => {
  const before = event.data?.before.data() as GroupLite | undefined
  const after = event.data?.after.data() as GroupLite | undefined
  if (!before || !after) return
  const { groupId } = event.params
  const wasDeleted = typeof before.deletedAt === 'number'
  const isDeleted = typeof after.deletedAt === 'number'
  if (wasDeleted && !isDeleted) {
    const released = await setLinksFor(groupId, 'open')
    logger.info('group restored', { groupId, released })
    return
  }
  if (wasDeleted || !isDeleted) return
  const held = await setLinksFor(groupId, 'held')
  const by = after.deletedBy
  const uids = (Array.isArray(after.memberUids) ? after.memberUids : []).filter((u): u is string => typeof u === 'string' && u !== by)
  if (!uids.length) return
  const days = (await getTuning()).trashDays
  const note = (u: string) =>
    groupDeletedNote({
      groupId,
      groupName: groupNameForRecipient(after, u),
      emoji: after.emoji,
      byName: memberNameForUid(after.members, by) ?? 'Someone',
      days,
    })
  const sent = await Promise.all(uids.map((u) => sendToUser(u, ['expenses'], note(u))))
  logger.info('group deleted push', { groupId, held, sent: sent.reduce((a, b) => a + b, 0) })
})

/** Groups due for the purge at `now`, a page at a time (single-field index on deletedAt). */
export async function purgeExpiredGroups(now: number, days: number, pageSize = 50): Promise<number> {
  // Deleted at or before this moment means its days are up (purgeAt(0, days) is the whole span).
  const cutoff = now - purgeAt(0, days)
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
      await setLinksFor(d.id, 'cancelled')
      removed++
    }
    if (page.size < pageSize) break
  }
  return removed
}

export const purgeDeletedGroups = onSchedule(
  { schedule: 'every day 03:30', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, retryCount: 1 },
  async () => {
    const { trashDays } = await getTuning()
    const removed = await purgeExpiredGroups(Date.now(), trashDays)
    logger.info('purged deleted groups', { removed })
  },
)
