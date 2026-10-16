import { describe, expect, it } from 'vitest'
import { isToken, openText, vaultKey } from './vault-crypto'
import { blocksStopping, openDoc, sealDoc } from './vault-convert'

const dek = btoa(String.fromCharCode(...new Array(32).fill(7)))

describe('converting a group', () => {
  it('seals a group’s name, emoji and people’s names, never emails, ids or settings', async () => {
    const k = await vaultKey('g', dek)
    const g = {
      name: 'Goa',
      emoji: '🏖️',
      currency: 'INR',
      members: { m1: { name: 'Asha', uid: 'u1', email: 'a@x.in', color: '#f00', photoURL: 'https://lh3.example/a.jpg' } },
    }
    const p = (await sealDoc(k, 'group', g)) as typeof g
    expect(isToken(p.name)).toBe(true)
    expect(isToken(p.emoji)).toBe(true)
    expect(isToken(p.members.m1.name)).toBe(true)
    expect(isToken(p.members.m1.photoURL)).toBe(true)
    expect(p.members.m1).toMatchObject({ uid: 'u1', email: 'a@x.in', color: '#f00' })
    expect(p).not.toHaveProperty('currency')
    // an entry with no photo gets no photo field at all (Firestore refuses undefined)
    const noPhoto = (await sealDoc(k, 'group', { name: 'Goa', members: { m2: { name: 'Dev' } } })) as { members: { m2: Record<string, unknown> } }
    expect(Object.keys(noPhoto.members.m2)).toEqual(['name'])
    // sealed twice is the same: a second pass changes nothing
    expect(await sealDoc(k, 'group', { ...g, ...p })).toBeNull()
  })
  it('seals each kind’s words and leaves amounts, dates and ids', async () => {
    const k = await vaultKey('g', dek)
    const e = {
      description: 'Hotel',
      icon: '🏨',
      notes: 'two nights',
      amount: 500000,
      date: '2026-10-01',
      splitInput: { items: [{ name: 'Room', amount: 1 }] },
      dispute: { u1: { reason: 'too much', at: 1 } },
    }
    const p = (await sealDoc(k, 'expense', e)) as typeof e
    expect(Object.keys(p).sort()).toEqual(['description', 'dispute', 'icon', 'notes', 'splitInput'])
    expect(isToken(p.icon)).toBe(true)
    expect(p.icon.length).toBeLessThanOrEqual(80)
    expect(isToken(p.splitInput.items[0]?.name)).toBe(true)
    expect(p.splitInput.items[0]?.amount).toBe(1)
    expect(isToken(p.dispute.u1?.reason)).toBe(true)
    expect(await sealDoc(k, 'expense', { amount: 5 })).toBeNull()
    // an AI-drawn icon can't be sealed: it goes (null is a delete)
    expect(await sealDoc(k, 'expense', { amount: 5, iconSvg: '<svg/>' })).toEqual({ iconSvg: null })
    expect((await sealDoc(k, 'group', { name: 'Goa', iconSvg: '<svg/>' }))?.iconSvg).toBeNull()
    const chat = (await sealDoc(k, 'chat', {
      text: 'hi',
      authorName: 'Asha',
      kind: 'text',
      replyTo: { id: 'c', authorUid: 'u', authorName: 'Dev', text: 'see you' },
    })) as {
      replyTo: { text: string; authorName: string; id: string }
    }
    expect(isToken(chat.replyTo.text)).toBe(true)
    expect(chat.replyTo.text.length).toBeLessThanOrEqual(160)
    expect(chat.replyTo.id).toBe('c')
    const a = (await sealDoc(k, 'activity', {
      summary: 'Asha added “Hotel”',
      actorName: 'Asha',
      after: { description: 'Hotel', amount: 5 },
      type: 'expense.created',
    })) as {
      after: { description: string; amount: number }
      summary: string
    }
    expect(isToken(a.summary)).toBe(true)
    expect(a.after.amount).toBe(5)
    expect(isToken(a.after.description)).toBe(true)
    expect(Object.keys((await sealDoc(k, 'settlement', { note: 'cash', amount: 1 })) ?? {})).toEqual(['note'])
    expect(Object.keys((await sealDoc(k, 'openItem', { title: 'Tickets', amount: 1 })) ?? {})).toEqual(['title'])
    expect(Object.keys((await sealDoc(k, 'comment', { text: 'ok', authorName: 'Asha', createdAt: 1 })) ?? {}).sort()).toEqual(['authorName', 'text'])
  })
  it('opens everything back, and leaves what another group sealed', async () => {
    const k = await vaultKey('g', dek)
    const other = await vaultKey('h', dek)
    const doc = { description: 'Hotel', summary: 'Asha added “Hotel”', amount: 5 }
    const sealed = { ...doc, ...(await sealDoc(k, 'expense', doc)), ...(await sealDoc(k, 'activity', doc)) }
    expect(await openDoc(k, sealed)).toEqual({ description: 'Hotel', summary: 'Asha added “Hotel”' })
    const foreign = { ...doc, ...(await sealDoc(other, 'expense', doc)) }
    expect(await openDoc(k, foreign)).toBeNull()
    expect(await openText(sealed.description, k)).toBe('Hotel')
  })
})

describe('stopping private groups', () => {
  it('only live private groups they made and are still in hold it up', () => {
    const g = { vault: true, createdBy: 'u', memberUids: ['u', 'v'] }
    expect(blocksStopping(g, 'u')).toBe(true)
    expect(blocksStopping(g, 'v')).toBe(false) // someone else's
    expect(blocksStopping({ ...g, vault: undefined }, 'u')).toBe(false) // turned off
    expect(blocksStopping({ ...g, deletedAt: 5 }, 'u')).toBe(false) // in Recently deleted
    expect(blocksStopping({ ...g, memberUids: ['v'] }, 'u')).toBe(false) // they left it
  })
})
