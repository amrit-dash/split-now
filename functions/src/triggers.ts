/*
 * Push notifications for group activity. App Check doesn't apply to Firestore triggers.
 *  - expense added → the other people in it ("Sarah added Dinner · ₹840 · your share ₹210")
 *  - settlement recorded → the person who was paid
 * Imports, recurring copies and trashed docs are skipped. Each recipient's prefs decide.
 */
import { logger } from 'firebase-functions'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db } from './admin'
import { REGION } from './config'
import { expenseNote, settlementNote } from './lib/notify-text'
import { expenseRecipients, memberNameForUid, type MemberLite } from './lib/recipients'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  emoji?: string
  currency?: string
  members?: Record<string, MemberLite>
}

async function actorName(groupId: string, g: GroupLite, uid: string | undefined): Promise<string> {
  const fromMembers = memberNameForUid(g.members, uid)
  if (fromMembers) return fromMembers
  if (!uid) return 'Someone'
  const p = await db().doc(`groups/${groupId}/profiles/${uid}`).get()
  const n = p.get('displayName')
  return typeof n === 'string' && n ? n : 'Someone'
}

export const onExpenseCreated = onDocumentCreated({ document: 'groups/{groupId}/expenses/{expenseId}', region: REGION }, async (event) => {
  const e = event.data?.data()
  if (!e || e.importedFrom || e.recurringFrom || typeof e.deletedAt === 'number') return
  const { groupId, expenseId } = event.params
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g) return
  const recipients = expenseRecipients(g.members, e)
  if (!recipients.length) return
  const actor = await actorName(groupId, g, e.createdBy)
  const currency = g.currency ?? 'INR'
  const sent = await Promise.all(recipients.map((r) => sendToUser(r.uid, ['expenses'], expenseNote({
    groupId, expenseId, groupName: g.name ?? 'Group', emoji: g.emoji, actorName: actor, description: String(e.description ?? ''),
    amount: e.amount, currency, share: r.share, paid: r.paid, needsApproval: e.requiresApproval === true,
  }))))
  logger.info('expense push', { groupId, expenseId, recipients: recipients.length, sent: sent.reduce((a, b) => a + b, 0) })
})

export const onSettlementCreated = onDocumentCreated({ document: 'groups/{groupId}/settlements/{settlementId}', region: REGION }, async (event) => {
  const s = event.data?.data()
  if (!s || s.importedFrom || typeof s.deletedAt === 'number') return
  const { groupId, settlementId } = event.params
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  const to = g?.members?.[s.to]?.uid
  if (!g || !to || to === s.createdBy) return
  await sendToUser(to, ['settlements'], settlementNote({
    groupId, settlementId, groupName: g.name ?? 'Group', emoji: g.emoji,
    fromName: g.members?.[s.from]?.name ?? 'Someone', amount: s.amount, currency: g.currency ?? 'INR',
  }))
})
