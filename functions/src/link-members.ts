/*
 * Someone added to a group by email (or picked from another group) gets the group straight away
 * when that email belongs to an account: the server attaches it, as joining by the invite link
 * would (their uid on the member entry and in memberUids; the rules only let people add
 * themselves, so this can't happen on the adder's phone). Only verified emails count, blocked
 * accounts never, and someone already in the group is left alone. An email with no account yet
 * is remembered (emailInvites/{sha256(email)}, server-only) and linked the first time that person
 * signs in with it (linkMyInvites). Decisions in lib/link.ts.
 */
import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { labelForUid } from '../../shared/names'
import { auth, db, requireAdmin } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import {
  duplicatePlaceholders,
  inviteKey,
  linkCandidates,
  normEmail,
  pendingEmails,
  planLinks,
  MAX_MEMBER_UIDS,
  type FoundAccount,
  type LinkMember,
} from './lib/link'
import { addedToGroupNote } from './lib/notify-text'
import { sendToUser } from './push'

interface GroupDoc {
  name?: string
  emoji?: string
  type?: string
  createdBy?: string
  deletedAt?: number
  inviteCode?: string
  memberUids?: string[]
  members?: Record<string, LinkMember>
}

export const emailId = (email: string) => createHash('sha256').update(email).digest('hex')

/**
 * Accounts for these emails: each account's own email (the Admin SDK looks up 100 at a time),
 * then the extra emails people added to their account with a code (emailIndex, always verified).
 */
async function accountsFor(emails: string[]): Promise<Record<string, FoundAccount>> {
  const out: Record<string, FoundAccount> = {}
  const a = await auth()
  for (let i = 0; i < emails.length; i += 100) {
    const r = await a.getUsers(emails.slice(i, i + 100).map((email) => ({ email })))
    for (const u of r.users) if (u.email) out[normEmail(u.email)] = { uid: u.uid, emailVerified: u.emailVerified, disabled: u.disabled }
  }
  const rest = emails.filter((e) => !out[e]?.emailVerified)
  if (rest.length) {
    const snaps = await db().getAll(...rest.map((e) => db().doc(`emailIndex/${emailId(e)}`)))
    const extra = snaps.flatMap((s, i) => (typeof s.get('uid') === 'string' ? [{ email: rest[i]!, uid: s.get('uid') as string }] : []))
    if (extra.length) {
      const users = await a.getUsers(extra.map((x) => ({ uid: x.uid })))
      const disabled = new Map(users.users.map((u) => [u.uid, u.disabled]))
      for (const x of extra) if (disabled.has(x.uid)) out[x.email] = { uid: x.uid, emailVerified: true, disabled: disabled.get(x.uid) }
    }
  }
  return out
}

async function blockedOf(uids: string[]): Promise<Set<string>> {
  if (!uids.length) return new Set()
  const snaps = await db().getAll(...uids.map((u) => db().doc(`blocked/${u}`)))
  return new Set(snaps.filter((s) => s.exists).map((s) => s.id))
}

/**
 * Attach accounts to placeholders inside a transaction on the fresh group: each placeholder must
 * still be there, still without an account, with the same email, and the account not already in.
 */
async function applyLinks(groupId: string, links: Array<{ memberId: string; uid: string; email: string }>): Promise<Array<{ memberId: string; uid: string }>> {
  const ref = db().doc(`groups/${groupId}`)
  const applied = await db().runTransaction(async (tx) => {
    const g = (await tx.get(ref)).data() as GroupDoc | undefined
    if (!g || typeof g.deletedAt === 'number' || g.type === 'personal') return []
    const uids = new Set(g.memberUids ?? [])
    const ok: Array<{ memberId: string; uid: string }> = []
    for (const l of links) {
      const m = g.members?.[l.memberId]
      if (!m || m.uid || typeof m.removedAt === 'number' || normEmail(m.email) !== l.email || uids.has(l.uid) || uids.size >= MAX_MEMBER_UIDS) continue
      uids.add(l.uid)
      ok.push({ memberId: l.memberId, uid: l.uid })
    }
    if (!ok.length) return []
    const patch: Record<string, unknown> = { memberUids: FieldValue.arrayUnion(...ok.map((l) => l.uid)), updatedAt: Date.now() }
    for (const l of ok) patch[`members.${l.memberId}.uid`] = l.uid
    tx.update(ref, patch)
    // A linked person is no longer an open spot on the invite.
    if (g.inviteCode)
      tx.set(db().doc(`invites/${g.inviteCode}`), { placeholders: Object.fromEntries(ok.map((l) => [l.memberId, FieldValue.delete()])) }, { merge: true })
    return ok
  })
  return applied
}

