import { describe, expect, it } from 'vitest'
import { blockerLine, canDelete, confirmTyped, planSummary } from './account-delete'

const groups = { goa: { name: 'Goa', currency: 'INR' }, flat: { name: 'Flat' } }

describe('delete my account: what the screen says', () => {
  it('says what stops it, in plain words', () => {
    expect(blockerLine({ groupId: 'goa', reason: 'unsettled', owes: true, amount: 30000 }, groups)).toMatch(/^You owe ₹300(\.00)? in Goa\. Settle up first\.$/)
    expect(blockerLine({ groupId: 'goa', reason: 'unsettled', owes: false, amount: 5000 }, groups)).toMatch(/^You’re owed ₹50/)
    expect(blockerLine({ groupId: 'flat', reason: 'pending' }, groups)).toBe('An expense in Flat still needs an OK.')
    expect(blockerLine({ groupId: 'flat', reason: 'repeating', description: 'Rent' }, groups)).toBe('“Rent” still repeats in Flat. Stop it repeating first.')
    expect(blockerLine({ groupId: 'gone', reason: 'pending' }, groups)).toBe('An expense in a group still needs an OK.')
  })
  it('sorts the groups into deleted, left and handed over', () => {
    expect(
      planSummary(
        [
          { kind: 'delete', groupId: 'goa', why: 'wallet' },
          { kind: 'leave', groupId: 'flat', memberId: 'a', newCreator: 'b' },
        ],
        groups,
      ),
    ).toEqual({ deleted: ['Goa'], left: ['Flat'], handedOver: ['Flat'] })
  })
  it('the button needs a clear plan, no admin access and the word typed', () => {
    expect(confirmTyped(' delete ')).toBe(true)
    expect(confirmTyped('DELET')).toBe(false)
    expect(canDelete({ blockers: [], admin: false }, 'DELETE')).toBe(true)
    expect(canDelete({ blockers: [], admin: true }, 'DELETE')).toBe(false)
    expect(canDelete({ blockers: [{ groupId: 'goa', reason: 'pending' }], admin: false }, 'DELETE')).toBe(false)
    expect(canDelete(null, 'DELETE')).toBe(false)
  })
})
