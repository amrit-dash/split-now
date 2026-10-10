/*
 * Payments need the recipient's OK (shared/payment-ok.ts): the server's check of a payment
 * screenshot. The payer attaches it in Settle up (settleproofs/{groupId}/{settlementId}.jpg);
 * the check reads it with AI as the payee (their switches, key and allowance; the admin's
 * aiPayments flag), and a match clears the payment (ok via 'ai'). Only the server can write that
 * OK, so a modified app can't clear a payment without a real screenshot. A mismatch, an
 * unreadable image or AI being off leaves the payment waiting for the payee, the screenshot there
 * for them to look at.
 */
import { logger } from 'firebase-functions/logger'
import { checkPayment, type PaymentCheck } from '../../shared/payment-ok'
import { aiReadPayment } from './ai'
import { db, storage } from './admin'
import { istDate } from './lib/time'
import { proofExpect, proofUpdate, shouldCheck, type ProofSettlement } from './lib/payment-proof'

/** 5 MB, as storage.rules allows; anything larger isn't ours. */
const MAX_PROOF = 5 * 1024 * 1024

/** Check the screenshot of a new payment. Returns the verdict, or null when there was nothing to check or AI was unavailable. */
export async function checkProof(
  groupId: string,
  settlementId: string,
  s: ProofSettlement,
  g: { currency?: string; members?: Record<string, { name?: string; uid?: string } | undefined> },
  payeeUid: string,
): Promise<PaymentCheck['verdict'] | null> {
  if (!shouldCheck(s, groupId, settlementId)) return null
  const file = (await storage()).bucket().file(s.proofPath as string)
  const [meta] = await file.getMetadata().catch(() => [null])
  if (!meta || Number(meta.size) > MAX_PROOF) return null
  const [bytes] = await file.download()
  const ai = await aiReadPayment(payeeUid, bytes, s.paid?.currency ?? g.currency ?? 'INR', istDate(new Date()))
  if (!ai.ok) {
    logger.info('payment check skipped', { groupId, settlementId, reason: ai.reason })
    return null
  }
  const group = db().doc(`groups/${groupId}`)
  const profile = (await group.collection('profiles').doc(payeeUid).get()).data()
  // The same screenshot (its reference) can't clear a second payment in the group.
  const ref = ai.read?.ref?.trim()
  const used = ref ? await group.collection('settlements').where('aiCheck.ref', '==', ref.slice(0, 60)).limit(5).get() : null
  const usedRefs = used?.docs.some((d) => d.id !== settlementId) ? [ref as string] : []
  const check = checkPayment(ai.read, proofExpect(s, g, profile, usedRefs))
  const sRef = group.collection('settlements').doc(settlementId)
  await db().runTransaction(async (tx) => {
    const now = (await tx.get(sRef)).data() as ProofSettlement | undefined
    if (!now) return
    tx.update(sRef, proofUpdate(check, ai.read, Date.now(), now))
  })
  logger.info('payment checked', { groupId, settlementId, verdict: check.verdict, reasons: check.reasons })
  return check.verdict
}
