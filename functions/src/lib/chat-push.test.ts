import { describe, expect, it } from 'vitest'
import { CHAT_QUIET_MS, calledUids, chatLoudness, chatRecipients, newSuspects } from './chat-push'
import { chatNote, openItemNote } from './notify-text'

describe('chat recipients', () => {
  it('everyone with an account but the author, once each', () => {
    expect(chatRecipients(['a', 'b', 'b', 'c'], 'a')).toEqual(['b', 'c'])
    expect(chatRecipients(undefined, 'a')).toEqual([])
    expect(chatRecipients(['a', 3, ''], undefined)).toEqual(['a'])
  })
})

describe('chat loudness', () => {
  const now = 1_000_000
  it('quiet within the window after a loud one, loud otherwise', () => {
    expect(chatLoudness(['b', 'c', 'd'], { b: now - 1000, c: now - CHAT_QUIET_MS, d: 'x' }, now)).toEqual({ loud: ['c', 'd'], quiet: ['b'] })
    expect(chatLoudness(['b'], undefined, now)).toEqual({ loud: ['b'], quiet: [] })
    // a clock in the future doesn't silence anyone forever
    expect(chatLoudness(['b'], { b: now + 5000 }, now)).toEqual({ loud: ['b'], quiet: [] })
  })
})

describe('called by name', () => {
  const uidOf = (id: string) => ({ r: 'ur', p: 'up', gone: undefined, me: 'ume' })[id]
  const recipients = ['ur', 'up', 'ux']
  it('tags and the people a Pay me / Settle up asks, in the group, never the author', () => {
    expect([...calledUids({ mentions: ['r'] }, uidOf, recipients)]).toEqual(['ur'])
    expect([...calledUids({ kind: 'settle', to: ['p', 'gone'] }, uidOf, recipients)]).toEqual(['up'])
    expect([...calledUids({ kind: 'text', to: ['p'] }, uidOf, recipients)]).toEqual([])
    expect([...calledUids({ mentions: ['me'] }, uidOf, recipients)]).toEqual([])
  })
  it('@everyone calls everyone', () => {
    expect([...calledUids({ mentions: ['all'] }, uidOf, recipients)]).toEqual(recipients)
    expect([...calledUids({ mentions: 'all' }, uidOf, recipients)]).toEqual([])
  })
})

describe('new suspects', () => {
  it('named on create, or added by an edit', () => {
    expect(newSuspects(undefined, { status: 'open', suspects: ['m1', 'm2'] })).toEqual(['m1', 'm2'])
    expect(newSuspects({ suspects: ['m1'] }, { status: 'open', suspects: ['m1', 'm2'] })).toEqual(['m2'])
    expect(newSuspects({ suspects: ['m1'] }, { status: 'open', suspects: [] })).toEqual([])
  })
  it('nobody once claimed or deleted', () => {
    expect(newSuspects(undefined, { status: 'claimed', suspects: ['m1'] })).toEqual([])
    expect(newSuspects(undefined, { status: 'open', suspects: ['m1'], deletedAt: 5 })).toEqual([])
    expect(newSuspects({}, undefined)).toEqual([])
  })
})

describe('chat and open item notes', () => {
  const base = { groupId: 'g1', groupName: 'Goa', emoji: '🏖️', authorName: 'Ananya', currency: 'INR' }
  it('words, and cards in a few words', () => {
    expect(chatNote({ ...base, kind: 'text', text: 'who paid  for lunch?' })).toEqual({
      title: '🏖️ Goa',
      body: 'Ananya: who paid for lunch?',
      url: '/groups/g1/chat',
      tag: 'chat-g1',
    })
    expect(chatNote({ ...base, kind: 'pay', text: 'scooter', amount: 120000 }).body).toBe('Ananya: asks for ₹1,200 · scooter')
    expect(chatNote({ ...base, kind: 'pay', text: '', amount: 120000, called: true }).body).toBe('Ananya: asks you for ₹1,200')
    expect(chatNote({ ...base, kind: 'settle', text: '', called: true }).body).toBe('Ananya: asks you to settle up')
    expect(chatNote({ ...base, kind: 'settle', text: '' }).body).toBe('Ananya: asks everyone to settle up')
    expect(chatNote({ ...base, kind: 'balances', text: '' }).body).toBe('Ananya: shared the balances')
    expect(chatNote({ ...base, kind: 'text', text: '@Ravi lunch?', called: true }).body).toBe('Ananya: tagged you · @Ravi lunch?')
    expect(chatNote({ ...base, kind: 'openItem', text: '', itemTitle: 'Lunch' }).body).toBe('Ananya: 🧾 Who paid? Lunch')
    expect(chatNote({ ...base, kind: 'text', text: 'x', silent: true }).silent).toBe(true)
    expect(chatNote({ ...base, kind: 'text', text: 'y'.repeat(400) }).body.length).toBeLessThanOrEqual(180)
  })
  it('asks the suspect to claim it', () => {
    expect(
      openItemNote({ groupId: 'g1', itemId: 'o1', groupName: 'Goa', byName: 'Ananya', title: 'Lunch', date: '2026-10-02', amount: 29000, currency: 'INR' }),
    ).toEqual({
      title: 'Goa',
      body: 'Ananya thinks you paid for Lunch on 2 Oct (₹290). Claim it if you did.',
      url: '/groups/g1?tab=open',
      tag: 'open-o1',
    })
    expect(openItemNote({ groupId: 'g1', itemId: 'o1', groupName: 'Goa', title: 'Taxi', currency: 'INR' }).body).toBe(
      'Someone thinks you paid for Taxi. Claim it if you did.',
    )
  })
})
