/*
 * Pay me links (payLinks/{code}, shared/paylinks.ts). Someone with the link, signed in or
 * anonymous, taps "I've paid": the rules allow exactly open → paid (+ paidAt, paidBy, method,
 * proofPath), or open → claimed for a live table link not locked to one guest, which the host
 * then confirms (claimed → paid) or dismisses (→ open). On → paid this trigger does what a
 * stranger can't:
 *  - records the settlement in the group (from → to, the link's amount, the claimed method),
 *    written as the payee who asked to be paid, with id pl_{code} and a settlement.created
 *    activity entry, in one transaction that also stamps the link (settlementId, recordedAt), so
 *    a re-run never records twice;
 *  - pushes the payee "Rahul marked ₹1,240 paid · Goa trip" (their `settlements` preference).
 * The payee can delete the payment in the group like any other: that is the answer to a false
 * claim, and the push and the activity line say so. A link without a group (a live table closed
 * without one) only gets the push. A member who recorded it in Settle up sets settlementId
 * themselves, and the trigger leaves it alone. On → claimed it only logs the claim in the group
 * and tells the host. Recorded whatever the payLinks flag says (the flag only stops new links).
 */
import { logger } from 'firebase-functions/logger'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { claimSummary, planRecord, triggerAction, type GroupLite, type PayLinkDoc, type RecordPlan } from '../../shared/paylinks'
import { db } from './admin'
import { REGION } from './config'
import { formatMoney, payLinkClaimedNote, payLinkPaidNote } from './lib/notify-text'
import { istDate } from './lib/time'
import { sendToUser } from './push'

export const onPayLinkPaid = onDocumentUpdated({ document: 'payLinks/{code}', region: REGION }, async (event) => {
  const before = event.data?.before.data() as Partial<PayLinkDoc> | undefined
  const after = event.data?.after.data() as PayLinkDoc | undefined
  // No flag check: the payLinks flag only stops new links; a claim on an existing one is always honoured.
  const action = after ? triggerAction(before, after) : null
  if (!after || !action) return
  const { code } = event.params
  if (action === 'claimed') return onClaimed(code, after)
  const firestore = db()
  const linkRef = firestore.doc(`payLinks/${code}`)
  const now = Date.now()
  const plan = await firestore.runTransaction(async (tx): Promise<RecordPlan | null> => {
    const fresh = await tx.get(linkRef)
    const l = fresh.data() as PayLinkDoc | undefined
    // Handled already (a retry), or changed since (cancelled can't follow paid, but be safe).
    if (l?.status !== 'paid' || l.recordedAt || l.settlementId) return null
    const g = l.groupId ? ((await tx.get(firestore.doc(`groups/${l.groupId}`))).data() as GroupLite | undefined) : undefined
    const p = planRecord(code, l, g, istDate(new Date(l.paidAt ?? now)), now, (m) => formatMoney(m, l.currency))
    if (p.kind === 'record') {
      const sRef = firestore.doc(`groups/${p.settlement.groupId}/settlements/${p.settlementId}`)
      if ((await tx.get(sRef)).exists) {
        tx.update(linkRef, { settlementId: p.settlementId, recordedAt: now })
        return null
      }
      tx.create(sRef, p.settlement)
      tx.create(firestore.doc(`groups/${p.settlement.groupId}/activity/${p.settlementId}`), {
        type: 'settlement.created',
        actorUid: l.paidBy ?? l.createdBy,
        actorName: (l.payerName || 'Someone').slice(0, 100),
        targetId: p.settlementId,
        summary: p.summary,
        after: { amount: l.amount, from: l.from, to: l.to, payLink: code },
        createdAt: now,
      })
      tx.update(firestore.doc(`groups/${p.settlement.groupId}`), { updatedAt: now })
      tx.update(linkRef, { settlementId: p.settlementId, recordedAt: now })
    } else tx.update(linkRef, { recordedAt: now })
    return p
  })
  if (!plan) return
  if (plan.kind === 'skip') {
    logger.warn('pay link not recorded', { code, reason: plan.reason })
    return
  }
  const sent = plan.payeeUid
    ? await sendToUser(
        plan.payeeUid,
        ['settlements'],
        payLinkPaidNote({
          code,
          groupName: after.groupName,
          emoji: after.emoji,
          payerName: after.payerName,
          amount: after.amount,
          currency: after.currency,
          recorded: plan.kind === 'record',
          withProof: !!after.proofPath,
        }),
      )
    : 0
  logger.info('pay link paid', { code, recorded: plan.kind === 'record', devices: sent })
})

/**
 * A table guest's "I've paid" on a link not locked to them (open → claimed): a line in the group's
 * activity (so the group screen can offer Confirm) and a push to the host. Nothing is recorded
 * until the host confirms (claimed → paid, handled above). The entry id carries the claim time,
 * so a re-run writes it once and a later claim (after a dismiss) gets its own.
 */
async function onClaimed(code: string, l: PayLinkDoc) {
  const firestore = db()
  if (l.groupId) {
    const g = (await firestore.doc(`groups/${l.groupId}`).get()).data() as GroupLite | undefined
    const uids = Array.isArray(g?.memberUids) ? g.memberUids : []
    if (g && uids.includes(l.createdBy)) {
      await firestore
        .doc(`groups/${l.groupId}/activity/plc_${code}_${l.paidAt ?? 0}`)
        .create({
          type: 'settlement.claimed',
          actorUid: l.paidBy ?? l.createdBy,
          actorName: (l.payerName || 'Someone').slice(0, 100),
          targetId: code,
          summary: claimSummary(l, (m) => formatMoney(m, l.currency)),
          after: { amount: l.amount, from: l.from, to: l.to },
          createdAt: Date.now(),
        })
        .catch((e) => {
          // ALREADY_EXISTS on a retry is fine.
          if ((e as { code?: number }).code !== 6) throw e
        })
    }
  }
  const sent = await sendToUser(
    l.createdBy,
    ['settlements'],
    payLinkClaimedNote({
      code,
      groupName: l.groupName,
      emoji: l.emoji,
      payerName: l.payerName,
      amount: l.amount,
      currency: l.currency,
      withProof: !!l.proofPath,
    }),
  )
  logger.info('pay link claimed', { code, devices: sent })
}
