/*
 * Daily at 10:00 IST: a gentle settle-up nudge to anyone who has owed more than ₹500 in a
 * group for over 7 days, at most once per 7 days per group (reminderState/{groupId}, server-only).
 * Scans every shared group; fine at small scale (see docs/PLAN.md "Backend" for costs).
 */
import { logger } from 'firebase-functions/logger'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { reminderTargets, type ExpenseLite, type SettlementLite } from './lib/balances'
import { reminderNote } from './lib/notify-text'
import { sendToUser } from './push'

export const dailyReminders = onSchedule(
  { schedule: 'every day 10:00', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, retryCount: 0 },
  async () => {
    const now = Date.now()
    const groups = await db().collection('groups').get()
    let sentTotal = 0
    for (const gs of groups.docs) {
      const g = gs.data()
      if (g.type === 'personal' || !Array.isArray(g.memberUids) || g.memberUids.length < 2) continue
      const [ex, st, stateSnap] = await Promise.all([
        gs.ref.collection('expenses').get(),
        gs.ref.collection('settlements').get(),
        db().collection('reminderState').doc(gs.id).get(),
      ])
      const lastSent: Record<string, number> = { ...(stateSnap.get('lastSent') ?? {}) }
      const targets = reminderTargets({
        members: g.members ?? {},
        currency: g.currency ?? 'INR',
        expenses: ex.docs.map((d) => d.data() as ExpenseLite),
        settlements: st.docs.map((d) => d.data() as SettlementLite),
        now,
        lastSent,
      })
      let changed = false
      for (const t of targets) {
        const n = await sendToUser(t.uid, ['reminders'], reminderNote({ groupId: gs.id, groupName: g.name ?? 'your group', emoji: g.emoji, owed: t.owed, currency: g.currency ?? 'INR' }))
        if (n > 0) { lastSent[t.uid] = now; changed = true; sentTotal += n }
      }
      if (changed) await stateSnap.ref.set({ lastSent, updatedAt: now }, { merge: true })
    }
    logger.info('reminders done', { groups: groups.size, sent: sentTotal })
  },
)
