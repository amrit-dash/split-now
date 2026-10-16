/*
 * Firestore triggers. App Check doesn't apply to them.
 *  - expense added → the other people in it ("Sarah added Dinner · ₹840 · your share ₹210")
 *  - settlement recorded → the person who was paid, and the payer when someone else recorded it
 *    (not for one recorded from a Pay me link: paylinks.ts sends its own push). One that needs the
 *    payee's OK has its screenshot checked first (payment-ok.ts), then the payee hears whether it
 *    cleared or needs their OK
 *  - the payee confirms a payment or says it hasn't arrived → the payer
 *  - an edit that needs everyone's OK again → the people whose OK it took away ("Needs your OK")
 *  - push token registered → the same browser token is dropped from every other account (a
 *    phone signed out offline, then signed in as someone else, must not keep the first
 *    person's notifications)
 *  - a new expense or payment → the group comes back (unarchived) for the people it involves
 *    (archiving is personal: shared/archive.ts), imports and recurring copies included
 *  - group deleted → every subcollection and its receipts go too (the client only deletes the
 *    group document and its invite; rules would stop it deleting most of the rest anyway)
 * Imports, recurring copies and trashed docs are skipped (moving one to the trash tells the others,
 * onExpenseUpdated). Each recipient's prefs decide.
 * Only uids in the group's memberUids are ever notified: members[*].uid can be typed in by the
 * group's creator and is not trusted on its own.
 */
import { groupNameForRecipient } from '../../shared/names'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { balanceEditMembers, expenseMemberIds, uidsOfMembers, unarchiveInvolved } from '../../shared/archive'
import { pendingApprovers } from '../../shared/balances-core'
import { crossedThresholds } from '../../shared/budget'
import { db, storage } from './admin'
import { REGION } from './config'
import { flagOn, getTuning } from './lib/limits'
import { AI_SECRETS } from './ai'
import { expensePref, newlyWaiting, paymentOkPref, reapprovalRecipients } from './lib/approval-push'
import {
  budgetNote,
  expenseDeletedNote,
  expenseNote,
  paymentDecisionNote,
  paymentOkNote,
  reapprovalNote,
  settlementNote,
  settlementRecordedNote,
} from './lib/notify-text'
import { payeeDecision, type ProofSettlement } from './lib/payment-proof'
import { checkProof } from './payment-ok'
import { expenseRecipients, memberNameForUid, memberUid, type MemberLite } from './lib/recipients'
import { sendToUser } from './push'
import { firstNameOf, labelOf } from '../../shared/names'
import { isReceived } from '../../shared/received'

interface GroupLite {
  name?: string
  type?: string
  emoji?: string
  currency?: string
  members?: Record<string, MemberLite>
  memberUids?: string[]
  budget?: unknown
  archived?: boolean
  archivedBy?: string[]
  deletedAt?: number
}

/**
 * A new expense or payment brings the group back for the members it involves: their balance has
 * changed, so it belongs in their totals again (unarchiveInvolved). Array remove, so it never
 * undoes someone archiving at the same moment; an old group-wide archive becomes everyone else.
 */
async function unarchiveFor(groupId: string, g: GroupLite, memberIds: string[]) {
  const w = unarchiveInvolved({ ...g, memberUids: uidsOf(g) }, uidsOfMembers(g.members, memberIds, uidsOf(g)))
  if (!w) return
  const ref = db().doc(`groups/${groupId}`)
  if ('remove' in w) await ref.update({ archivedBy: FieldValue.arrayRemove(...w.remove) })
  else await ref.update({ archivedBy: w.convert.archivedBy, archived: FieldValue.delete() })
  logger.info('unarchived for new activity', { groupId })
}

/**
 * An edit, trash or restore that moves balances brings the group back for the people it touched,
 * like a new one (balanceEditMembers): an edit that leaves you owing must not stay archived.
 */
async function unarchiveForEdit(groupId: string, before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) {
  if (!before || !after) return
  const touched = balanceEditMembers(before, after)
  if (!touched.length) return
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number' || !(g.archived === true || g.archivedBy?.length)) return
  await unarchiveFor(groupId, g, touched)
}

