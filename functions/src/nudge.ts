/*
 * Callable `nudge`: the person owed taps "Nudge" and the debtor gets a push.
 *
 *  - `{ groupId, memberId, amount? }` (a group's Balances tab, or a "by group" row): "Priya
 *    reminded you: you owe ₹1,240 in Goa trip", opening their Settle up screen prefilled. One per
 *    (sender, debtor, group) per day (rateLimits/nudge_…).
 *  - `{ items: [{ groupId, memberId, amount? }, …] }` (a "by person" row on the Balances screen,
 *    up to 20 groups): ONE push with the total across those groups ("you owe ₹3,240 across Goa
 *    trip and Flat"), opening the debtor's cross-group Settle up. One per (sender, debtor account)
 *    per day (rateLimits/nudgep_…), and refused while any of those groups was nudged today.
 *
 * The server works out every amount from the groups' balances (the app's figures are only hints,
 * clamped), honours the debtor's `reminders` preference through sendToUser, and writes a
 * `settlement.nudged` activity entry in each group where the debtor owes something, so every
 * device can show "nudged today" and the debtor sees the reminder in the app even without a push
 * (then the answer is `no_push` with the amount, and the sender's app offers the share sheet).
 * Returns { sent: true, amount } or { sent: false, reason } (see src/lib/nudge.ts NudgeResult).
 */
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import type { DocumentReference } from 'firebase-admin/firestore'
import { netBalances, type BalanceExpense, type BalanceSettlement } from '../../shared/balances-core'
import { countStats, db } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { flagOn, getLimits } from './lib/limits'
import {
  DAY_MS,
  crossGroupPlan,
  nextNudgeAt,
  nudgeAmount,
  nudgeSummary,
  parseNudgeRequest,
  settleWithPath,
  type GroupNudge,
  type NudgeItem,
} from './lib/nudge-core'
import { nudgeAcrossNote, nudgeNote, type Note } from './lib/notify-text'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { memberIdForUid, memberNameForUid, memberUid, type MemberLite } from './lib/recipients'
import { isRemoved } from '../../shared/members'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  emoji?: string
  currency?: string
  members?: Record<string, MemberLite>
  memberUids?: string[]
  type?: string
}

type Refusal = 'rate_limited' | 'not_owed' | 'not_member' | 'off'

export type NudgeResponse =
  | { sent: true; amount: number; groups?: number }
  /** no device to push to (or reminders off): the activity entry is still written, so the debtor sees it in the app */
  | { sent: false; reason: 'no_push'; amount: number; groups?: number }
  | { sent: false; reason: Refusal; nextAllowedAt?: number }

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

/** One group of a nudge, checked: the caller and the debtor are members, and the debtor has an account there. */
interface Loaded {
  item: NudgeItem
  ref: DocumentReference
  g: GroupLite
  members: Record<string, MemberLite>
  senderMemberId: string
  /** undefined: a placeholder (no account), nothing to push to */
  debtorUid?: string
}

/** Throws the same errors the single-group call always has; the cross-group call skips groups that throw. */
async function loadGroup(uid: string, item: NudgeItem): Promise<Loaded> {
  const gSnap = await db().doc(`groups/${item.groupId}`).get()
  const g = gSnap.data() as GroupLite | undefined
  if (!g) throw new HttpsError('not-found', 'Group not found')
  const uids = Array.isArray(g.memberUids) ? g.memberUids.filter((u): u is string => typeof u === 'string') : []
  if (!uids.includes(uid)) throw new HttpsError('permission-denied', 'Not a member of this group')
  const members = g.members ?? {}
  const senderMemberId = memberIdForUid(members, uid)
  if (!senderMemberId) throw new HttpsError('permission-denied', 'Not a member of this group')
  // Someone who left (an entry kept for history) can't be nudged: they can't open the group.
  if (!members[item.memberId] || isRemoved(members[item.memberId])) throw new HttpsError('invalid-argument', 'Not a member of this group')
  if (item.memberId === senderMemberId) throw new HttpsError('invalid-argument', 'You can’t nudge yourself')
  // A placeholder (no account), or an entry whose uid isn't really in the group: nothing to push to.
  const debtorUid = memberUid(members, item.memberId, uids)
  return { item, ref: gSnap.ref, g, members, senderMemberId, debtorUid: debtorUid && debtorUid !== uid ? debtorUid : undefined }
}

