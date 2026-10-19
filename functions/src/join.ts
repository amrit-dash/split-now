/*
 * Callable `joinApproval`: asking to join an ordinary group whose creator turned on "New people
 * need my OK" (group.approveJoins). The rules refuse joining such a group from its invite
 * (firestore.rules isJoining), old links included; people ask here and its creator decides. The
 * same steps as a private group's (functions/src/vault.ts joinStatus / requestJoin / decideJoin,
 * sharing lib/join-core.ts), without what a private group needs: nothing is sealed and no passkey
 * is asked for. Private groups never come here (their creator decides with a passkey, in vault.ts).
 *
 *  - status { code }                                  → where this person stands: 'open' (the group lets
 *                                                        people join from the invite now), 'member',
 *                                                        'pending', 'declined' (with retryAt) or 'none'
 *  - ask    { code }                                  → asks to join (groups/{gid}/joinRequests/{uid}, their
 *                                                        account name as it is); its creator gets a push.
 *                                                        One request at a time; a day after a decline
 *  - decide { groupId, uid, approve, memberId? }      → its creator lets them in (as someone new, or into one
 *                                                        of its placeholders) or declines; the asker gets a push
 *
 * The `joinApproval` flag gates asking (and the setting, in the app); deciding is never switched
 * off, so requests already made can be answered. Turning the setting off leaves waiting requests as
 * they are (docs/PLAN.md §4.2): the people who made them can join from the invite again, and the
 * Inbox lists them only while it is on.
 */
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin'
import { sendToUser } from './push'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { flagOn } from './lib/limits'
import { accountName, admission, joinGate, memberIdOf, type JoinRequestDoc } from './lib/join-core'
import { joinAskedNote, joinDecidedNote } from './lib/notify-text'

function caller(req: CallableRequest): string {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

const requestRef = (gid: string, uid: string) => db().doc(`groups/${gid}/joinRequests/${uid}`)
const isIn = (g: FirebaseFirestore.DocumentData, uid: string) => Array.isArray(g.memberUids) && g.memberUids.includes(uid)

/** A live ordinary group from its invite code. */
async function byCode(code: unknown) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(code)) throw new HttpsError('invalid-argument', 'That invite link isn’t right.')
  const c = code.toUpperCase()
  const gid = (await db().doc(`invites/${c}`).get()).get('groupId')
  const snap = typeof gid === 'string' ? await db().doc(`groups/${gid}`).get() : null
  const g = snap?.data()
  if (!snap || !g || g.inviteCode !== c || typeof g.deletedAt === 'number') throw new HttpsError('not-found', 'This invite link no longer works.')
  if (g.vault === true) throw new HttpsError('failed-precondition', 'This is a private group. Open its invite again to ask to join.')
  return { gid: snap.id, g }
}

async function status(uid: string, code: unknown) {
  const { gid, g } = await byCode(code)
  if (isIn(g, uid)) return { status: 'member' as const, groupId: gid }
  if (g.approveJoins !== true) return { status: 'open' as const }
  const gate = joinGate((await requestRef(gid, uid).get()).data() as JoinRequestDoc | undefined, Date.now())
  if (gate.kind === 'pending') return { status: 'pending' as const }
  if (gate.kind === 'cooldown') return { status: 'declined' as const, retryAt: gate.retryAt }
  return { status: 'none' as const }
}

async function ask(uid: string, req: CallableRequest, code: unknown) {
  if (!(await flagOn('joinApproval'))) throw new HttpsError('failed-precondition', 'Asking to join is switched off right now. Try again later.')
  const { gid, g } = await byCode(code)
  if (isIn(g, uid)) return { status: 'member' as const, groupId: gid }
  if (g.approveJoins !== true) return { status: 'open' as const }
  const ref = requestRef(gid, uid)
  const gate = joinGate((await ref.get()).data() as JoinRequestDoc | undefined, Date.now())
  if (gate.kind === 'pending') return { status: 'pending' as const }
  if (gate.kind === 'cooldown')
    throw new HttpsError('resource-exhausted', 'Your last request was declined. You can ask again tomorrow.', { retryAt: gate.retryAt })
  const profile = (await db().doc(`users/${uid}`).get()).data()
  const name = accountName(profile?.displayName, req.auth?.token.name)
  const doc: JoinRequestDoc = { uid, name, status: 'pending', createdAt: Date.now() }
  await ref.set(doc)
  logger.info('join asked', { groupId: gid, uid })
  await sendToUser(String(g.createdBy), ['expenses'], joinAskedNote({ groupId: gid, groupName: String(g.name ?? ''), emoji: g.emoji, name, uid })).catch((e) =>
    logger.warn('join push', { error: (e as Error).message }),
  )
  return { status: 'pending' as const }
}

