/*
 * Delete my account (Settings → Data → Delete my account; docs/PLAN.md §4.2 "Accounts").
 *  deleteAccount {}               → the plan: what happens to each group, and what stops it (nothing changes)
 *  deleteAccount { confirm: true } → does it, if nothing stops it and the person signed in within 5 minutes
 * What happens to groups is shared/account-delete.ts: wallets and groups nobody else has an account
 * in are deleted; in any other group the person leaves and their entry becomes "Deleted account".
 * Then everything kept under or about the account goes: the profile and its subcollections, the
 * photo, capture keys and captured payments, added emails, Pay me links, live tables, error reports
 * and rate counters. The sign-in itself goes last, so a run that stops halfway can simply be
 * repeated (each step finds what's left).
 */
import { FieldPath, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { clearedEntry, DELETED_NAME, type DeletionExpense, type DeletionGroup, planDeletion, planGroup, signedInRecently } from '../../shared/account-delete'
import type { BalanceSettlement } from '../../shared/balances-core'
import { auth, db, storage } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { emailId } from './link-members'
import { normEmail } from './lib/link'

const callable = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 300, memory: '512MiB' as const, maxInstances: 2 }

type Loaded = { group: DeletionGroup & { inviteCode?: string; archivedBy?: string[] }; expenses: DeletionExpense[]; settlements: BalanceSettlement[] }

/** Every group the account is in, with what the plan needs to know about money in it. */
async function loadGroups(uid: string): Promise<Loaded[]> {
  const snap = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
  return Promise.all(
    snap.docs.map(async (d) => {
      const [ex, st] = await Promise.all([d.ref.collection('expenses').get(), d.ref.collection('settlements').get()])
      return {
        group: { ...(d.data() as Omit<DeletionGroup, 'id'>), id: d.id },
        expenses: ex.docs.map((e) => ({ ...(e.data() as Omit<DeletionExpense, 'id'>), id: e.id })),
        settlements: st.docs.map((s) => s.data() as BalanceSettlement),
      }
    }),
  )
}

/** Delete every document a query finds, 400 to a batch; answers their ids. */
async function deleteAll(q: FirebaseFirestore.Query): Promise<string[]> {
  const snap = await q.get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch()
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  return snap.docs.map((d) => d.id)
}

/** Leave one group, as the plan said, inside a transaction that checks the plan still holds. */
async function leave(uid: string, gid: string, now: number): Promise<void> {
  const ref = db().doc(`groups/${gid}`)
  const [ex, st] = await Promise.all([ref.collection('expenses').get(), ref.collection('settlements').get()])
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const g = { ...(snap.data() as Loaded['group']), id: gid }
    const p = planGroup(
      uid,
      g,
      ex.docs.map((e) => ({ ...(e.data() as Omit<DeletionExpense, 'id'>), id: e.id })),
      st.docs.map((s) => s.data() as BalanceSettlement),
    )
    if (!p) return
    if ('blockers' in p) throw new HttpsError('failed-precondition', 'Something changed in one of your groups. Look again')
    if (p.step.kind === 'delete') {
      tx.delete(ref) // onGroupDeleted sweeps its subcollections, receipts, chat and key
      return
    }
    const { memberId, newCreator } = p.step
    const patch: Record<string, unknown> = {
      [`members.${memberId}`]: clearedEntry((g.members[memberId] ?? {}) as Record<string, unknown>, now),
      memberUids: FieldValue.arrayRemove(uid),
      archivedBy: FieldValue.arrayRemove(uid),
      memberOpId: memberId,
      updatedAt: now,
    }
    if (newCreator) patch.createdBy = newCreator
    tx.update(ref, patch)
    tx.delete(db().doc(`groups/${gid}/profiles/${uid}`))
    tx.delete(db().doc(`groups/${gid}/joinRequests/${uid}`))
    tx.set(db().doc(`chatPush/${gid}`), { last: { [uid]: FieldValue.delete() } }, { merge: true })
    tx.set(db().doc(`reminderState/${gid}`), { lastSent: { [uid]: FieldValue.delete() } }, { merge: true })
  })
  // A merge they asked for, or that waits for their OK, can't be decided by anyone now.
  const open = await ref.collection('mergeRequests').where('status', '==', 'pending').get()
  await Promise.all(
    open.docs
      .filter((d) => d.get('by') === uid || d.get('approverUid') === uid)
      .map((d) => d.ref.update({ status: 'declined', decidedBy: 'system', decidedAt: now })),
  )
}