async function groupNet(l: Loaded): Promise<Record<string, number>> {
  const [ex, st] = await Promise.all([
    l.ref
      .collection('expenses')
      .select(...EXPENSE_FIELDS)
      .get(),
    l.ref
      .collection('settlements')
      .select(...SETTLEMENT_FIELDS)
      .get(),
  ])
  return netBalances(
    ex.docs.map((x) => x.data() as BalanceExpense),
    st.docs.map((x) => x.data() as BalanceSettlement),
    { members: l.members },
  )
}

/** One nudge per (sender, debtor, group) per day. */
const groupLimitRef = (uid: string, groupId: string, memberId: string) => db().doc(`rateLimits/nudge_${groupId}_${uid}_${memberId}`)
/** One cross-group nudge per (sender, debtor account) per day. */
const personLimitRef = (uid: string, debtorUid: string) => db().doc(`rateLimits/nudgep_${uid}_${debtorUid}`)

/** config/limits.nudgePerDay (1 by default): the same figure for the hour, so the day is the only window that bites. */
const nudgeLimits = async (now: number) => {
  const perDay = (await getLimits(now)).nudgePerDay
  return { perHour: perDay, perDay }
}

function nudgedEntry(l: Loaded, uid: string, fromName: string, amount: number, currency: string, now: number, total?: number) {
  return l.ref.collection('activity').add({
    type: 'settlement.nudged',
    actorUid: uid,
    actorName: fromName.slice(0, 100),
    targetId: l.item.memberId,
    summary: nudgeSummary(fromName, l.members[l.item.memberId]?.name ?? 'someone', amount, currency),
    after: total === undefined ? { amount, memberId: l.item.memberId } : { amount, memberId: l.item.memberId, total },
    createdAt: now,
  })
}

async function nudgeOne(uid: string, item: NudgeItem): Promise<NudgeResponse> {
  const l = await loadGroup(uid, item)
  const debtorUid = l.debtorUid
  if (!debtorUid) return { sent: false, reason: 'not_member' }

  const now = Date.now()
  const limitRef = groupLimitRef(uid, item.groupId, item.memberId)
  const prev = (await limitRef.get()).data() as Partial<RateState> | undefined
  const gate = applyRateLimit(prev, now, await nudgeLimits(now))
  if (!gate.allowed) {
    // stats/nudge_{day}.denied: the admin console shows "N over the limit" next to sent.
    await countStats('nudge', { denied: 1 }, now)
    return { sent: false, reason: 'rate_limited', nextAllowedAt: nextNudgeAt(prev?.dayStart, now) }
  }

  const amount = nudgeAmount(await groupNet(l), l.senderMemberId, item.memberId, item.amount)
  if (!amount) return { sent: false, reason: 'not_owed' }

  const currency = l.g.currency ?? 'INR'
  const fromName = await senderName(item.groupId, l.g, uid)
  const sent = await sendToUser(
    debtorUid,
    ['reminders'],
    nudgeNote({
      groupId: item.groupId,
      groupName: l.g.name ?? 'your group',
      emoji: l.g.emoji,
      fromName,
      owed: amount,
      currency,
      debtorMemberId: item.memberId,
      senderMemberId: l.senderMemberId,
    }),
  )
  // Written with or without a push: the debtor's app shows the entry as a reminder card.
  await Promise.allSettled([
    limitRef.set(gate.next),
    nudgedEntry(l, uid, fromName, amount, currency, now),
    countStats('nudge', sent ? { sent: 1 } : { in_app: 1 }, now),
  ])
  logger.info('nudge', { groupId: item.groupId, devices: sent, cooldownMs: DAY_MS })
  return sent ? { sent: true, amount } : { sent: false, reason: 'no_push', amount }
}

