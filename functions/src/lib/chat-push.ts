/*
 * Who hears about a group chat message or an open item, and how loudly. Pure: the triggers
 * (functions/src/chat.ts) read the documents and send.
 */

/** A chat that keeps buzzing is worse than a missed buzz: within this, the next message only updates the notification quietly. */
export const CHAT_QUIET_MS = 60_000

/** Everyone in the group with an account except the author. Only uids in memberUids (never a typed-in members[*].uid). */
export function chatRecipients(memberUids: unknown, authorUid: string | undefined): string[] {
  const uids = Array.isArray(memberUids) ? memberUids.filter((u): u is string => typeof u === 'string' && u.length > 0) : []
  return [...new Set(uids)].filter((u) => u !== authorUid)
}

/**
 * Per recipient: loud (sound, buzz) unless they got a loud one from this chat within CHAT_QUIET_MS,
 * in which case the notification is replaced quietly. `last` is chatPush/{gid}.last.
 */
export function chatLoudness(uids: string[], last: unknown, now: number): { loud: string[]; quiet: string[] } {
  const seen = (last && typeof last === 'object' ? last : {}) as Record<string, unknown>
  const loud: string[] = []
  const quiet: string[] = []
  for (const u of uids) {
    const at = seen[u]
    if (typeof at === 'number' && now - at >= 0 && now - at < CHAT_QUIET_MS) quiet.push(u)
    else loud.push(u)
  }
  return { loud, quiet }
}

/**
 * Who a message calls on by name: the members it tags (@everyone tags all), and the people a Pay
 * me or Settle up asks. As uids in the group (memberUids only), never the author. They hear about
 * it even when they muted the chat (a mute silences talk, not "you were asked").
 */
export function calledUids(
  m: { mentions?: unknown; to?: unknown; kind?: unknown },
  memberUidOf: (memberId: string) => string | undefined,
  recipients: string[],
): Set<string> {
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  const tagged = ids(m.mentions)
  if (tagged.includes('all')) return new Set(recipients)
  const asked = m.kind === 'pay' || m.kind === 'settle' ? ids(m.to) : []
  const out = new Set<string>()
  for (const id of [...tagged, ...asked]) {
    const uid = memberUidOf(id)
    if (uid && recipients.includes(uid)) out.add(uid)
  }
  return out
}

/**
 * Members newly named as "might have paid" on an open item (created, or added by an edit), as
 * their member ids. Not the person who wrote it down, nobody once it is claimed or deleted.
 */
export function newSuspects(
  before: { suspects?: unknown } | undefined,
  after: { suspects?: unknown; status?: unknown; deletedAt?: unknown } | undefined,
): string[] {
  if (after?.status !== 'open' || typeof after.deletedAt === 'number') return []
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  const had = new Set(list(before?.suspects))
  return [...new Set(list(after.suspects))].filter((id) => !had.has(id))
}
