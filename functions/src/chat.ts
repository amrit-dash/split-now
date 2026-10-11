/*
 * Group chat and open item pushes (src/lib/chat.ts, src/lib/open-items.ts in the app).
 *  - a chat message → everyone else in the group: one notification per chat that the next message
 *    replaces, quietly when the last loud one was under a minute ago (lib/chat-push.ts); not for
 *    people who turned chat pushes off or muted this chat (mutedChats). Someone the message calls
 *    on by name (@mentioned, @everyone, or asked by a Pay me / Settle up: lib/chat-push.ts
 *    calledUids) hears it loud even in a muted chat: "X mentioned you" for words, "asks you to
 *    settle up" for a card. A merge request card (written by merge-members.ts, which pushes the
 *    creator itself) sends nothing.
 *  - an open item that names people as "might have paid" (written down, or someone added later)
 *    → those people, asking them to claim it
 * Both behind their flags (groupChat, openItems), never for a group in Recently deleted, and only
 * to uids in the group's memberUids.
 */
import { logger } from 'firebase-functions/logger'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db } from './admin'
import { REGION } from './config'
import { calledUids, chatLoudness, chatRecipients, newSuspects } from './lib/chat-push'
import { flagOn } from './lib/limits'
import { chatNote, mentionNote, openItemNote } from './lib/notify-text'
import { mutedChats } from './lib/prefs'
import { memberNameForUid, memberUid, type MemberLite } from './lib/recipients'
import { sendToUser } from './push'

interface GroupLite {
  name?: string
  emoji?: string
  currency?: string
  members?: Record<string, MemberLite>
  memberUids?: string[]
  deletedAt?: number
}

const uidsOf = (g: GroupLite) => (Array.isArray(g.memberUids) ? g.memberUids.filter((u): u is string => typeof u === 'string') : [])

export const onChatMessageCreated = onDocumentCreated({ document: 'groups/{groupId}/chat/{messageId}', region: REGION }, async (event) => {
  const m = event.data?.data()
  if (!m || typeof m.authorUid !== 'string') return
  const { groupId } = event.params
  if (!(await flagOn('groupChat'))) return
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  // The author must still be in the group (an offline phone may send after they left).
  if (!uidsOf(g).includes(m.authorUid)) return
  if (m.kind === 'merge') return
  const recipients = chatRecipients(g.memberUids, m.authorUid)
  if (!recipients.length) return
  const called = calledUids(m, (id) => memberUid(g.members, id, uidsOf(g)), recipients)

  const stateRef = db().doc(`chatPush/${groupId}`)
  const now = Date.now()
  const { loud, quiet } = chatLoudness(
    recipients.filter((u) => !called.has(u)),
    (await stateRef.get()).get('last'),
    now,
  )
  let itemTitle: string | undefined
  if (m.kind === 'openItem' && typeof m.ref === 'string') {
    const t = (await db().doc(`groups/${groupId}/openItems/${m.ref}`).get()).get('title')
    if (typeof t === 'string') itemTitle = t
  }
  const note = (silent: boolean, uid: string) =>
    chatNote({
      groupId,
      groupName: g.name ?? 'Group',
      emoji: g.emoji,
      authorName: memberNameForUid(g.members, m.authorUid) ?? (typeof m.authorName === 'string' ? m.authorName : 'Someone'),
      kind: String(m.kind ?? 'text'),
      text: typeof m.text === 'string' ? m.text : '',
      amount: typeof m.amount === 'number' ? m.amount : undefined,
      currency: g.currency ?? 'INR',
      itemTitle,
      called: called.has(uid),
      silent,
    })
  const skip = (raw: unknown) => mutedChats(raw).has(groupId)
  const authorName = memberNameForUid(g.members, m.authorUid) ?? (typeof m.authorName === 'string' ? m.authorName : 'Someone')
  // Words that tag you read "X mentioned you"; a card that asks you says what it asks.
  const calledNote = (uid: string) =>
    m.kind === 'text' || m.kind === undefined
      ? mentionNote({ groupId, groupName: g.name ?? 'Group', emoji: g.emoji, authorName, text: typeof m.text === 'string' ? m.text : '' })
      : note(false, uid)
  const sent = await Promise.all([
    ...[...called].map((uid) => sendToUser(uid, ['chat'], calledNote(uid)).then((n) => ({ uid, n }))),
    ...loud.map((uid) => sendToUser(uid, ['chat'], note(false, uid), { skip }).then((n) => ({ uid, n }))),
    ...quiet.map((uid) => sendToUser(uid, ['chat'], note(true, uid), { skip }).then(() => ({ uid, n: 0 }))),
  ])
  // Remember who was buzzed (only those whose phone took it), so the next minute stays quiet for them.
  const buzzed = Object.fromEntries(sent.filter((s) => s.n > 0).map((s) => [s.uid, now]))
  if (Object.keys(buzzed).length) await stateRef.set({ last: buzzed }, { merge: true })
  logger.info('chat push', { groupId, called: called.size, loud: loud.length, quiet: quiet.length })
})

export const onOpenItemWritten = onDocumentWritten({ document: 'groups/{groupId}/openItems/{itemId}', region: REGION }, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const named = newSuspects(before, after)
  if (!after || !named.length) return
  const { groupId, itemId } = event.params
  if (!(await flagOn('openItems'))) return
  const g = (await db().doc(`groups/${groupId}`).get()).data() as GroupLite | undefined
  if (!g || typeof g.deletedAt === 'number') return
  const createdBy = typeof after.createdBy === 'string' ? after.createdBy : undefined
  // Who wrote it down is known for a new item; an edit doesn't record who made it.
  const byName = !before && createdBy ? memberNameForUid(g.members, createdBy) : undefined
  const uids = [...new Set(named.map((id) => memberUid(g.members, id, uidsOf(g))).filter((u): u is string => !!u && u !== createdBy))]
  await Promise.all(
    uids.map((uid) =>
      sendToUser(
        uid,
        ['openItems'],
        openItemNote({
          groupId,
          itemId,
          groupName: g.name ?? 'Group',
          emoji: g.emoji,
          byName,
          title: String(after.title ?? 'something'),
          date: typeof after.date === 'string' ? after.date : undefined,
          amount: typeof after.amount === 'number' ? after.amount : undefined,
          currency: g.currency ?? 'INR',
        }),
      ),
    ),
  )
})
