/*
 * One account per person (docs/PLAN.md §4.2 "Accounts"). Everything goes through Firebase's own
 * emails: no outside mail service.
 *  - An email-and-password account confirms its own email with Firebase's verification link (the
 *    app waits for it before anything else).
 *  - claimEmail: another email joins the account once its owner opens Firebase's sign-in link for
 *    it; the app hands over that link session's ID token as the proof. An address that is an
 *    account of its own is merged in only after the person confirms (mergeAccount): its groups, Pay
 *    me links and live tables move to the account that stays, and the old account is switched off.
 *  - adoptGuest: a guest (live table, Pay me link) who signs in to an account that already exists
 *    hands over the guest's ID token; the guest's links and tables move, the entry their locked
 *    Pay me link points to gets the account, and the guest account is deleted.
 * Decisions about groups are in lib/move-uid.ts.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { labelForUid } from '../../shared/names'
import { auth, db } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { normEmail } from './lib/link'
import { planGroupMove, planGuestClaim, type MoveGroup } from './lib/move-uid'
import { addedToGroupNote } from './lib/notify-text'
import { emailId, linkInvitesFor } from './link-members'
import { sendToUser } from './push'

const callable = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 60, memory: '256MiB' as const, maxInstances: 5 }

const pendingRef = (uid: string) => db().doc(`pendingMerges/${uid}`)
/** How long a proved address stays ready to merge (the person confirms on the same screen). */
const MERGE_WINDOW_MS = 15 * 60_000
const indexRef = (email: string) => db().doc(`emailIndex/${emailId(email)}`)
const emailsRef = (uid: string) => db().doc(`users/${uid}/account/emails`)

function signedIn(req: CallableRequest): { uid: string; email: string; verified: boolean } {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return { uid: req.auth.uid, email: normEmail(req.auth.token.email), verified: req.auth.token.email_verified === true }
}

// ---- Adding an email (proved with Firebase's own sign-in link) -------------------------------

/**
 * Firebase sends no custom emails, but it does send a sign-in link to any address. The app opens
 * that link in a separate, throwaway Firebase session and hands its ID token here: a token for
 * that address with email_verified is the proof that the person reads it.
 *  - The link made a brand-new account for the address (nothing in it): its traces move here, it
 *    is deleted, and the address joins this account.
 *  - The address is a real account of its own (or another account's added email): it can be
 *    merged in (mergeAccount) within 15 minutes, after the person confirms. Answers otherAccount.
 */
export const claimEmail = onCall({ ...callable, timeoutSeconds: 120 }, async (req) => {
  const me = signedIn(req)
  if (!me.verified) throw new HttpsError('failed-precondition', 'Confirm your own email first')
  const a = await auth()
  const token = typeof req.data?.token === 'string' ? req.data.token : ''
  const proof = await a.verifyIdToken(token).catch(() => undefined)
  const email = normEmail(proof?.email)
  if (proof?.email_verified !== true || !email || proof.firebase?.sign_in_provider === 'anonymous')
    throw new HttpsError('permission-denied', 'That link didn’t work. Send a new one')
  if (proof.uid === me.uid || email === me.email) return { already: true }
  const mine = (await emailsRef(me.uid).get()).get(`list.${emailId(email)}`)
  if (mine) return { already: true }
  // The account the address really belongs to: an added email of someone else, else the token's own account.
  const indexed = (await indexRef(email).get()).get('uid')
  const owner = typeof indexed === 'string' && indexed !== proof.uid ? indexed : proof.uid
  const fresh = owner === proof.uid && (await isThrowaway(proof.uid))
  if (fresh) {
    // Groups may have linked the throwaway account already (it has the verified email): they move here.
    const moved = await moveAccount(proof.uid, me.uid)
    await a.deleteUser(proof.uid).catch((e) => logger.warn('throwaway delete', { error: (e as Error).message }))
    const linked = (await addEmail(me.uid, email)) + moved.groups + moved.linked
    return { added: true, linked }
  }
  // The sign-in link may have made a throwaway account even though the address is someone's added email.
  if (owner !== proof.uid && (await isThrowaway(proof.uid))) await a.deleteUser(proof.uid).catch(() => undefined)
  if (owner === me.uid) return { already: true }
  const other = await a.getUser(owner).catch(() => undefined)
  const groups = (await db().collection('groups').where('memberUids', 'array-contains', owner).count().get()).data().count
  await pendingRef(me.uid).set({ email, uid: owner, until: Date.now() + MERGE_WINDOW_MS })
  return { otherAccount: { name: other?.displayName ?? '', email, groups } }
})

/** An account the sign-in link just made: created in the last 15 minutes, no profile, in no group. */
async function isThrowaway(uid: string): Promise<boolean> {
  const u = await (await auth()).getUser(uid).catch(() => undefined)
  if (!u || Date.now() - Date.parse(u.metadata.creationTime) > MERGE_WINDOW_MS) return false
  const [profile, groups] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    db().collection('groups').where('memberUids', 'array-contains', uid).limit(1).get(),
  ])
  return !profile.exists && groups.empty
}

