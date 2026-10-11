/*
 * One account per person (docs/PLAN.md §4.2 "Accounts"):
 *  - sendEmailCode / confirmEmailCode: a 6-digit code by email proves the person reads that
 *    address. 'verify' confirms an email-and-password account's own email (the app waits for it
 *    before anything else); 'add' adds another email to the account (emailIndex), so groups that
 *    add this person by either address reach the same account.
 *  - An address that already has its own account can only be added by merging that account in
 *    (mergeAccount, after the code proved it's theirs): its groups, Pay me links and live tables
 *    move to the account that stays, and the old account is switched off.
 *  - adoptGuest: a guest (live table, Pay me link) who signs in to an account that already exists
 *    hands over the guest's ID token; the guest's links and tables move, the entry their locked
 *    Pay me link points to gets the account, and the guest account is deleted.
 *  - adminMail: the email service the codes go out through (Admin → Email), its key sealed.
 * Decisions are in lib/email-code.ts, lib/mail.ts and lib/move-uid.ts.
 */
import { randomBytes } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { labelForUid } from '../../shared/names'
import { auth, db, requireAdmin } from './admin'
import { AI_KEY_KEK, keks } from './ai'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { checkCode, checkMessage, cleanCode, CODE_TTL_MS, hashCode, newCode, resendWait, SEND_LIMIT, type CodePurpose, type StoredCode } from './lib/email-code'
import { normEmail } from './lib/link'
import { codeEmail, mailRequest, parseMailConfig, MAIL_PROVIDERS, type MailConfig, type MailMessage } from './lib/mail'
import { planGroupMove, planGuestClaim, type MoveGroup } from './lib/move-uid'
import { addedToGroupNote } from './lib/notify-text'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { readStoredKey, storedKeyFields } from './lib/seal'
import { keyHint } from '../../shared/ai-config'
import { emailId, linkInvitesFor } from './link-members'
import { sendToUser } from './push'

const APP_URL = 'https://split-now.web.app'
const callable = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 60, memory: '256MiB' as const, maxInstances: 5 }

const codeRef = (uid: string) => db().doc(`emailCodes/${uid}`)
const indexRef = (email: string) => db().doc(`emailIndex/${emailId(email)}`)
const emailsRef = (uid: string) => db().doc(`users/${uid}/account/emails`)
const mailRef = () => db().doc('private/mail')

function signedIn(req: CallableRequest): { uid: string; email: string; verified: boolean } {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return { uid: req.auth.uid, email: normEmail(req.auth.token.email), verified: req.auth.token.email_verified === true }
}

const purposeOf = (p: unknown): CodePurpose => {
  if (p === 'verify' || p === 'add') return p
  throw new HttpsError('invalid-argument', 'Unknown request')
}

// ---- Sending mail -------------------------------------------------------------------------

let mailCache: { at: number; cfg?: MailConfig; key?: string } | null = null
async function mailSetup(): Promise<{ cfg?: MailConfig; key?: string }> {
  if (mailCache && Date.now() - mailCache.at < 60_000) return mailCache
  const d = (await mailRef().get()).data()
  const { key } = readStoredKey(d, keks())
  mailCache = { at: Date.now(), cfg: parseMailConfig(d), key }
  return mailCache
}

