import { describe, expect, it } from 'vitest'
import { addedToGroupNote, groupDeletedNote, payLinkClaimedNote, payLinkPaidNote } from './notify-text'

describe('Pay me link push to the payee', () => {
  const base = { code: 'abcdefghijkmnpqrstuvwxyz', groupName: 'Goa trip', emoji: '🏖️', payerName: 'Rahul', amount: 124000, currency: 'INR' }
  it('recorded in the group: says so and how to undo it, opens the link', () => {
    expect(payLinkPaidNote({ ...base, recorded: true })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Rahul marked ₹1,240 paid · Goa trip. It’s recorded as a payment; not right? Delete it in the group.',
      url: '/r/abcdefghijkmnpqrstuvwxyz',
      tag: 'paylink-abcdefghijkmnpqrstuvwxyz',
    })
  })
  it('a table without a group, with a screenshot', () => {
    expect(payLinkPaidNote({ ...base, groupName: 'Pho', emoji: undefined, amount: 25050, recorded: false, withProof: true }).body).toBe(
      'Rahul marked ₹250.50 paid · Pho. Screenshot attached.',
    )
  })
})

describe('claim push to a live table host', () => {
  it('asks the host to confirm, says it counts only then', () => {
    expect(
      payLinkClaimedNote({ code: 'abcdefghijkmnpqrstuvwxyz', groupName: 'Pho', payerName: 'Gran', amount: 25000, currency: 'INR', withProof: true }),
    ).toEqual({
      title: 'Pho',
      body: 'Gran says they’ve paid ₹250 · confirm. Screenshot attached. It counts once you confirm it.',
      url: '/r/abcdefghijkmnpqrstuvwxyz',
      tag: 'paylink-abcdefghijkmnpqrstuvwxyz',
    })
  })
})

describe('groupDeletedNote', () => {
  it('says who deleted it and that it can be restored, and opens the group', () => {
    const n = groupDeletedNote({ groupId: 'g1', groupName: 'Goa', emoji: '🏖️', byName: 'Amrit', days: 30 })
    expect(n).toMatchObject({ title: '🏖️ Goa', url: '/groups/g1', tag: 'group-deleted-g1' })
    expect(n.body).toBe('Amrit deleted this group. You can restore it within 30 days.')
  })
})

describe('payLinkPaidNote when the server couldn’t record it', () => {
  it('says why instead of “recorded”', () => {
    const n = payLinkPaidNote({
      code: 'c',
      groupName: 'Goa',
      payerName: 'Rahul',
      amount: 124000,
      currency: 'INR',
      recorded: false,
      skipped: 'It isn’t recorded in Goa because the group is in Recently deleted.',
    })
    expect(n.body).toContain('Recently deleted')
    expect(n.body).not.toContain('It’s recorded')
  })
})

describe('addedToGroupNote', () => {
  it('names who added you, and opens the group', () => {
    expect(addedToGroupNote({ groupId: 'g1', groupName: 'Goa trip', emoji: '🏖️', byName: 'Priya' })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Priya added you to this group.',
      url: '/groups/g1',
      tag: 'group-added-g1',
    })
    expect(addedToGroupNote({ groupId: 'g1', groupName: 'Flat' }).body).toBe('You were added to this group.')
  })
})