async function addEmail(uid: string, email: string): Promise<number> {
  const at = Date.now()
  await db().runTransaction(async (tx) => {
    const idx = await tx.get(indexRef(email))
    const owner = idx.get('uid')
    if (typeof owner === 'string' && owner !== uid) throw new HttpsError('already-exists', 'That email belongs to another account')
    tx.set(indexRef(email), { uid, email, addedAt: at })
    tx.set(emailsRef(uid), { list: { [emailId(email)]: { email, addedAt: at } } }, { merge: true })
  })
  return linkInvitesFor(uid, email)
}

/** Take an added (not the account's own) email off the account. */
export const removeEmail = onCall(callable, async (req) => {
  const me = signedIn(req)
  const email = normEmail(req.data?.email)
  if (!email || email === me.email) throw new HttpsError('invalid-argument', 'That email can’t be removed')
  await db().runTransaction(async (tx) => {
    const idx = await tx.get(indexRef(email))
    if (idx.get('uid') === me.uid) tx.delete(indexRef(email))
    tx.set(emailsRef(me.uid), { list: { [emailId(email)]: FieldValue.delete() } }, { merge: true })
  })
  return { removed: true }
})

// ---- Moving one account into another --------------------------------------------------------

interface MoveResult {
  groups: number
  suggested: number
  linked: number
}

/**
 * Everything account `from` is in moves to `into`: group entries (see planGroupMove), the per-group
 * payment profile, Pay me links and live tables. A guest's locked Pay me link also gives its group
 * entry the account (planGuestClaim). Each group in its own transaction, so a retry is safe.
 */
async function moveAccount(from: string, into: string): Promise<MoveResult> {
  const out: MoveResult = { groups: 0, suggested: 0, linked: 0 }
  const [inGroups, created] = await Promise.all([
    db().collection('groups').where('memberUids', 'array-contains', from).get(),
    db().collection('groups').where('createdBy', '==', from).get(),
  ])
  const groupIds = new Set([...inGroups.docs, ...created.docs].map((d) => d.id))
  for (const gid of groupIds) {
    const ref = db().doc(`groups/${gid}`)
    const suggest = await db().runTransaction(async (tx) => {
      const g = (await tx.get(ref)).data() as MoveGroup | undefined
      if (!g) return undefined
      const plan = planGroupMove(g, from, into)
      if (!plan) return undefined
      // Firestore transactions read everything before the first write.
      const oldProfile = await tx.get(db().doc(`groups/${gid}/profiles/${from}`))
      const newProfile = await tx.get(db().doc(`groups/${gid}/profiles/${into}`))
      const patch: Record<string, unknown> = { memberUids: plan.memberUids, updatedAt: Date.now() }
      for (const [mid, m] of Object.entries(plan.members)) {
        patch[`members.${mid}.uid`] = m.uid === null ? FieldValue.delete() : m.uid
        if (m.formerUids) patch[`members.${mid}.formerUids`] = m.formerUids
      }
      if (plan.archivedBy) patch.archivedBy = plan.archivedBy
      if (plan.createdBy) patch.createdBy = plan.createdBy
      tx.update(ref, patch)
      // The payment details someone shared with this group follow them.
      if (oldProfile.exists && !newProfile.exists) tx.set(newProfile.ref, oldProfile.data()!)
      if (oldProfile.exists) tx.delete(oldProfile.ref)
      return plan.suggest
    })
    out.groups++
    if (suggest) {
      await suggestMerge(gid, suggest.from, suggest.into)
      out.suggested++
    }
  }

  // Pay me links: a guest's locked link gives the group entry it points to the account.
  const locked = await db().collection('payLinks').where('forUid', '==', from).get()
  for (const l of locked.docs) {
    const groupId = l.get('groupId')
    if (typeof groupId !== 'string') continue
    const r = await claimForGuest(groupId, l.get('from'), into)
    if (r === 'linked') out.linked++
    if (r === 'suggested') out.suggested++
  }
  await repoint('payLinks', 'forUid', from, into)
  await repoint('payLinks', 'createdBy', from, into)
  await repoint('payLinks', 'paidBy', from, into)
  await repoint('tables', 'hostUid', from, into)
  // A guest at a table is keyed by their (guest) uid; the entry keeps its key and gets the account.
  const seats = await db().collection('tables').where(`participants.${from}.uid`, '==', from).get()
  await Promise.all(seats.docs.map((d) => d.ref.update({ [`participants.${from}.uid`]: into })))
  return out
}

async function repoint(collection: string, field: string, from: string, into: string) {
  const snap = await db().collection(collection).where(field, '==', from).get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch()
    for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { [field]: into })
    await batch.commit()
  }
}