async function sendMail(cfg: MailConfig, key: string, m: MailMessage): Promise<void> {
  const r = mailRequest(cfg, key, m)
  const res = await fetch(r.url, { method: 'POST', headers: r.headers, body: r.body, signal: AbortSignal.timeout(10_000) }).catch((e: Error) => {
    throw new HttpsError('unavailable', `The email service didn’t answer (${e.message}). Try again in a minute`)
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    logger.warn('mail send failed', { provider: cfg.provider, status: res.status, detail })
    throw new HttpsError('unavailable', 'The code email couldn’t be sent. Try again in a minute')
  }
}

// ---- Who owns an address --------------------------------------------------------------------

/** The account an address belongs to, as its own email or an added one; undefined when none. */
async function ownerOf(email: string): Promise<string | undefined> {
  const a = await auth()
  const u = await a.getUserByEmail(email).catch(() => undefined)
  if (u) return u.uid
  const idx = await indexRef(email).get()
  return typeof idx.get('uid') === 'string' ? (idx.get('uid') as string) : undefined
}

// ---- Codes ----------------------------------------------------------------------------------

/**
 * Send a code to `email`. 'verify': the caller's own, not yet verified, email. 'add': an address
 * that isn't already on the caller's account. Answers { sent: true, wait } or, for 'verify' when no
 * email service is set up, { sent: false } (the app then uses Firebase's verification link).
 */
export const sendEmailCode = onCall({ ...callable, secrets: [AI_KEY_KEK] }, async (req) => {
  const me = signedIn(req)
  const purpose = purposeOf(req.data?.purpose)
  const email = normEmail(req.data?.email)
  if (!email) throw new HttpsError('invalid-argument', 'Enter a valid email address')
  if (purpose === 'verify') {
    if (email !== me.email) throw new HttpsError('invalid-argument', 'That isn’t this account’s email')
    if (me.verified) return { sent: false, already: true }
  } else {
    if (!me.verified) throw new HttpsError('failed-precondition', 'Confirm your own email first')
    if (email === me.email) throw new HttpsError('already-exists', 'That’s already your email')
    const mine = (await emailsRef(me.uid).get()).get(`list.${emailId(email)}`)
    if (mine) throw new HttpsError('already-exists', 'That email is already on your account')
  }
  const { cfg, key } = await mailSetup()
  if (!cfg || !key) {
    if (purpose === 'verify') return { sent: false }
    throw new HttpsError('failed-precondition', 'Adding another email isn’t switched on yet')
  }
  const now = Date.now()
  const prev = (await codeRef(me.uid).get()).data() as (StoredCode & { rate?: Partial<RateState> }) | undefined
  const wait = resendWait(prev, now)
  if (wait > 0) throw new HttpsError('resource-exhausted', `Wait ${Math.ceil(wait / 1000)} seconds before sending another code`)
  const rate = applyRateLimit(prev?.rate, now, SEND_LIMIT)
  if (!rate.allowed) throw new HttpsError('resource-exhausted', 'Too many codes sent. Try again later')
  const code = newCode()
  const salt = randomBytes(8).toString('hex')
  const name = (await db().doc(`users/${me.uid}`).get()).get('displayName')
  await sendMail(cfg, key, { to: email, ...codeEmail({ code, purpose, email, name: typeof name === 'string' ? name : undefined, appUrl: APP_URL }) })
  const stored: StoredCode & { rate: RateState } = {
    email,
    purpose,
    hash: hashCode(code, salt),
    salt,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sentAt: now,
    rate: rate.next,
  }
  await codeRef(me.uid).set(stored)
  return { sent: true }
})

/** Check a code; a wrong one counts as a try. Throws with the reason in plain words. */
async function useCode(uid: string, email: string, purpose: CodePurpose, input: unknown): Promise<void> {
  const code = cleanCode(input)
  if (!code) throw new HttpsError('invalid-argument', 'Enter the 6-digit code from the email')
  const ref = codeRef(uid)
  const r = await db().runTransaction(async (tx) => {
    const stored = (await tx.get(ref)).data() as StoredCode | undefined
    const result = checkCode(stored, email, purpose, code, Date.now())
    if (result === 'wrong') tx.update(ref, { attempts: FieldValue.increment(1) })
    // Used once: a confirmed code can't confirm anything again.
    if (result === 'ok') tx.update(ref, { hash: FieldValue.delete(), expiresAt: 0 })
    return result
  })
  if (r !== 'ok') throw new HttpsError('invalid-argument', checkMessage(r))
}

/**
 * Confirm a code. 'verify' marks the account's email verified and links the groups waiting for it.
 * 'add' adds the address, unless it has its own account: then it answers { otherAccount } with that
 * account's name and group count, and mergeAccount (within 10 minutes) completes it.
 */
export const confirmEmailCode = onCall(callable, async (req) => {
  const me = signedIn(req)
  const purpose = purposeOf(req.data?.purpose)
  const email = normEmail(req.data?.email)
  if (!email) throw new HttpsError('invalid-argument', 'Enter a valid email address')
  await useCode(me.uid, email, purpose, req.data?.code)
  if (purpose === 'verify') {
    if (email !== me.email) throw new HttpsError('invalid-argument', 'That isn’t this account’s email')
    await (await auth()).updateUser(me.uid, { emailVerified: true })
    const linked = await linkInvitesFor(me.uid, email)
    return { verified: true, linked }
  }
  const owner = await ownerOf(email)
  if (owner && owner !== me.uid) {
    const other = await (await auth()).getUser(owner).catch(() => undefined)
    const groups = (await db().collection('groups').where('memberUids', 'array-contains', owner).count().get()).data().count
    await codeRef(me.uid).set({ merge: { email, uid: owner, until: Date.now() + CODE_TTL_MS } }, { merge: true })
    return { otherAccount: { name: other?.displayName ?? '', email, groups } }
  }
  const linked = await addEmail(me.uid, email)
  return { added: true, linked }
})

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
  const pending = (await codeRef(me.uid).get()).get('merge') as { email?: string; uid?: string; until?: number } | undefined
  if (!pending?.uid || !pending.email || (pending.until ?? 0) < Date.now())
    throw new HttpsError('failed-precondition', 'Confirm the email with a new code first')
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
  await codeRef(me.uid).set({ merge: FieldValue.delete() }, { merge: true })
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

// ---- Admin: the email service -----------------------------------------------------------------

/**
 * Admin → Email. { action: 'get' } → the settings without the key; 'save' { provider, fromEmail,
 * fromName, apiKey? } (the key is kept when omitted); 'test' sends a code email to the admin;
 * 'remove' switches codes off (email sign-ups fall back to Firebase's verification link).
 */
export const adminMail = onCall({ ...callable, secrets: [AI_KEY_KEK] }, async (req) => {
  const uid = await requireAdmin(req)
  const action = req.data?.action
  const d = (await mailRef().get()).data()
  if (action === 'get') {
    const cfg = parseMailConfig(d)
    return {
      provider: cfg?.provider ?? d?.provider ?? null,
      fromEmail: d?.fromEmail ?? '',
      fromName: d?.fromName ?? 'Split Now',
      hint: d?.hint ?? null,
      ready: !!cfg && !!readStoredKey(d, keks()).key,
    }
  }
  if (action === 'remove') {
    await mailRef().delete()
    mailCache = null
    return { ready: false }
  }
  if (action === 'save') {
    const cfg = parseMailConfig({ provider: req.data?.provider, fromEmail: req.data?.fromEmail, fromName: req.data?.fromName })
    if (!cfg) throw new HttpsError('invalid-argument', `Pick ${MAIL_PROVIDERS.join(' or ')} and enter the sender address`)
    const apiKey = typeof req.data?.apiKey === 'string' ? req.data.apiKey.trim() : ''
    if (apiKey && (apiKey.length < 10 || apiKey.length > 300)) throw new HttpsError('invalid-argument', 'That doesn’t look like an API key')
    const keyFields = apiKey ? { ...storedKeyFields(apiKey, keks()), hint: keyHint(apiKey) } : {}
    if (!apiKey && !readStoredKey(d, keks()).key) throw new HttpsError('invalid-argument', 'Paste the API key')
    await mailRef().set({ ...cfg, ...keyFields, by: uid, updatedAt: Date.now() }, { merge: true })
    mailCache = null
    return { ready: true }
  }
  if (action === 'test') {
    mailCache = null
    const { cfg, key } = await mailSetup()
    if (!cfg || !key) throw new HttpsError('failed-precondition', 'Save the settings first')
    const to = normEmail(req.auth?.token.email)
    if (!to) throw new HttpsError('failed-precondition', 'Your account has no email to send the test to')
    await sendMail(cfg, key, { to, ...codeEmail({ code: newCode(), purpose: 'verify', email: to, appUrl: APP_URL }) })
    return { sentTo: to }
  }
  throw new HttpsError('invalid-argument', 'Unknown action')
})
