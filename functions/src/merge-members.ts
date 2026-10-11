/*
 * Two entries of one group that are one person become one (shared/merge-members.ts):
 *  - mergeMembers { groupId, from, into }: any member asks. It waits as a request when it needs
 *    someone's OK (mergeApprover): the person merged into, if they have an account (money moves
 *    onto them), else the creator when they turned on "Merging people needs my OK". The request is
 *    a card in the group chat that @mentions them, a push and an item in their Inbox → To sort.
 *  - decideMerge { groupId, requestId, approve }: the person asked decides a request; any member
 *    may act on a suggestion the server made (an account merged in, someone added twice).
 * The merge itself: the `from` entry is marked removed and merged (so nobody picks it again),
 * then every expense, payment, open item and Pay me link of the group that names it is
 * rewritten to the person who stays; a payment between the two is removed. Each document is
 * rewritten from what it holds, so running it again after an interruption finishes the job.
 */
import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { labelOf } from '../../shared/names'
import {
  mergeApprover,
  mergedEntries,
  mergeDirection,
  mergeExpense,
  mergeOpenItem,
  mergePayLink,
  mergeProblem,
  mergeSettlement,
  type MergeMember,
} from '../../shared/merge-members'
import { db } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { normEmail } from './lib/link'
import { mergeAskNote, mergeDecidedNote } from './lib/notify-text'
import { sendToUser } from './push'

interface GroupDoc {
  name?: string
  emoji?: string
  createdBy?: string
  deletedAt?: number
  inviteCode?: string
  mergeNeedsOk?: boolean
  memberUids?: string[]
  members?: Record<string, MergeMember & { color?: string }>
}

const callable = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 300, memory: '512MiB' as const, maxInstances: 5 }
const groupRef = (gid: string) => db().doc(`groups/${gid}`)
const requests = (gid: string) => db().collection(`groups/${gid}/mergeRequests`)