export const onExpenseUpdated = onDocumentUpdated({ document: 'groups/{groupId}/expenses/{expenseId}', region: REGION }, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const { groupId, expenseId } = event.params
  await unarchiveForEdit(groupId, before, after).catch((err) => logger.warn('unarchive', { groupId, error: (err as Error).message }))
  await reapprovalPush(groupId, expenseId, before, after).catch((err) => logger.warn('reapproval push', { groupId, error: (err as Error).message }))
  await deletedPush(groupId, expenseId, before, after).catch((err) => logger.warn('expense deleted push', { groupId, error: (err as Error).message }))
})

/**
 * Moving an expense to Recently deleted tells the other people in it (whoever paid or has a
 * share), on "New expenses": until now it vanished from their balances without a word. Restoring
 * sends nothing; neither does a delete in a group that is itself in Recently deleted.
 */
async function deletedPush(
  groupId: string,
  expenseId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
) {
  if (!before || !after || typeof before.deletedAt === 'number' || typeof after.deletedAt !== 'number') return
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  const by = typeof after.deletedBy === 'string' ? after.deletedBy : ''
  const recipients = expenseRecipients(g.members, after, uidsOf(g)).filter((r) => r.uid !== by)
  if (!recipients.length) return
  const [actor, { trashDays }] = await Promise.all([actorName(groupId, g, by), getTuning()])
  const sent = await Promise.all(
    recipients.map((r) =>
      sendToUser(
        r.uid,
        ['expenses'],
        expenseDeletedNote({
          groupId,
          expenseId,
          groupName: groupNameForRecipient(g, r.uid),
          emoji: g.emoji,
          actorName: actor,
          description: String(after.description ?? ''),
          amount: Number(after.amount) || 0,
          currency: g.currency ?? 'INR',
          days: trashDays,
        }),
      ),
    ),
  )
  logger.info('expense deleted push', { groupId, expenseId, recipients: recipients.length, sent: sent.reduce((a, b) => a + b, 0) })
}

/**
 * An edit that needs everyone's OK again (a change bigger than the group's small-edit allowance)
 * tells the people whose OK it took away, on "Needs your OK". Approving never gets here.
 */
async function reapprovalPush(
  groupId: string,
  expenseId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
) {
  if (!before || !after || after.importedFrom) return
  const g0 = await db().doc(`groups/${groupId}`).get()
  const g = g0.data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  const ids = newlyWaiting(before as Parameters<typeof newlyWaiting>[0], after as Parameters<typeof newlyWaiting>[1], g.members ?? {})
  if (!ids.length) return
  const uids = uidsOf(g)
  // The editor is on the expense (the rules make an edit name its own editor): they never hear
  // about their own change. An expense edited before editors were recorded names nobody.
  const editor = typeof after.updatedBy === 'string' ? after.updatedBy : undefined
  const to = reapprovalRecipients(
    ids.map((id) => memberUid(g.members, id, uids)),
    editor,
  )
  if (!to.length) return
  const editorName = editor ? await actorName(groupId, g, editor) : undefined
  const sent = await Promise.all(
    to.map((u) =>
      sendToUser(
        u,
        ['approvals'],
        reapprovalNote({
          groupId,
          expenseId,
          groupName: groupNameForRecipient(g, u),
          emoji: g.emoji,
          description: String(after.description ?? ''),
          amount: after.amount,
          currency: g.currency ?? 'INR',
          editorName,
        }),
      ),
    ),
  )
  logger.info('reapproval push', { groupId, expenseId, waiting: ids.length, sent: sent.reduce((a, b) => a + b, 0) })
}

/** reminderState/{gid}.budget (server-only): which thresholds were announced, for which budget figure. */
interface BudgetState {
  at: number
  alerted: number[]
}

const uidsOf = (g: GroupLite) => (Array.isArray(g.memberUids) ? g.memberUids.filter((u): u is string => typeof u === 'string') : [])

async function actorName(groupId: string, g: GroupLite, uid: string | undefined): Promise<string> {
  const fromMembers = memberNameForUid(g.members, uid)
  if (fromMembers) return fromMembers
  if (!uid) return 'Someone'
  const p = await db().doc(`groups/${groupId}/profiles/${uid}`).get()
  const n = p.get('displayName')
  return typeof n === 'string' && n ? firstNameOf(n) : 'Someone'
}