/** Everything about the account outside groups. Each step is safe to repeat. */
async function wipe(uid: string, emails: string[]): Promise<void> {
  const f = db()
  const [, , made, lockedTo] = await Promise.all([
    deleteAll(f.collection('captureTokens').where('uid', '==', uid)),
    deleteAll(f.collection('captureInbox').where('uid', '==', uid)),
    deleteAll(f.collection('payLinks').where('createdBy', '==', uid)),
    deleteAll(f.collection('payLinks').where('forUid', '==', uid)),
    deleteAll(f.collection('tables').where('hostUid', '==', uid)),
    deleteAll(f.collection('appErrors').where('uid', '==', uid)),
  ])
  // A Pay me link they paid stays with its owner; it just no longer names them.
  const paid = await f.collection('payLinks').where('paidBy', '==', uid).get()
  await Promise.all(paid.docs.map((d) => d.ref.update({ paidBy: FieldValue.delete() })))
  // A seat at someone else's table keeps the items claimed on it, under the name every reader shows.
  const seats = await f.collection('tables').where(`participants.${uid}.uid`, '==', uid).get()
  await Promise.all(seats.docs.map((d) => d.ref.update({ [`participants.${uid}.name`]: DELETED_NAME, [`participants.${uid}.uid`]: FieldValue.delete() })))
  for (const email of emails) {
    const idx = f.doc(`emailIndex/${emailId(email)}`)
    if ((await idx.get()).get('uid') === uid) await idx.delete()
    await f.doc(`emailInvites/${emailId(email)}`).delete()
  }
  await Promise.all(
    [`pendingMerges/${uid}`, `blocked/${uid}`, `rateLimits/fx_${uid}`, ...['own', 'app', 'keycheck', 'picture'].map((k) => `rateLimits/ai_${k}_${uid}`)].map(
      (p) => f.doc(p).delete(),
    ),
  )
  // Counters whose id starts with the account: nudges they sent a person, payment checks they asked for.
  // (A group nudge's counter, nudge_{gid}_{uid}_…, has the group first and lasts a day.)
  for (const prefix of [`nudgep_${uid}_`, `proof_${uid}_`])
    await deleteAll(f.collection('rateLimits').where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', `${prefix}\uf8ff`))
  // Accounts merged into this one earlier (switched off, kept for admins): their traces go too.
  const merged = await f.collection('users').where('mergedInto', '==', uid).get()
  const a = await auth()
  for (const d of merged.docs) {
    await f.recursiveDelete(d.ref)
    await a.deleteUser(d.id).catch(() => undefined)
  }
  await f.recursiveDelete(f.doc(`users/${uid}`))
  // The emulator runs without Storage (npm run test:functions), and would reach the real bucket.
  if (process.env.FUNCTIONS_EMULATOR === 'true' && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) return
  const bucket = (await storage()).bucket()
  // The photo, and the payment screenshots on the Pay me links that went.
  for (const prefix of [`avatars/${uid}/`, ...[...made, ...lockedTo].map((code) => `payproofs/${code}/`)])
    await bucket.deleteFiles({ prefix }).catch((e) => logger.warn('account files delete', { prefix, error: (e as Error).message }))
}

export const deleteAccount = onCall(callable, async (req) => {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  const uid = req.auth.uid
  const plan = planDeletion(uid, await loadGroups(uid))
  const admin = (await db().doc(`admins/${uid}`).get()).exists
  if (req.data?.confirm !== true) return { ...plan, admin }
  if (admin) throw new HttpsError('failed-precondition', 'Remove your admin access first')
  if (plan.blockers.length) throw new HttpsError('failed-precondition', 'Settle up in your groups first')
  const now = Date.now()
  if (!signedInRecently(req.auth.token.auth_time, now)) throw new HttpsError('unauthenticated', 'Sign in again to delete your account')
  for (const step of plan.steps) await leave(uid, step.groupId, now)
  const added = (await db().doc(`users/${uid}/account/emails`).get()).get('list') as Record<string, { email?: string }> | undefined
  const emails = [...new Set([normEmail(req.auth.token.email), ...Object.values(added ?? {}).map((e) => normEmail(e.email))].filter(Boolean))]
  await wipe(uid, emails)
  await (await auth()).deleteUser(uid).catch((e) => {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e
  })
  logger.info('deleted account', { uid, groups: plan.steps.length })
  return { deleted: true }
})