function asker(req: { auth?: { uid: string; token: { firebase?: { sign_in_provider?: string } } } }): string {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

async function liveGroup(gid: string, uid: string): Promise<GroupDoc> {
  const g = (await groupRef(gid).get()).data() as GroupDoc | undefined
  if (!g || !(g.memberUids ?? []).includes(uid)) throw new HttpsError('permission-denied', 'You’re not in this group')
  if (typeof g.deletedAt === 'number') throw new HttpsError('failed-precondition', 'This group is in Recently deleted')
  return g
}

const nameOf = (g: GroupDoc, id: string) => labelOf(g.members ?? {}, id, g.members?.[id]?.name ?? 'Someone')
const memberIdOf = (g: GroupDoc, uid: string) => Object.entries(g.members ?? {}).find(([, m]) => m.uid === uid && typeof m.removedAt !== 'number')?.[0]

/** Rewrites every document of the group that names `from`. Answers what it changed. */
async function rewrite(gid: string, from: string, into: string): Promise<{ expenses: number; payments: number }> {
  let expenses = 0
  let payments = 0
  let batch = db().batch()
  let ops = 0
  const flush = async (force = false) => {
    if (ops && (force || ops >= 400)) {
      await batch.commit()
      batch = db().batch()
      ops = 0
    }
  }
  for (const d of (await groupRef(gid).collection('expenses').get()).docs) {
    const patch = mergeExpense(d.data(), from, into)
    if (!patch) continue
    batch.update(d.ref, { ...patch, updatedAt: Date.now() })
    ops++
    expenses++
    await flush()
  }
  for (const d of (await groupRef(gid).collection('settlements').get()).docs) {
    const r = mergeSettlement(d.data(), from, into)
    if (!r) continue
    if (r === 'delete') batch.delete(d.ref)
    else batch.update(d.ref, r)
    ops++
    payments++
    await flush()
  }
  for (const d of (await groupRef(gid).collection('openItems').get()).docs) {
    const patch = mergeOpenItem(d.data(), from, into)
    if (!patch) continue
    batch.update(d.ref, patch)
    ops++
    await flush()
  }
  for (const d of (await db().collection('payLinks').where('groupId', '==', gid).get()).docs) {
    const patch = mergePayLink(d.data(), from, into)
    if (!patch) continue
    batch.update(d.ref, patch)
    ops++
    await flush()
  }
  await flush(true)
  return { expenses, payments }
}

/** Merge now: the entry first (so nobody picks it again), then everything that names it. */
async function merge(gid: string, from: string, into: string, byUid: string): Promise<{ expenses: number; payments: number }> {
  const now = Date.now()
  const names = await db().runTransaction(async (tx) => {
    const g = (await tx.get(groupRef(gid))).data() as GroupDoc | undefined
    if (!g) throw new HttpsError('not-found', 'Group not found')
    const problem = mergeProblem(g.members, from, into)
    if (problem) throw new HttpsError('failed-precondition', problem)
    const e = mergedEntries(g.members!, from, into, now)
    const patch: Record<string, unknown> = { updatedAt: now }
    for (const [k, v] of Object.entries(e.into)) patch[`members.${into}.${k}`] = v
    for (const [k, v] of Object.entries(e.from)) patch[`members.${from}.${k}`] = v
    tx.update(groupRef(gid), patch)
    if (g.inviteCode) tx.set(db().doc(`invites/${g.inviteCode}`), { placeholders: { [from]: FieldValue.delete() } }, { merge: true })
    return {
      from: nameOf(g, from),
      into: nameOf(g, into),
      by: memberIdOf(g, byUid) ? nameOf(g, memberIdOf(g, byUid)!) : 'Someone',
      email: normEmail(g.members![from]!.email),
    }
  })
  const moved = await rewrite(gid, from, into)
  // A placeholder waiting for its email's account points at the person who stays now.
  if (names.email) {
    const ref = db().doc(`emailInvites/${createHash('sha256').update(names.email).digest('hex')}`)
    await ref.set({ entries: { [`${gid}__${from}`]: FieldValue.delete() } }, { merge: true }).catch(() => undefined)
  }
  await groupRef(gid)
    .collection('activity')
    .add({
      type: 'member.merged',
      actorUid: byUid,
      actorName: names.by,
      targetId: into,
      summary: `${names.by} merged ${names.from} into ${names.into}`,
      after: { from, into, expenses: moved.expenses, payments: moved.payments },
      createdAt: now,
    })
  // Any open suggestion or request for the same two is settled by this.
  const open = await requests(gid).where('status', 'in', ['suggested', 'pending']).get()
  await Promise.all(
    open.docs.filter((d) => [d.get('from'), d.get('into')].includes(from)).map((d) => d.ref.update({ status: 'done', decidedBy: byUid, decidedAt: now })),
  )
  logger.info('merged members', { gid, from, into, ...moved })
  return moved
}

/** Ask whoever must OK it (mergeApprover): a pending request, a chat card that @mentions them, and a push. */
async function askApprover(gid: string, g: GroupDoc, from: string, into: string, uid: string, approver: string) {
  const ref = requests(gid).doc(`r_${from}__${into}`)
  const now = Date.now()
  await ref.set({ from, into, status: 'pending', by: uid, approverUid: approver, createdAt: now })
  const me = memberIdOf(g, uid)
  const asked = memberIdOf(g, approver)
  const byName = me ? nameOf(g, me) : 'Someone'
  await groupRef(gid)
    .collection('chat')
    .add({
      authorUid: uid,
      authorName: byName,
      text: asked ? `@${nameOf(g, asked)} can you OK this?` : '',
      kind: 'merge',
      ref: ref.id,
      ...(asked ? { mentions: [asked] } : {}),
      createdAt: now,
    })
  await sendToUser(
    approver,
    ['chat'],
    mergeAskNote({ groupId: gid, groupName: g.name ?? 'Group', emoji: g.emoji, byName, fromName: nameOf(g, from), intoName: nameOf(g, into) }),
  )
}

export const mergeMembers = onCall(callable, async (req) => {
  const uid = asker(req)
  const gid = typeof req.data?.groupId === 'string' ? req.data.groupId : ''
  const g = await liveGroup(gid, uid)
  const problem = mergeProblem(g.members, req.data?.from, req.data?.into)
  if (problem) throw new HttpsError('failed-precondition', problem)
  const { from, into } = mergeDirection(g.members!, req.data.from, req.data.into)
  const approver = mergeApprover(g, into, uid)
  if (approver) {
    await askApprover(gid, g, from, into, uid, approver)
    return { status: 'pending' }
  }
  return { status: 'done', ...(await merge(gid, from, into, uid)) }
})

export const decideMerge = onCall(callable, async (req) => {
  const uid = asker(req)
  const gid = typeof req.data?.groupId === 'string' ? req.data.groupId : ''
  const id = typeof req.data?.requestId === 'string' ? req.data.requestId : ''
  const g = await liveGroup(gid, uid)
  const r = (await requests(gid).doc(id).get()).data() as { from?: string; into?: string; status?: string; by?: string; approverUid?: string } | undefined
  if (!r?.from || !r.into || !['suggested', 'pending'].includes(r.status ?? '')) throw new HttpsError('failed-precondition', 'This was already decided')
  if (r.status === 'pending' && r.approverUid !== uid) throw new HttpsError('permission-denied', 'Only the person asked can decide this')
  const now = Date.now()
  if (!req.data?.approve) {
    await requests(gid).doc(id).update({ status: 'declined', decidedBy: uid, decidedAt: now })
    if (r.status === 'pending' && r.by && r.by !== uid)
      await sendToUser(
        r.by,
        ['chat'],
        mergeDecidedNote({ groupId: gid, groupName: g.name ?? 'Group', emoji: g.emoji, ok: false, fromName: nameOf(g, r.from), intoName: nameOf(g, r.into) }),
      )
    return { status: 'declined' }
  }
  // A suggestion taken up by someone whose merge needs another person's OK goes to that person.
  const approver = r.status === 'suggested' ? mergeApprover(g, r.into, uid) : null
  if (approver) {
    const problem = mergeProblem(g.members, r.from, r.into)
    if (problem) throw new HttpsError('failed-precondition', problem)
    await requests(gid).doc(id).update({ status: 'declined', decidedBy: uid, decidedAt: now })
    await askApprover(gid, g, r.from, r.into, uid, approver)
    return { status: 'pending' }
  }
  const moved = await merge(gid, r.from, r.into, uid)
  if (r.status === 'pending' && r.by && r.by !== uid)
    await sendToUser(
      r.by,
      ['chat'],
      mergeDecidedNote({ groupId: gid, groupName: g.name ?? 'Group', emoji: g.emoji, ok: true, fromName: nameOf(g, r.from), intoName: nameOf(g, r.into) }),
    )
  return { status: 'done', ...moved }
})