async function claimForGuest(groupId: string, fromMid: unknown, into: string): Promise<'linked' | 'suggested' | null> {
  const ref = db().doc(`groups/${groupId}`)
  const r = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const g = snap.data() as (MoveGroup & { name?: string; emoji?: string; inviteCode?: string }) | undefined
    if (!g || typeof fromMid !== 'string') return null
    const plan = planGuestClaim(g, { groupId, from: fromMid }, into)
    if (!plan) return null
    if ('suggest' in plan) return { suggest: plan.suggest, linked: undefined }
    tx.update(ref, { [`members.${plan.link}.uid`]: into, memberUids: FieldValue.arrayUnion(into), updatedAt: Date.now() })
    if (g.inviteCode) tx.set(db().doc(`invites/${g.inviteCode}`), { placeholders: { [plan.link]: FieldValue.delete() } }, { merge: true })
    return {
      suggest: undefined,
      linked: { name: g.name ?? 'A group', emoji: g.emoji, by: g.createdBy ? labelForUid(g.members ?? {}, g.createdBy) : undefined },
    }
  })
  if (!r) return null
  if (r.suggest) {
    await suggestMerge(groupId, r.suggest.from, r.suggest.into)
    return 'suggested'
  }
  if (!r.linked) return null
  await sendToUser(into, ['expenses'], addedToGroupNote({ groupId, groupName: r.linked.name, emoji: r.linked.emoji, byName: r.linked.by }))
  return 'linked'
}

/** Two entries that are one person: offer the group a merge (one open suggestion per pair). */
async function suggestMerge(groupId: string, from: string, into: string) {
  await db()
    .doc(`groups/${groupId}/mergeRequests/s_${from}__${into}`)
    .set({ from, into, status: 'suggested', reason: 'same-person', by: 'system', createdAt: Date.now() }, { merge: true })
}

/**
 * Merge the account behind an address the caller just proved with a code into the caller's
 * account. The old account is switched off (not deleted: an admin can still look it up) and its
 * email joins this account.
 */
export const mergeAccount = onCall({ ...callable, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const me = signedIn(req)
  const pending = (await pendingRef(me.uid).get()).data() as { email?: string; uid?: string; until?: number } | undefined
  if (!pending?.uid || !pending.email || (pending.until ?? 0) < Date.now()) throw new HttpsError('failed-precondition', 'Open a new link for that email first')
  if (pending.uid === me.uid) throw new HttpsError('invalid-argument', 'That’s this account')
  if ((await db().doc(`admins/${pending.uid}`).get()).exists)
    throw new HttpsError('failed-precondition', 'That account is an admin. Remove its admin access first')
  const moved = await moveAccount(pending.uid, me.uid)
  const a = await auth()
  await a.updateUser(pending.uid, { disabled: true })
  await a.revokeRefreshTokens(pending.uid)
  await db().doc(`users/${pending.uid}`).set({ mergedInto: me.uid, mergedAt: Date.now() }, { merge: true })
  // Its other added emails come along too.
  const theirs = (await emailsRef(pending.uid).get()).get('list') as Record<string, { email?: string }> | undefined
  const emails = [pending.email, ...Object.values(theirs ?? {}).map((e) => normEmail(e.email))].filter(Boolean)
  for (const email of new Set(emails)) {
    await db().runTransaction(async (tx) => {
      tx.set(indexRef(email), { uid: me.uid, email, addedAt: Date.now() })
      tx.set(emailsRef(me.uid), { list: { [emailId(email)]: { email, addedAt: Date.now() } } }, { merge: true })
    })
  }
  await emailsRef(pending.uid).delete()
  await pendingRef(me.uid).delete()
  let linked = moved.linked
  for (const email of new Set(emails)) linked += await linkInvitesFor(me.uid, email)
  logger.info('merged account', { from: pending.uid, into: me.uid, ...moved })
  return { ...moved, linked }
})

/**
 * A guest signed in to an account that already existed: the guest's things move to it. The app
 * sends the guest's ID token (taken before switching), which proves it was the same phone.
 */
export const adoptGuest = onCall({ ...callable, timeoutSeconds: 120 }, async (req) => {
  const me = signedIn(req)
  const token = typeof req.data?.guestToken === 'string' ? req.data.guestToken : ''
  if (!token) throw new HttpsError('invalid-argument', 'Missing guest')
  const a = await auth()
  const guest = await a.verifyIdToken(token).catch(() => undefined)
  if (guest?.firebase?.sign_in_provider !== 'anonymous') throw new HttpsError('permission-denied', 'That guest session has ended')
  if (!guest || guest.uid === me.uid) return { groups: 0, suggested: 0, linked: 0 }
  const moved = await moveAccount(guest.uid, me.uid)
  await a.deleteUser(guest.uid).catch((e) => logger.warn('guest delete', { error: (e as Error).message }))
  logger.info('adopted guest', { guest: guest.uid, into: me.uid, ...moved })
  return moved
})

/** After a guest's account became a real one in place (same uid): their locked links' group entries get it. */
export const claimGuestLinks = onCall(callable, async (req) => {
  const me = signedIn(req)
  const locked = await db().collection('payLinks').where('forUid', '==', me.uid).get()
  let linked = 0
  for (const l of locked.docs) {
    const groupId = l.get('groupId')
    if (typeof groupId === 'string' && (await claimForGuest(groupId, l.get('from'), me.uid)) === 'linked') linked++
  }
  return { linked }
})