export const onExpenseCreated = onDocumentCreated({ document: 'groups/{groupId}/expenses/{expenseId}', region: REGION }, async (event) => {
  const e = event.data?.data()
  if (!e || typeof e.deletedAt === 'number') return
  const { groupId, expenseId } = event.params
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  // Nothing about a group in Recently deleted (an offline device may still send one in).
  if (!g || typeof g.deletedAt === 'number') return
  // Any new expense counts here, imports and recurring copies too: they change balances.
  await unarchiveFor(groupId, g, expenseMemberIds(e)).catch((err) => logger.warn('unarchive', { groupId, error: (err as Error).message }))
  if (e.importedFrom || e.recurringFrom) return
  // The budget check runs whoever added the expense; the push to the people in it only when there are any.
  const budget = budgetAlert(groupId, g).catch((err) => logger.warn('budget alert', { groupId, error: (err as Error).message }))
  const recipients = expenseRecipients(g.members, e, uidsOf(g))
  if (!recipients.length) return budget
  const actor = await actorName(groupId, g, e.createdBy)
  const currency = g.currency ?? 'INR'
  // "needs your approval" only for people who actually have to approve, not for a payer with nothing to approve.
  const waiting = new Set(pendingApprovers(e, g.members ?? {}).map((id) => g.members?.[id]?.uid))
  const sent = await Promise.all(
    recipients.map((r) =>
      sendToUser(
        r.uid,
        // An ask answers to "Needs your OK", plain news to "New expenses".
        [expensePref(waiting.has(r.uid))],
        expenseNote({
          groupId,
          expenseId,
          // A 1:1 is titled with the other person, for each of them (shared/names.ts).
          groupName: groupNameForRecipient(g, r.uid),
          emoji: g.emoji,
          actorName: actor,
          description: String(e.description ?? ''),
          amount: e.amount,
          currency,
          share: r.share,
          paid: r.paid,
          needsApproval: waiting.has(r.uid),
          received: isReceived(e),
        }),
      ),
    ),
  )
  logger.info('expense push', { groupId, expenseId, recipients: recipients.length, sent: sent.reduce((a, b) => a + b, 0) })
  await budget
})

/**
 * Budget alerts: when the group's live spend (every expense not in the trash, as the budget bar
 * counts it) crosses 80% or 100% of the budget, every member with expense pushes on hears once
 * per threshold. The state lives next to the reminder state; a changed budget starts over.
 */
async function budgetAlert(groupId: string, g: GroupLite) {
  const budget = typeof g.budget === 'number' && g.budget > 0 ? g.budget : 0
  if (!budget || !(await flagOn('budgetAlerts'))) return
  const stateRef = db().doc(`reminderState/${groupId}`)
  const [ex, stateSnap] = await Promise.all([db().collection(`groups/${groupId}/expenses`).select('amount', 'deletedAt', 'kind').get(), stateRef.get()])
  // Money received isn't spending (shared/received.ts), as on the budget bar.
  const spent = ex.docs.reduce(
    (s, d) => (typeof d.get('deletedAt') === 'number' || isReceived({ kind: d.get('kind') }) ? s : s + (Number(d.get('amount')) || 0)),
    0,
  )
  const prev = stateSnap.get('budget') as Partial<BudgetState> | undefined
  const alerted = prev?.at === budget && Array.isArray(prev.alerted) ? prev.alerted.filter((t): t is number => typeof t === 'number') : []
  const crossed = crossedThresholds(spent, budget, alerted)
  if (!crossed.length) return
  // Crossing 80% and 100% with one expense is one push, about the higher mark.
  const threshold = crossed[crossed.length - 1]
  const note = (u: string) =>
    budgetNote({ groupId, groupName: groupNameForRecipient(g, u), emoji: g.emoji, threshold, spent, budget, currency: g.currency ?? 'INR' })
  const sent = await Promise.all(uidsOf(g).map((u) => sendToUser(u, ['expenses'], note(u))))
  await stateRef.set({ budget: { at: budget, alerted: [...alerted, ...crossed] } satisfies BudgetState }, { merge: true })
  logger.info('budget alert', { groupId, threshold, spent, budget, sent: sent.reduce((a, b) => a + b, 0) })
}

// Secrets and room for the screenshot check (one image to Gemini) on payments that need an OK.
const settlementOpts = {
  document: 'groups/{groupId}/settlements/{settlementId}',
  region: REGION,
  secrets: AI_SECRETS,
  timeoutSeconds: 120,
  memory: '512MiB' as const,
}

