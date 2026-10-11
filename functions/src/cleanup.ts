/*
 * The daily tidy-up of captured payments (users/{uid}/captures): one you added to an expense or
 * dismissed is removed once it has been handled for config/limits `captureKeepDays` (30 by
 * default), so the list each device loads stops growing. One still waiting to be sorted is never
 * removed. A collection-group query on status + updatedAt (firestore.indexes.json), a page at a time.
 */
import { logger } from 'firebase-functions/logger'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { getLimits } from './lib/limits'

const DAY = 86_400_000

/** Remove handled captures last changed `keepDays` or more before `now`. Returns how many went. */
export async function purgeHandledCaptures(now: number, keepDays: number, pageSize = 300): Promise<number> {
  const cutoff = now - keepDays * DAY
  let removed = 0
  for (;;) {
    const page = await db().collectionGroup('captures').where('status', 'in', ['assigned', 'dismissed']).where('updatedAt', '<', cutoff).limit(pageSize).get()
    if (page.empty) break
    const batch = db().batch()
    for (const d of page.docs) batch.delete(d.ref)
    await batch.commit()
    removed += page.size
    if (page.size < pageSize) break
  }
  return removed
}

export const cleanupCaptures = onSchedule(
  { schedule: 'every day 03:45', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, retryCount: 1 },
  async () => {
    const { captureKeepDays } = await getLimits()
    const removed = await purgeHandledCaptures(Date.now(), captureKeepDays)
    logger.info('cleaned up handled captures', { removed, keepDays: captureKeepDays })
  },
)