async function decide(uid: string, data: Record<string, unknown>) {
  const gid = typeof data.groupId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.groupId) ? data.groupId : ''
  if (!gid) throw new HttpsError('invalid-argument', 'Which group?')
  const who = typeof data.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.uid) ? data.uid : ''
  if (!who) throw new HttpsError('invalid-argument', 'Whose request?')
  const approve = data.approve === true
  const placeholder = typeof data.memberId === 'string' ? data.memberId : undefined
  const now = Date.now()
  const gRef = db().doc(`groups/${gid}`)
  const out = await db().runTransaction(async (tx) => {
    const [gs, rs] = await Promise.all([tx.get(gRef), tx.get(requestRef(gid, who))])
    const g = gs.data()
    if (!g || !isIn(g, uid)) throw new HttpsError('permission-denied', 'You’re not in this group.')
    if (g.createdBy !== uid) throw new HttpsError('permission-denied', 'Only the person who made this group can decide who joins.')
    if (g.vault === true) throw new HttpsError('failed-precondition', 'This is a private group. Decide in the Inbox, with your passkey.')
    if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted.')
    const r = rs.data() as JoinRequestDoc | undefined
    if (r?.status !== 'pending') return { gone: true as const }
    if (!approve) {
      tx.update(rs.ref, { status: 'declined', decidedAt: now, decidedBy: uid })
      return { declined: true as const, g }
    }
    const members = (g.members ?? {}) as Record<string, Record<string, unknown>>
    // In already (they joined from the invite while the setting was off): nothing to add.
    const already = isIn(g, who) ? memberIdOf(members, who) : undefined
    if (already) {
      tx.update(rs.ref, { status: 'approved', decidedAt: now, decidedBy: uid, memberId: already })
      return { already: true as const }
    }
    const a = admission(members, who, r.name, placeholder, Math.random().toString(36).slice(2, 6))
    if ('taken' in a) throw new HttpsError('failed-precondition', 'That person in the group is taken now. Pick another, or add them as new.')
    tx.update(gRef, { [`members.${a.memberId}`]: a.entry, memberUids: FieldValue.arrayUnion(who), updatedAt: now })
    tx.update(rs.ref, { status: 'approved', decidedAt: now, decidedBy: uid, memberId: a.memberId })
    // The placeholder is theirs now: the invite stops offering it.
    if (placeholder && typeof g.inviteCode === 'string')
      tx.set(db().doc(`invites/${g.inviteCode}`), { groupId: gid, placeholders: { [placeholder]: FieldValue.delete() } }, { merge: true })
    return { approved: a.memberId, g }
  })
  if ('gone' in out) throw new HttpsError('not-found', 'That request isn’t waiting any more.')
  if ('already' in out) return { ok: true as const }
  logger.info(approve ? 'join approved' : 'join declined', { groupId: gid, uid, who })
  await sendToUser(who, ['expenses'], joinDecidedNote({ groupId: gid, groupName: String(out.g.name ?? ''), emoji: out.g.emoji, ok: approve })).catch((e) =>
    logger.warn('join push', { error: (e as Error).message }),
  )
  return { ok: true as const }
}

export const joinApproval = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 10 }, async (req) => {
  const uid = caller(req)
  const data = (req.data ?? {}) as Record<string, unknown>
  switch (data.op) {
    case 'status':
      return status(uid, data.code)
    case 'ask':
      return ask(uid, req, data.code)
    case 'decide':
      return decide(uid, data)
    default:
      throw new HttpsError('invalid-argument', 'Unknown step')
  }
})
