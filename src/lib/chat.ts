import { groupLabels, memberIdOfUid } from './shortNames'
import { activeMembers } from './members'
import type { ActivityEntry, ActivityType, Cents, ChatMessage, ChatReplyRef, Debt, Group, MemberId } from '@/types'
import { localISODate } from './id'
import { formatDate, formatTime } from './locale'

/*
 * Group chat: a money-only chat per group ("who paid for lunch on the 2nd?"). Messages are
 * plain words or cards (an open item anyone can claim, a Pay me request, an ask to settle up,
 * the balances, an expense). Messages can tag people, answer another message (a reply), and be
 * edited or deleted by their author. Everyone in the group reads the whole history, including
 * people who joined later. The tools and the message box's smarts are src/lib/chat-tools.ts.
 *
 * This file is every decision the chat screen makes: day headers, which bubbles run together,
 * where the "unread" line goes, the activity pills between messages, links in text, and the
 * unread dot (the last-read time is kept on this device: no "seen by", no extra writes).
 */

export const CHAT_MAX = 1000
/** Messages from one person closer together than this share one bubble run (one name, one tail). */
export const RUN_GAP_MS = 5 * 60_000

/** "Today", "Yesterday", "Monday" (within the week), "2 Oct", "2 Oct 2025". */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(day, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return formatDate(day, { weekday: 'long' })
  return formatDate(day, day.slice(0, 4) === today.slice(0, 4) ? 'day' : 'dayYear')
}

/** Whole days from `a` to `b` (local ISO days), DST-proof. */
function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/** Activity that shows as a quiet pill between messages: what changed the money, not edits of notes. */
const PILL_TYPES = new Set<ActivityType>([
  'expense.created',
  'expense.deleted',
  'expense.restored',
  'expense.imported',
  'settlement.created',
  'settlement.deleted',
  'settlement.restored',
  'settlement.approved',
  'settlement.flagged',
  'member.added',
  'member.removed',
])

export type ChatRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'updates'; key: string; entries: ActivityEntry[] }
  | {
      type: 'message'
      key: string
      message: ChatMessage
      mine: boolean
      /** starts a run: show the name (others' messages) and leave a gap above */
      first: boolean
      /** ends a run: show the avatar (others') and the bubble's tail */
      last: boolean
      /** the time (and the tick) under it: the end of a run, or the next one in the run is a later minute */
      showTime: boolean
    }

export interface RowOpts {
  /** the viewer's uid */
  me: string
  today: string
  /** the viewer's last-read time on this device; messages after it by others get the "unread" line */
  readAt?: number
  /** the group's activity (any order); only entries inside the loaded span of messages are used */
  activity?: ActivityEntry[]
  /** createdAt of the oldest message there is still to load (undefined: the start of the chat is loaded) */
  olderThan?: number
}

/**
 * The chat as rows, oldest first: a day header whenever the day changes, the unread line before
 * the first unread message, runs of bubbles, and consecutive activity collapsed into one pill.
 * An expense added from the chat already has its card, so its "added" entry isn't repeated.
 */
export function chatRows(messages: ChatMessage[], o: RowOpts): ChatRow[] {
  const carded = new Set(messages.filter((m) => m.kind === 'expense' && m.ref).map((m) => m.ref as string))
  // Activity older than the oldest loaded message would land at the top out of place: only once the start is loaded.
  const from = o.olderThan === undefined ? Number.NEGATIVE_INFINITY : (messages[0]?.createdAt ?? Number.POSITIVE_INFINITY)
  const pills = (o.activity ?? [])
    .filter((a) => PILL_TYPES.has(a.type) && a.createdAt >= from && !(a.type === 'expense.created' && carded.has(a.targetId)))
    .sort((a, b) => a.createdAt - b.createdAt)
  type Item = { at: number; m?: ChatMessage; a?: ActivityEntry }
  const items: Item[] = [...messages.map((m) => ({ at: m.createdAt, m })), ...pills.map((a) => ({ at: a.createdAt, a }))].sort((x, y) => x.at - y.at)

  const rows: ChatRow[] = []
  let day = ''
  let unreadDone = o.readAt === undefined
  let prev: ChatMessage | undefined
  let updates: Extract<ChatRow, { type: 'updates' }> | undefined
  for (const it of items) {
    const d = localISODate(it.at)
    if (d !== day) {
      day = d
      rows.push({ type: 'day', key: `day-${d}`, label: dayLabel(d, o.today) })
      prev = undefined
      updates = undefined
    }
    if (it.a) {
      if (updates) updates.entries.push(it.a)
      else {
        updates = { type: 'updates', key: `upd-${it.a.id}`, entries: [it.a] }
        rows.push(updates)
      }
      prev = undefined
      continue
    }
    const m = it.m as ChatMessage
    updates = undefined
    const mine = m.authorUid === o.me
    if (!unreadDone && !mine && m.createdAt > (o.readAt ?? 0)) {
      rows.push({ type: 'unread', key: 'unread' })
      unreadDone = true
      prev = undefined
    }
    const joins = !!prev && prev.authorUid === m.authorUid && m.createdAt - prev.createdAt < RUN_GAP_MS
    if (joins) {
      const last = rows[rows.length - 1]
      if (last.type === 'message') {
        last.last = false
        last.showTime = minuteOf(last.message.createdAt) !== minuteOf(m.createdAt)
      }
    }
    rows.push({ type: 'message', key: m.id, message: m, mine, first: !joins, last: true, showTime: true })
    prev = m
  }
  return rows
}

