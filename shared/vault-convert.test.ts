import { describe, expect, it } from 'vitest'
import { isToken, openText, vaultKey } from './vault-crypto'
import { blocksStopping, openDoc, openProfileCopy, privateGroupsOn, sealDoc, sealProfileCopy, withoutUniversal } from './vault-convert'

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
    expect(await sealDoc(k, 'expense', { amount: 5, iconImage: 'data:image/webp;base64,AA' })).toEqual({ iconImage: null })
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
    // an open item's icon is sealed as an expense's; its drawn icon or picture goes
    const item = (await sealDoc(k, 'openItem', { title: 'Tickets', icon: '🎟️', iconSvg: '<svg/>', iconImage: 'data:image/webp;base64,AA' })) as Record<
      string,
      unknown
    >
    expect(isToken(item.icon)).toBe(true)
    expect(String(item.icon).length).toBeLessThanOrEqual(80)
    expect([item.iconSvg, item.iconImage]).toEqual([null, null])
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

describe('private groups on or off', () => {
  it('start off, are on once turned on, and stay on for anyone who had a universal pattern or made one; a stop turns them off', () => {
    expect(privateGroupsOn({})).toBe(false)
    expect(privateGroupsOn({}, 0)).toBe(false)
    expect(privateGroupsOn({ on: true })).toBe(true)
    // from before they started off: nothing anyone had goes away
    expect(privateGroupsOn({ pattern: { hash: 'h' } })).toBe(true)
    expect(privateGroupsOn({}, 1)).toBe(true)
    // a stop wins over everything
    expect(privateGroupsOn({ off: true, on: true, pattern: { hash: 'h' } }, 2)).toBe(false)
  })
})

describe('who has no universal pattern in a private group', () => {
  it('everyone else in it without one, never the person asking', () => {
    const members = ['me', 'mira', 'dev', 'ana']
    expect(withoutUniversal(members, new Set(['me', 'dev']), 'me')).toEqual(['mira', 'ana'])
    expect(withoutUniversal(members, new Set(['mira', 'dev', 'ana']), 'me')).toEqual([])
    expect(withoutUniversal(['me'], new Set(), 'me')).toEqual([])
  })
})

describe('profile copies in a private group', () => {
  const copy = {
    displayName: 'Rahul Sharma',
    photoURL: 'https://x.test/p.jpg',
    payment: { upi: 'rahul@okaxis', phone: '9876543210' },
    currency: 'INR',
    pro: true,
  }
  it('name, photo link and payment details are sealed; badges and currency stay readable', async () => {
    const k = await vaultKey('g', btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))
    const sealed = await sealProfileCopy(k, copy)
    expect(isToken(sealed.displayName)).toBe(true)
    expect(isToken(sealed.photoURL)).toBe(true)
    expect(isToken(sealed.payment)).toBe(true)
    expect(JSON.stringify(sealed)).not.toMatch(/Rahul|okaxis|9876543210|x\.test/)
    expect(sealed).toMatchObject({ currency: 'INR', pro: true })
    // deterministic: sealing again writes nothing new
    expect(await sealProfileCopy(k, sealed)).toEqual(sealed)
  })
  it('members with the key read it back whole; turning private off opens it the same way', async () => {
    const k = await vaultKey('g', btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))
    const sealed = await sealProfileCopy(k, copy)
    expect(await openProfileCopy(k, sealed)).toEqual(copy)
    expect({ ...sealed, ...(await openDoc(k, sealed)) }).toEqual(copy)
  })
  it("without the key (locked, or another group's): no token reaches a screen", async () => {
    const k = await vaultKey('g', btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))
    const other = await vaultKey('h', btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))
    const sealed = await sealProfileCopy(k, copy)
    for (const key of [null, other]) {
      const shown = await openProfileCopy(key, sealed)
      expect(shown).toEqual({ displayName: '', currency: 'INR', pro: true })
    }
  })
  it('an old plain copy reads as it is', async () => {
    expect(await openProfileCopy(null, copy)).toEqual(copy)
  })
})
