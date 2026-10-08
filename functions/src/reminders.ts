/*
 * Daily at 10:00 IST: a gentle settle-up nudge to anyone who has owed more than ₹500 in a
 * group for over 7 days, at most once per 7 days per group.
 *
 * Only groups that changed since yesterday (updatedAt, bumped by every client write) or that
 * already had someone over the threshold (reminderState/{gid}.hasCandidates) are read, ten at
 * a time with projected fields; an idle group with nobody over the threshold costs nothing.
 * Candidate memory (when each debt first went over the threshold) lives in reminderState too,
 * so a nudge is about a debt that has really been there for a week, not about an expense's
 * creation date. The balance maths is the app's (shared/balances-core.ts): pending-approval
 * expenses don't count.
 */
import { logger } from 'firebase-functions/logger'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { evaluateReminders, type ExpenseLite, type ReminderState, type SettlementLite } from './lib/balances'
import { reminderNote } from './lib/notify-text'
import { sendToUser } from './push'

const TIMEOUT_S = 540
/** Groups touched this long before the run are re-evaluated (a day plus slack for the schedule). */
const ACTIVE_WINDOW_MS = 36 * 3_600_000
const CHUNK = 10

const GROUP_FIELDS = ['type', 'memberUids', 'members', 'currency', 'name', 'emoji', 'archived'] as const
const EXPENSE_FIELDS = ['amount', 'paidBy', 'splits', 'createdAt', 'deletedAt', 'requiresApproval', 'approvals', 'createdBy'] as const
const SETTLEMENT_FIELDS = ['from', 'to', 'amount', 'createdAt', 'deletedAt'] as const

interface GroupLite { type?: string; memberUids?: string[]; members?: Record<string, { uid?: string }>; currency?: string; name?: string; emoji?: string; archived?: boolean }

const eligible = (g: GroupLite | undefined): g is GroupLite =>
  !!g && g.type !== 'personal' && !g.archived && Array.isArray(g.memberUids) && g.memberUids.length >= 2

export const dailyReminders = onSchedule(
  { schedule: 'every day 10:00', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: TIMEOUT_S, retryCount: 1, memory: '512MiB' },
  async () => {
    const started = Date.now()
    const now = started
    const groupsCol = db().collection('groups')
    const stateCol = db().collection('reminderState')
    const [active, pending] = await Promise.all([
      groupsCol.where('updatedAt', '>', now - ACTIVE_WINDOW_MS).select(...GROUP_FIELDS).get(),
      stateCol.where('hasCandidates', '==', true).select().get(),
    ])
    const groups = new Map<string, GroupLite>()
    for (const d of active.docs) groups.set(d.id, d.data() as GroupLite)
    const missing = pending.docs.map((d) => d.id).filter((id) => !groups.has(id))
    for (let i = 0; i < missing.length; i += 100) {
      const refs = missing.slice(i, i + 100).map((id) => groupsCol.doc(id))
      for (const d of await db().getAll(...refs, { fieldMask: [...GROUP_FIELDS] })) if (d.exists) groups.set(d.id, d.data() as GroupLite)
    }

    let sentTotal = 0
    let evaluated = 0
    let stoppedEarly = false
    const ids = [...groups.keys()]
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (Date.now() - started > TIMEOUT_S * 800) {
        // 80% of the budget gone: the rest keeps its candidate state and is picked up tomorrow.
        logger.warn('reminders stopping early', { evaluated, remaining: ids.length - i })
        stoppedEarly = true
        break
      }
      await Promise.all(ids.slice(i, i + CHUNK).map(async (gid) => {
        const g = groups.get(gid)
        const ref = groupsCol.doc(gid)
        const stateRef = stateCol.doc(gid)
        if (!eligible(g)) {
          // Nothing to watch any more (personal, archived, deleted, one member): drop the flag.
          if (pending.docs.some((d) => d.id === gid)) await stateRef.set({ hasCandidates: false, candidates: {}, evaluatedAt: now }, { merge: true })
          return
        }
        const [ex, st, stateSnap] = await Promise.all([
          ref.collection('expenses').select(...EXPENSE_FIELDS).get(),
          ref.collection('settlements').select(...SETTLEMENT_FIELDS).get(),
          stateRef.get(),
        ])
        const state = stateSnap.data() as Partial<ReminderState> | undefined
        const { targets, next } = evaluateReminders({
          members: g.members ?? {},
          currency: g.currency ?? 'INR',
          expenses: ex.docs.map((d) => d.data() as ExpenseLite),
          settlements: st.docs.map((d) => d.data() as SettlementLite),
          now,
          state,
        })
        evaluated++
        for (const t of targets) {
          const n = await sendToUser(t.uid, ['reminders'], reminderNote({ groupId: gid, groupName: g.name ?? 'your group', emoji: g.emoji, owed: t.owed, currency: g.currency ?? 'INR' }))
          if (n > 0) { next.lastSent[t.uid] = now; sentTotal += n }
        }
        const changed = !state || next.hasCandidates !== !!state.hasCandidates
          || JSON.stringify(next.candidates) !== JSON.stringify(state.candidates ?? {})
          || JSON.stringify(next.lastSent) !== JSON.stringify(state.lastSent ?? {})
        if (changed) await stateRef.set(next, { merge: true })
      }))
    }
    logger.info('reminders done', { candidates: groups.size, evaluated, sent: sentTotal, ms: Date.now() - started, stoppedEarly })
  },
)
