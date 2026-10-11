import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ChatMessage } from '@/types'
import { authorMember, chatRows, cleanMessage, dayLabel, hasUnread, linkParts, messagePreview, payCard, RUN_GAP_MS, unreadCount } from './chat'

const at = (iso: string) => new Date(iso).getTime()
let n = 0
const msg = (author: string, iso: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  authorUid: author,
  authorName: author,
  text: 'hi',
  kind: 'text',
  createdAt: at(iso),
  ...over,
})
const act = (iso: string, over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `a${++n}`,
  groupId: 'g',
  type: 'expense.created',
  actorUid: 'u2',
  actorName: 'Rahul',
  targetId: 'e1',
  summary: 'Rahul added Lunch',
  createdAt: at(iso),
  ...over,
})
const kinds = (rows: ReturnType<typeof chatRows>) =>
  rows.map((r) => (r.type === 'message' ? `${r.message.authorUid}${r.first ? '^' : ''}${r.last ? '$' : ''}` : r.type === 'day' ? `[${r.label}]` : r.type))

describe('dayLabel', () => {
  const today = '2026-10-11' // a Sunday
  it('today, yesterday, weekday within a week, then dates', () => {
    expect(dayLabel('2026-10-11', today)).toBe('Today')
    expect(dayLabel('2026-10-10', today)).toBe('Yesterday')
    expect(dayLabel('2026-10-06', today)).toBe('Tuesday')
    expect(dayLabel('2026-10-04', today)).toMatch(/4 Oct/)
    expect(dayLabel('2025-12-31', today)).toMatch(/2025/)
  })
  it('across a month boundary and DST', () => {
    expect(dayLabel('2026-03-31', '2026-04-01')).toBe('Yesterday')
    expect(dayLabel('2026-10-24', '2026-10-25')).toBe('Yesterday')
  })
})

describe('chatRows', () => {
  const base = { me: 'u1', today: '2026-10-11' }
  it('day headers when the day changes', () => {
    const rows = chatRows([msg('u2', '2026-10-10T10:00:00'), msg('u2', '2026-10-11T09:00:00')], base)
    expect(kinds(rows)).toEqual(['[Yesterday]', 'u2^$', '[Today]', 'u2^$'])
  })
  it('runs: same person within the gap share a run; a gap or another person starts a new one', () => {
    const t0 = at('2026-10-11T09:00:00')
    const rows = chatRows(
      [
        msg('u2', '2026-10-11T09:00:00'),
        msg('u2', '2026-10-11T09:01:00'),
        msg('u1', '2026-10-11T09:02:00'),
        msg('u1', new Date(t0 + 2 * 60_000 + RUN_GAP_MS + 1).toISOString()),
      ],
      base,
    )
    expect(kinds(rows)).toEqual(['[Today]', 'u2^', 'u2$', 'u1^$', 'u1^$'])
    const mine = rows.filter((r) => r.type === 'message' && r.mine)
    expect(mine).toHaveLength(2)
  })
  it('the unread line goes before the first unread message by someone else', () => {
    const rows = chatRows(
      [msg('u2', '2026-10-11T09:00:00'), msg('u1', '2026-10-11T09:05:00'), msg('u2', '2026-10-11T09:06:00'), msg('u2', '2026-10-11T09:07:00')],
      { ...base, readAt: at('2026-10-11T09:00:30') },
    )
    expect(kinds(rows)).toEqual(['[Today]', 'u2^$', 'u1^$', 'unread', 'u2^', 'u2$'])
  })
  it('no unread line when everything is read, or for your own messages', () => {
    expect(kinds(chatRows([msg('u2', '2026-10-11T09:00:00')], { ...base, readAt: at('2026-10-11T10:00:00') }))).not.toContain('unread')
    expect(kinds(chatRows([msg('u1', '2026-10-11T09:00:00')], { ...base, readAt: 0 }))).not.toContain('unread')
  })
  it('activity becomes one pill per stretch between messages, and breaks a run', () => {
    const rows = chatRows([msg('u2', '2026-10-11T09:00:00'), msg('u2', '2026-10-11T09:03:00')], {
      ...base,
      activity: [act('2026-10-11T09:01:00'), act('2026-10-11T09:02:00', { targetId: 'e2' }), act('2026-10-11T09:02:30', { type: 'expense.updated' })],
    })
    expect(kinds(rows)).toEqual(['[Today]', 'u2^$', 'updates', 'u2^$'])
    const pill = rows.find((r) => r.type === 'updates')
    expect(pill?.type === 'updates' && pill.entries).toHaveLength(2)
  })
  it('an expense with a card in the chat is not repeated as a pill', () => {
    const rows = chatRows([msg('u2', '2026-10-11T09:00:00', { kind: 'expense', ref: 'e1', text: '' })], {
      ...base,
      activity: [act('2026-10-11T09:00:01', { targetId: 'e1' })],
    })
    expect(kinds(rows)).toEqual(['[Today]', 'u2^$'])
  })
  it('older activity waits until the start of the chat is loaded', () => {
    const activity = [act('2026-10-10T09:00:00')]
    const messages = [msg('u2', '2026-10-11T09:00:00')]
    expect(kinds(chatRows(messages, { ...base, activity, olderThan: messages[0].createdAt }))).toEqual(['[Today]', 'u2^$'])
    expect(kinds(chatRows(messages, { ...base, activity }))).toEqual(['[Yesterday]', 'updates', '[Today]', 'u2^$'])
  })
  it('an empty chat with activity still shows it', () => {
    expect(kinds(chatRows([], { ...base, activity: [act('2026-10-11T09:00:00')] }))).toEqual(['[Today]', 'updates'])
  })
})