const minuteOf = (t: number) => Math.floor(t / 60_000)

/** Nothing said yet and nothing happened: the screen shows what the chat is for. */
export const chatIsEmpty = (rows: ChatRow[]) => !rows.some((r) => r.type === 'message' || r.type === 'updates')

/**
 * The updates pill's line: the latest of them first, with its time ("3 updates · 6:21 pm · Rahul
 * added Dinner"). `entries` are oldest first, as chatRows gives them.
 */
export function updatesLine(entries: ActivityEntry[], text: (a: ActivityEntry) => string): string {
  const latest = entries[entries.length - 1]
  if (!latest) return ''
  const head = entries.length === 1 ? formatTime(latest.createdAt) : `${entries.length} updates · ${formatTime(latest.createdAt)}`
  return `${head} · ${text(latest)}`
}

/** Messages by others newer than `readAt` (the badge on the chat button). */
export function unreadCount(messages: ChatMessage[] | null, readAt: number | undefined, me: string): number {
  if (!messages) return 0
  return messages.filter((m) => m.authorUid !== me && m.createdAt > (readAt ?? 0)).length
}

/**
 * The unread dot: the newest message is someone else's and came after the last read on this
 * device (a chat never opened here counts as unread until it is opened once).
 */
export function hasUnread(latest: ChatMessage | undefined, readAt: number | undefined, me: string): boolean {
  return !!latest && latest.authorUid !== me && latest.createdAt > (readAt ?? 0)
}

/** What a message box holds before it's sent: trimmed, at most two blank lines in a row, capped. */
export function cleanMessage(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CHAT_MAX)
}

export type TextPart = { text: string; href?: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi

/** Text split into plain parts and http(s) links (never any other scheme), for safe rendering. */
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: text.slice(at, i) })
    out.push({ text: m[0], href: m[0] })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out.length ? out : [{ text }]
}

/** The member entry behind a message's author (for the avatar and colour), when they're still known. */
export function authorMember(group: Pick<Group, 'members'>, uid: string): MemberId | undefined {
  return memberIdOfUid(group.members, uid)
}

/** Whether a Pay me / Settle up asks the viewer: it asks everyone, or names them. */
export const asksMember = (m: Pick<ChatMessage, 'to'>, member: MemberId | undefined) => !m.to?.length || (!!member && m.to.includes(member))

/**
 * A Pay me card, for the person looking at it: the author sees what they asked for; anyone it
 * asks gets "Pay" into a prefilled Settle up (from them to the author); someone it doesn't ask
 * sees who was asked. null for a viewer who isn't a member, or when the author has left the group.
 */
export function payCard(
  m: Pick<ChatMessage, 'amount' | 'authorUid' | 'to'>,
  ctx: { groupId: string; me: string; myMember?: MemberId; authorMember?: MemberId },
): { mine: true } | { mine: false; href: string } | { mine: false; notAsked: true } | null {
  if (m.authorUid === ctx.me) return { mine: true }
  if (!ctx.myMember || !ctx.authorMember || !m.amount) return null
  if (!asksMember(m, ctx.myMember)) return { mine: false, notAsked: true }
  return { mine: false, href: settleHref(ctx.groupId, ctx.myMember, ctx.authorMember, m.amount) }
}

export const settleHref = (groupId: string, from: MemberId, to: MemberId, amount: Cents) =>
  `/groups/${encodeURIComponent(groupId)}/settle?${new URLSearchParams({ from, to, amount: String(amount) })}`