async function nudgeAcross(uid: string, items: NudgeItem[]): Promise<NudgeResponse> {
  // Groups the caller can't nudge in (gone, not a member, a placeholder) simply sit out.
  const loaded = (await Promise.all(items.map((it) => loadGroup(uid, it).catch(() => null)))).filter((l): l is Loaded => !!l)
  // One person: the account behind the first group that has one; entries naming anyone else are dropped.
  const debtorUid = loaded.find((l) => l.debtorUid)?.debtorUid
  if (!debtorUid) return { sent: false, reason: 'not_member' }
  const mine = loaded.filter((l) => l.debtorUid === debtorUid)

  const now = Date.now()
  const limits = await nudgeLimits(now)
  const personRef = personLimitRef(uid, debtorUid)
  const refs = [personRef, ...mine.map((l) => groupLimitRef(uid, l.item.groupId, l.item.memberId))]
  const prevs = (await Promise.all(refs.map((r) => r.get()))).map((s) => s.data() as Partial<RateState> | undefined)
  const gates = prevs.map((p) => applyRateLimit(p, now, limits))
  // Once a day per person, and not on top of a single-group nudge they already got today.
  const blocked = gates.findIndex((g) => !g.allowed)
  if (blocked >= 0) {
    await countStats('nudge', { denied: 1 }, now)
    return { sent: false, reason: 'rate_limited', nextAllowedAt: nextNudgeAt(prevs[blocked]?.dayStart, now) }
  }

  const nets = await Promise.all(mine.map(groupNet))
  const parts: GroupNudge[] = mine.map((l, i) => ({
    groupId: l.item.groupId,
    groupName: l.g.name ?? 'your group',
    emoji: l.g.emoji,
    currency: l.g.currency ?? 'INR',
    memberId: l.item.memberId,
    senderMemberId: l.senderMemberId,
    owed: nudgeAmount(nets[i], l.senderMemberId, l.item.memberId, l.item.amount),
    owes: nudgeAmount(nets[i], l.item.memberId, l.senderMemberId),
  }))
  const plan = crossGroupPlan(parts)
  if (!plan) return { sent: false, reason: 'not_owed' }

  const touched = plan.owed.map((p) => mine.find((l) => l.item.groupId === p.groupId)!)
  const first = touched[0]
  const fromName = await senderName(first.item.groupId, first.g, uid)
  // Only one group really in it (nothing netted out): the plain single-group push and its prefilled link.
  const single = plan.owed.length === 1 && plan.owed[0].owed === plan.total
  const p0 = plan.owed[0]
  const note: Note = single
    ? nudgeNote({
        groupId: p0.groupId,
        groupName: p0.groupName,
        emoji: p0.emoji,
        fromName,
        owed: p0.owed,
        currency: plan.currency,
        debtorMemberId: p0.memberId,
        senderMemberId: p0.senderMemberId,
      })
    : nudgeAcrossNote({
        fromName,
        total: plan.total,
        currency: plan.currency,
        groupNames: plan.owed.map((p) => p.groupName),
        url: settleWithPath(uid, plan.currency),
        senderUid: uid,
      })
  const sent = await sendToUser(debtorUid, ['reminders'], note)

  const writes: Promise<unknown>[] = [personRef.set(gates[0].next)]
  for (const l of touched) {
    const i = mine.indexOf(l)
    writes.push(refs[i + 1].set(gates[i + 1].next))
    const part = plan.owed.find((p) => p.groupId === l.item.groupId)!
    writes.push(nudgedEntry(l, uid, fromName, part.owed, plan.currency, now, single ? undefined : plan.total))
  }
  writes.push(countStats('nudge', sent ? { sent: 1 } : { in_app: 1 }, now))
  await Promise.allSettled(writes)
  logger.info('nudge across groups', { groups: touched.length, devices: sent })
  const groups = touched.length
  return sent ? { sent: true, amount: plan.total, groups } : { sent: false, reason: 'no_push', amount: plan.total, groups }
}

const options = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, maxInstances: 5 }

export const nudge = onCall(options, async (req): Promise<NudgeResponse> => {
  const uid = caller(req)
  const parsed = parseNudgeRequest(req.data)
  if (!parsed) throw new HttpsError('invalid-argument', 'Which group and who?')
  // The admin's switch (config/app flags.nudges) stops nudges for everyone.
  if (!(await flagOn('nudges'))) return { sent: false, reason: 'off' }
  return parsed.multi ? nudgeAcross(uid, parsed.items) : nudgeOne(uid, parsed.items[0])
})
