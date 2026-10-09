/*
 * Callable `nudge({ groupId, memberId, amount? })`: the person owed taps "Nudge" and the debtor
 * gets a push ("Priya reminded you: you owe ₹1,240 in Goa trip") that opens their Settle up
 * screen prefilled. The server works out the amount from the group's balances (the app's figure
 * is only a hint, clamped), allows one nudge per (sender, debtor, group) per day
 * (rateLimits/nudge_…; config/limits.nudgePerDay), honours the debtor's `reminders` preference through sendToUser, and
 * writes a `settlement.nudged` activity entry so every device can show "nudged today".
 * Returns { sent: true, amount } or { sent: false, reason } (see src/lib/nudge.ts NudgeResult).
 */
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { netBalances, type BalanceExpense, type BalanceSettlement } from '../../shared/balances-core'
import { countStats, db } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { flagOn, getLimits } from './lib/limits'
import { DAY_MS, nextNudgeAt, nudgeAmount, nudgeSummary } from './lib/nudge-core'
import { nudgeNote } from './lib/notify-text'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { memberNameForUid, memberUid, type MemberLite } from './lib/recipients'
import { isIdShaped } from './lib/request'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  emoji?: string
  currency?: string
  members?: Record<string, MemberLite>
  memberUids?: string[]
  type?: string
}

export type NudgeResponse =
  | { sent: true; amount: number }
  | { sent: false; reason: 'rate_limited' | 'no_push' | 'not_owed' | 'not_member' | 'off'; nextAllowedAt?: number }

const EXPENSE_FIELDS = ['amount', 'paidBy', 'splits', 'deletedAt', 'requiresApproval', 'approvals', 'createdBy'] as const
const SETTLEMENT_FIELDS = ['from', 'to', 'amount', 'deletedAt'] as const

function caller(req: CallableRequest): string {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

async function senderName(groupId: string, g: GroupLite, uid: string): Promise<string> {
  const fromMembers = memberNameForUid(g.members, uid)
  if (fromMembers) return fromMembers
  const p = await db().doc(`groups/${groupId}/profiles/${uid}`).get()
  const n = p.get('displayName')
  return typeof n === 'string' && n ? n : 'Someone'
}

const options = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, maxInstances: 5 }

export const nudge = onCall(options, async (req): Promise<NudgeResponse> => {
  const uid = caller(req)
  const d = (req.data ?? {}) as { groupId?: unknown; memberId?: unknown; amount?: unknown }
  const groupId = typeof d.groupId === 'string' ? d.groupId : ''
  const memberId = typeof d.memberId === 'string' ? d.memberId : ''
  if (!isIdShaped(groupId) || !isIdShaped(memberId)) throw new HttpsError('invalid-argument', 'Which group and who?')
  // The admin's switch (config/app flags.nudges) stops nudges for everyone.
  if (!(await flagOn('nudges'))) return { sent: false, reason: 'off' }

  const gSnap = await db().doc(`groups/${groupId}`).get()
  const g = gSnap.data() as GroupLite | undefined
  if (!g) throw new HttpsError('not-found', 'Group not found')
  const uids = Array.isArray(g.memberUids) ? g.memberUids.filter((u): u is string => typeof u === 'string') : []
  if (!uids.includes(uid)) throw new HttpsError('permission-denied', 'Not a member of this group')
  const members = g.members ?? {}
  const senderMemberId = Object.entries(members).find(([, m]) => m.uid === uid)?.[0]
  if (!senderMemberId) throw new HttpsError('permission-denied', 'Not a member of this group')
  if (!members[memberId]) throw new HttpsError('invalid-argument', 'Not a member of this group')
  if (memberId === senderMemberId) throw new HttpsError('invalid-argument', 'You can’t nudge yourself')
  // A placeholder (no account), or an entry whose uid isn't really in the group: nothing to push to.
  const debtorUid = memberUid(members, memberId, uids)
  if (!debtorUid || debtorUid === uid) return { sent: false, reason: 'not_member' }

  const now = Date.now()
  const limitRef = db().doc(`rateLimits/nudge_${groupId}_${uid}_${memberId}`)
  const prev = (await limitRef.get()).data() as Partial<RateState> | undefined
  // config/limits.nudgePerDay (1 by default): the same figure for the hour, so the day is the only window that bites.
  const perDay = (await getLimits(now)).nudgePerDay
  const gate = applyRateLimit(prev, now, { perHour: perDay, perDay })
  if (!gate.allowed) {
    // stats/nudge_{day}.denied: the admin console shows "N over the limit" next to sent.
    await countStats('nudge', { denied: 1 }, now)
    return { sent: false, reason: 'rate_limited', nextAllowedAt: nextNudgeAt(prev?.dayStart, now) }
  }

  const ref = gSnap.ref
  const [ex, st] = await Promise.all([
    ref
      .collection('expenses')
      .select(...EXPENSE_FIELDS)
      .get(),
    ref
      .collection('settlements')
      .select(...SETTLEMENT_FIELDS)
      .get(),
  ])
  const net = netBalances(
    ex.docs.map((x) => x.data() as BalanceExpense),
    st.docs.map((x) => x.data() as BalanceSettlement),
    { members },
  )
  const amount = nudgeAmount(net, senderMemberId, memberId, d.amount)
  if (!amount) return { sent: false, reason: 'not_owed' }

  const currency = g.currency ?? 'INR'
  const fromName = await senderName(groupId, g, uid)
  const sent = await sendToUser(
    debtorUid,
    ['reminders'],
    nudgeNote({ groupId, groupName: g.name ?? 'your group', emoji: g.emoji, fromName, owed: amount, currency, debtorMemberId: memberId, senderMemberId }),
  )
  if (!sent) return { sent: false, reason: 'no_push' }

  await Promise.allSettled([
    limitRef.set(gate.next),
    ref.collection('activity').add({
      type: 'settlement.nudged',
      actorUid: uid,
      actorName: fromName.slice(0, 100),
      targetId: memberId,
      summary: nudgeSummary(fromName, members[memberId].name ?? 'someone', amount, currency),
      after: { amount, memberId },
      createdAt: now,
    }),
    countStats('nudge', { sent: 1 }, now),
  ])
  logger.info('nudge sent', { groupId, devices: sent, cooldownMs: DAY_MS })
  return { sent: true, amount }
})