/** What two people owe each other right now (the group's pairwise debts): positive = `a` owes `b`. */
export function owedBetween(debts: Debt[], a: MemberId, b: MemberId): Cents {
  let n = 0
  for (const d of debts) {
    if (d.from === a && d.to === b) n += d.amount
    else if (d.from === b && d.to === a) n -= d.amount
  }
  return n
}

export type SettleCardView =
  /** the author: who they asked, and how many of them still owe them */
  | { kind: 'mine'; owing: number }
  /** asked, and owes the author: one button for exactly that */
  | { kind: 'owe'; amount: Cents; href: string }
  /** asked, but the author owes them (or nobody owes anyone) */
  | { kind: 'owed'; amount: Cents }
  | { kind: 'square' }
  /** not asked */
  | { kind: 'notAsked' }

/**
 * An ask to settle up, live, for the person looking at it: what they owe the author now (one
 * button into a prefilled Settle up for exactly that), or that they're square. The amounts are
 * the pairwise debts (what these two owe each other), so it's the same with Simplify on or off.
 */
export function settleCard(
  m: Pick<ChatMessage, 'authorUid' | 'to'>,
  ctx: { groupId: string; me: string; myMember?: MemberId; authorMember?: MemberId; debts: Debt[]; members: MemberId[] },
): SettleCardView | null {
  if (!ctx.authorMember) return null
  if (m.authorUid === ctx.me) {
    const asked = m.to?.length ? m.to : ctx.members.filter((id) => id !== ctx.authorMember)
    return { kind: 'mine', owing: asked.filter((id) => owedBetween(ctx.debts, id, ctx.authorMember as MemberId) > 0).length }
  }
  if (!ctx.myMember) return null
  if (!asksMember(m, ctx.myMember)) return { kind: 'notAsked' }
  const n = owedBetween(ctx.debts, ctx.myMember, ctx.authorMember)
  if (n > 0) return { kind: 'owe', amount: n, href: settleHref(ctx.groupId, ctx.myMember, ctx.authorMember, n) }
  if (n < 0) return { kind: 'owed', amount: -n }
  return { kind: 'square' }
}

/** Only the author edits a message, and only one with words of its own (a card's words go with the card). */
export const canEdit = (m: Pick<ChatMessage, 'authorUid' | 'kind' | 'pending'>, me: string) => m.authorUid === me && m.kind === 'text'

export const REPLY_PREVIEW_MAX = 140

/** What a reply keeps of the message it answers (a copy, so it shows even when the original isn't loaded). */
export function replyRef(m: Pick<ChatMessage, 'id' | 'authorUid' | 'authorName' | 'kind' | 'text'>, card?: string): ChatReplyRef {
  const text = messagePreview(m, card)
  return {
    id: m.id,
    authorUid: m.authorUid,
    authorName: m.authorName.slice(0, 80),
    text: text.length > REPLY_PREVIEW_MAX ? `${text.slice(0, REPLY_PREVIEW_MAX - 1)}…` : text,
  }
}

const CARD_LABEL: Partial<Record<ChatMessage['kind'], string>> = {
  openItem: 'Open item',
  pay: 'Pay me',
  expense: 'Expense',
  settle: 'Settle up',
  balances: 'Balances',
  merge: 'Merge',
}

/** One line for a message, where there's no room for the card (the chat button's hint, a reply). */
export function messagePreview(m: Pick<ChatMessage, 'kind' | 'text'>, card?: string): string {
  const words = m.text.trim().replace(/\s+/g, ' ')
  if (m.kind === 'text') return words
  const label = CARD_LABEL[m.kind] ?? 'Message'
  return [label + (card ? `: ${card}` : ''), words].filter(Boolean).join(' · ')
}

// ---- Last read, per device ----------------------------------------------------------------

const READ_PREFIX = 'splitit-chat-read:'

export function readAtOf(groupId: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(READ_PREFIX + groupId))
    return Number.isFinite(v) && v > 0 ? v : undefined
  } catch {
    return undefined
  }
}

/** Remember the newest message seen (never moves backwards). */
export function markRead(groupId: string, at: number): void {
  try {
    if ((readAtOf(groupId) ?? 0) >= at) return
    localStorage.setItem(READ_PREFIX + groupId, String(at))
    window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: groupId }))
  } catch {
    /* private mode */
  }
}

/** Fired on this window when a chat is marked read, so the group screen's dot updates without a reload. */
export const READ_EVENT = 'splitit-chat-read'

/**
 * Everyone's label for @mentions: the same for every reader (not "you"-relative), so "@Rahul S."
 * written on one phone is found on another. People who left aren't offered or matched.
 */
export function mentionLabels(members: Group['members']): Record<MemberId, string> {
  return groupLabels(activeMembers(members))
}