describe('unread', () => {
  const m = [msg('u2', '2026-10-11T09:00:00'), msg('u1', '2026-10-11T09:01:00'), msg('u2', '2026-10-11T09:02:00')]
  it('counts others’ messages after the last read', () => {
    expect(unreadCount(m, undefined, 'u1')).toBe(2)
    expect(unreadCount(m, at('2026-10-11T09:01:00'), 'u1')).toBe(1)
    expect(unreadCount(null, undefined, 'u1')).toBe(0)
  })
  it('the dot follows the newest message', () => {
    expect(hasUnread(m[2], at('2026-10-11T09:01:00'), 'u1')).toBe(true)
    expect(hasUnread(m[2], at('2026-10-11T09:02:00'), 'u1')).toBe(false)
    expect(hasUnread(m[1], undefined, 'u1')).toBe(false)
    expect(hasUnread(undefined, undefined, 'u1')).toBe(false)
  })
})

describe('cleanMessage', () => {
  it('trims, keeps at most one blank line, caps the length', () => {
    expect(cleanMessage('  hi \r\n\r\n\r\n\r\nthere  ')).toBe('hi\n\nthere')
    expect(cleanMessage('x'.repeat(1200))).toHaveLength(1000)
    expect(cleanMessage('   ')).toBe('')
  })
})

describe('linkParts', () => {
  it('splits out http(s) links, without trailing punctuation', () => {
    expect(linkParts('menu at https://cafe.example/menu. ok')).toEqual([
      { text: 'menu at ' },
      { text: 'https://cafe.example/menu', href: 'https://cafe.example/menu' },
      { text: '. ok' },
    ])
  })
  it('never links other schemes', () => {
    expect(linkParts('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
    expect(linkParts('')).toEqual([{ text: '' }])
  })
})

describe('authorMember / payCard', () => {
  const group = {
    members: {
      a: { name: 'Old', color: '#000', uid: 'u2', removedAt: 1 },
      b: { name: 'Rahul', color: '#000', uid: 'u2' },
      c: { name: 'Me', color: '#000', uid: 'u1' },
    },
  }
  it('prefers the current entry', () => {
    expect(authorMember(group, 'u2')).toBe('b')
    expect(authorMember(group, 'zz')).toBeUndefined()
  })
  it('the author sees their own request; others get a prefilled Settle up', () => {
    expect(payCard({ amount: 50000, authorUid: 'u1' }, { groupId: 'g', me: 'u1' })).toEqual({ mine: true })
    expect(payCard({ amount: 50000, authorUid: 'u2' }, { groupId: 'g', me: 'u1', myMember: 'c', authorMember: 'b' })).toEqual({
      mine: false,
      href: '/groups/g/settle?from=c&to=b&amount=50000',
    })
    expect(payCard({ amount: 50000, authorUid: 'u2' }, { groupId: 'g', me: 'u1', myMember: 'c' })).toBeNull()
  })
})

describe('messagePreview', () => {
  it('words, or the card label', () => {
    expect(messagePreview({ kind: 'text', text: ' who  paid? ' })).toBe('who paid?')
    expect(messagePreview({ kind: 'openItem', text: 'who paid?' }, 'Lunch')).toBe('Open item: Lunch · who paid?')
    expect(messagePreview({ kind: 'pay', text: '' }, '₹500')).toBe('Pay me: ₹500')
  })
})
