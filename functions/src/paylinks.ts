/*
 * Pay me links (payLinks/{code}, shared/paylinks.ts). Someone with the link, signed in or
 * anonymous, taps "I've paid": the rules allow exactly open → paid (+ paidAt, paidBy, method,
 * proofPath). This trigger then does what a stranger can't:
 *  - records the settlement in the group (from → to, the link's amount, the claimed method),
 *    written as the payee who asked to be paid, with id pl_{code} and a settlement.created
 *    activity entry, in one transaction that also stamps the link (settlementId, recordedAt), so
 *    a re-run never records twice;
 *  - pushes the payee "Rahul marked ₹1,240 paid · Goa trip" (their `settlements` preference).
 * The payee can delete the payment in the group like any other: that is the answer to a false
 * claim, and the push and the activity line say so. A link without a group (a live table closed
 * without one) only gets the push. A member who recorded it in Settle up sets settlementId
 * themselves, and the trigger leaves it alone. Off with config/app flags.payLinks.
 */
import { logger } from 'firebase-functions/logger'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { planRecord, shouldHandle, type GroupLite, type PayLinkDoc, type RecordPlan } from '../../shared/paylinks'
import { db } from './admin'
import { REGION } from './config'
import { flagOn } from './lib/limits'
import { formatMoney, payLinkPaidNote } from './lib/notify-text'
import { istDate } from './lib/time'
import { sendToUser } from './push'

export const onPayLinkPaid = onDocumentUpdated({ document: 'payLinks/{code}', region: REGION }, async (event) => {
  const before = event.data?.before.data() as Partial<PayLinkDoc> | undefined
  const after = event.data?.after.data() as PayLinkDoc | undefined
  if (!after || !shouldHandle(before, after)) return
  const { code } = event.params
  if (!(await flagOn('payLinks'))) {
    logger.info('pay link paid while payLinks is off: not recorded', { code })
    return
  }
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