export const onSettlementCreated = onDocumentCreated(settlementOpts, async (event) => {
  const s = event.data?.data()
  if (!s || typeof s.deletedAt === 'number') return
  const { groupId, settlementId } = event.params
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  await unarchiveFor(
    groupId,
    g,
    [s.from, s.to].filter((x): x is string => typeof x === 'string'),
  ).catch((err) => logger.warn('unarchive', { groupId, error: (err as Error).message }))
  if (s.importedFrom) return
  const uids = uidsOf(g)
  const to = memberUid(g.members, s.to, uids)
  const from = memberUid(g.members, s.from, uids)
  // Recorded by onPayLinkPaid on the payee's behalf ("I've paid" on a Pay me link): that trigger
  // has told the payee already, and the payer is the one who made the claim.
  if (typeof s.payLink === 'string' && to && s.createdBy === to) return
  const common = (u: string) => ({
    groupId,
    settlementId,
    groupName: groupNameForRecipient(g, u),
    emoji: g.emoji,
    amount: s.amount,
    currency: g.currency ?? 'INR',
  })
  // Needs the payee's OK: check the screenshot, then tell the payee whether it cleared or waits for them.
  if (s.needsOk === true && to && to !== s.createdBy) {
    const verdict = await checkProof(groupId, settlementId, s as ProofSettlement, g, to).catch((e) => {
      logger.warn('payment check failed', { groupId, settlementId, message: (e as Error).message })
      return null
    })
    await sendToUser(
      to,
      [paymentOkPref(verdict === 'match')],
      paymentOkNote({ ...common(to), fromName: labelOf(g.members, s.from), cleared: verdict === 'match' }),
    )
    return
  }
  const jobs: Array<Promise<number>> = []
  if (to && to !== s.createdBy) jobs.push(sendToUser(to, ['settlements'], settlementNote({ ...common(to), fromName: labelOf(g.members, s.from) })))
  // "Rahul paid me ₹500", recorded by the creditor: Rahul should hear about it and be able to flag it.
  if (from && from !== s.createdBy) jobs.push(sendToUser(from, ['settlements'], settlementRecordedNote({ ...common(from), toName: labelOf(g.members, s.to) })))
  await Promise.all(jobs)
})

export const onSettlementUpdated = onDocumentUpdated({ document: 'groups/{groupId}/settlements/{settlementId}', region: REGION }, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const { groupId, settlementId } = event.params
  await unarchiveForEdit(groupId, before, after).catch((err) => logger.warn('unarchive', { groupId, error: (err as Error).message }))
  const decision = payeeDecision(before, after)
  if (!decision || !after) return
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  const uids = uidsOf(g)
  const from = memberUid(g.members, after.from, uids)
  const to = memberUid(g.members, after.to, uids)
  if (!from || from === to) return
  await sendToUser(
    from,
    ['settlements'],
    paymentDecisionNote({
      groupId,
      settlementId,
      groupName: groupNameForRecipient(g, from),
      emoji: g.emoji,
      toName: labelOf(g.members, after.to),
      amount: after.amount,
      currency: g.currency ?? 'INR',
      decision,
    }),
  )
})

export const onPushTokenCreated = onDocumentCreated({ document: 'users/{uid}/pushTokens/{tokenId}', region: REGION }, async (event) => {
  const token = event.data?.get('token')
  if (typeof token !== 'string' || !token) return
  const dupes = await db().collectionGroup('pushTokens').where('token', '==', token).get()
  const batch = db().batch()
  let n = 0
  for (const d of dupes.docs) {
    if (d.ref.parent.parent?.id !== event.params.uid) {
      batch.delete(d.ref)
      n++
    }
  }
  if (n) {
    await batch.commit()
    logger.info('push token moved to another account', { uid: event.params.uid, removed: n })
  }
})

export const onGroupDeleted = onDocumentDeleted({ document: 'groups/{groupId}', region: REGION, timeoutSeconds: 300 }, async (event) => {
  const { groupId } = event.params
  const firestore = db()
  await firestore.recursiveDelete(firestore.doc(`groups/${groupId}`))
  // The chat's push bookkeeping lives outside the group (server-only).
  await firestore
    .doc(`chatPush/${groupId}`)
    .delete()
    .catch(() => {})
  try {
    await (await storage()).bucket().deleteFiles({ prefix: `receipts/${groupId}/` })
    await (await storage()).bucket().deleteFiles({ prefix: `settleproofs/${groupId}/` })
  } catch (e) {
    logger.warn('receipt cleanup failed', { groupId, error: (e as Error).message })
  }
  logger.info('group deleted', { groupId })
})