export const onGroupMembersLink = onDocumentWritten({ document: 'groups/{groupId}', region: REGION }, async (event) => {
  const after = event.data?.after.data() as GroupDoc | undefined
  if (!after || typeof after.deletedAt === 'number' || after.type === 'personal') return
  const before = event.data?.before.data() as GroupDoc | undefined
  const candidates = linkCandidates(after.members, before?.members)
  if (!candidates.length) return
  const { groupId } = event.params
  try {
    const found = await accountsFor([...new Set(candidates.map((c) => c.email))])
    const blocked = await blockedOf(Object.values(found).map((a) => a.uid))
    const plan = planLinks({ candidates, memberUids: after.memberUids ?? [], found, blocked })
    // Someone added again by an email whose account is already in the group: suggest merging the two.
    await Promise.all(
      duplicatePlaceholders(candidates, after.members, found).map((d) =>
        db()
          .doc(`groups/${groupId}/mergeRequests/s_${d.from}__${d.into}`)
          .set({ from: d.from, into: d.into, status: 'suggested', reason: 'same-email', by: 'system', createdAt: Date.now() }, { merge: true }),
      ),
    )
    const applied = await applyLinks(
      groupId,
      plan.map((p) => ({ ...p, email: candidates.find((c) => c.memberId === p.memberId)!.email })),
    )
    // New group: whoever made it added them; later additions don't record who, so the push says less.
    const byName = !before && after.createdBy ? labelForUid(after.members, after.createdBy) : undefined
    await Promise.all(
      applied.map((l) => sendToUser(l.uid, ['expenses'], addedToGroupNote({ groupId, groupName: after.name ?? 'A group', emoji: after.emoji, byName }))),
    )
    const pending = pendingEmails(candidates, found)
    await Promise.all(
      pending.map((p) =>
        db()
          .doc(`emailInvites/${emailId(p.email)}`)
          .set({ entries: { [inviteKey(groupId, p.memberId)]: { groupId, memberId: p.memberId, at: Date.now() } } }, { merge: true }),
      ),
    )
    if (applied.length || pending.length) logger.info('linked members', { groupId, linked: applied.length, pending: pending.length })
  } catch (e) {
    logger.warn('member linking failed', { groupId, error: (e as Error).message })
  }
})

/**
 * Groups that added this email before it was confirmed as this person's (no account yet, or not
 * verified yet) are attached now. Every entry is tried once: linked, or no longer an open spot.
 */
export async function linkInvitesFor(uid: string, email: string): Promise<number> {
  const ref = db().doc(`emailInvites/${emailId(email)}`)
  const doc = await ref.get()
  const entries = Object.values((doc.data()?.entries ?? {}) as Record<string, { groupId?: string; memberId?: string }>)
  if (!entries.length) return 0
  if ((await db().doc(`blocked/${uid}`).get()).exists) return 0
  let linked = 0
  for (const e of entries.slice(0, 50)) {
    if (typeof e.groupId !== 'string' || typeof e.memberId !== 'string') continue
    try {
      linked += (await applyLinks(e.groupId, [{ memberId: e.memberId, uid, email }])).length
    } catch (err) {
      logger.warn('invite link failed', { groupId: e.groupId, error: (err as Error).message })
    }
  }
  await ref.delete()
  return linked
}

/**
 * Called by the app after sign-in: groups that added this person's (verified) email before they
 * had an account are attached now. Answers how many were linked.
 */
export const linkMyInvites = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, maxInstances: 5 }, async (req) => {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  const email = req.auth.token.email_verified ? normEmail(req.auth.token.email) : ''
  if (!email) return { linked: 0 }
  return { linked: await linkInvitesFor(req.auth.uid, email) }
})

/**
 * Admin → Users "Link people to their accounts": the same linking for groups made before it
 * existed. Pages through every group (300 at a time), links what it can, and remembers the rest
 * in emailInvites. Answers how many groups it looked at and how many people it linked.
 */
export const adminLinkMembers = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 540, memory: '512MiB', maxInstances: 1 },
  async (req): Promise<{ groups: number; linked: number; pending: number }> => {
    await requireAdmin(req)
    let groups = 0
    let linked = 0
    let pending = 0
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined
    for (;;) {
      let q = db().collection('groups').orderBy('__name__').limit(300)
      if (last) q = q.startAfter(last)
      const page = await q.get()
      if (page.empty) break
      for (const d of page.docs) {
        groups++
        const g = d.data() as GroupDoc
        if (typeof g.deletedAt === 'number' || g.type === 'personal') continue
        const candidates = linkCandidates(g.members)
        if (!candidates.length) continue
        const found = await accountsFor([...new Set(candidates.map((c) => c.email))])
        const blocked = await blockedOf(Object.values(found).map((a) => a.uid))
        const plan = planLinks({ candidates, memberUids: g.memberUids ?? [], found, blocked })
        const applied = await applyLinks(
          d.id,
          plan.map((p) => ({ ...p, email: candidates.find((c) => c.memberId === p.memberId)!.email })),
        )
        linked += applied.length
        await Promise.all(
          applied.map((l) => sendToUser(l.uid, ['expenses'], addedToGroupNote({ groupId: d.id, groupName: g.name ?? 'A group', emoji: g.emoji }))),
        )
        const waiting = pendingEmails(candidates, found)
        pending += waiting.length
        await Promise.all(
          waiting.map((p) =>
            db()
              .doc(`emailInvites/${emailId(p.email)}`)
              .set({ entries: { [inviteKey(d.id, p.memberId)]: { groupId: d.id, memberId: p.memberId, at: Date.now() } } }, { merge: true }),
          ),
        )
      }
      last = page.docs[page.docs.length - 1]
      if (page.size < 300) break
    }
    logger.info('admin linked members', { groups, linked, pending })
    return { groups, linked, pending }
  },
)
