import { describe, expect, it } from 'vitest'
import { payLinkClaimedNote, payLinkPaidNote } from './notify-text'

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
