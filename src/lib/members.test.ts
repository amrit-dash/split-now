import { describe, expect, it } from 'vitest'
import {
  expenseMemberIds,
  memberActions,
  repeatingByMember,
  stillRepeats,
  isSettled,
  listedMemberIds,
  memberRemoval,
  memberState,
  membersIn,
  orderMembers,
} from './members'
import { simplifyDebts } from './simplify'

const base = { me: 'm1', myUid: 'u1', createdBy: 'u1', balance: 0 }

describe('isSettled', () => {
  it('is settled only below one minor unit', () => {
    expect(isSettled(0)).toBe(true)
    expect(isSettled(0.4)).toBe(true)
    expect(isSettled(-1)).toBe(false)
    expect(isSettled(42000)).toBe(false)
  })
})

describe('memberRemoval', () => {
  it('a settled placeholder can be removed by anyone', () => {
    expect(memberRemoval({ ...base, memberId: 'p1', member: {} })).toEqual({ kind: 'remove' })
    expect(memberRemoval({ ...base, createdBy: 'other', memberId: 'p1', member: {} })).toEqual({ kind: 'remove' })
  })
  it('a joined member can be removed only by the creator', () => {
    expect(memberRemoval({ ...base, memberId: 'm2', member: { uid: 'u2' } })).toEqual({ kind: 'remove' })
    expect(memberRemoval({ ...base, createdBy: 'u3', memberId: 'm2', member: { uid: 'u2' } })).toEqual({ kind: 'not-allowed' })
  })
  it('someone who owes or is owed must settle up first', () => {
    expect(memberRemoval({ ...base, memberId: 'p1', member: {}, balance: -42000 })).toEqual({ kind: 'unsettled', owes: true, amount: 42000 })
    expect(memberRemoval({ ...base, memberId: 'p1', member: {}, balance: 500 })).toEqual({ kind: 'unsettled', owes: false, amount: 500 })
  })
  it('waits for expenses that still need an OK', () => {
    expect(memberRemoval({ ...base, memberId: 'p1', member: {}, inPending: new Set(['p1']) })).toEqual({ kind: 'pending' })
  })
  it('you leave rather than remove yourself; the creator cannot leave', () => {
    expect(memberRemoval({ ...base, memberId: 'm1', member: { uid: 'u1' } })).toEqual({ kind: 'creator' })
    expect(memberRemoval({ ...base, memberId: 'm1', member: { uid: 'u1' }, balance: 500 })).toEqual({ kind: 'creator' })
    expect(memberRemoval({ ...base, createdBy: 'u9', memberId: 'm1', member: { uid: 'u1' } })).toEqual({ kind: 'leave' })
    expect(memberRemoval({ ...base, createdBy: 'u9', memberId: 'm1', member: { uid: 'u1' }, balance: -1 }).kind).toBe('unsettled')
  })
})

describe('membersIn / memberState', () => {
  it('collects payers and people in splits', () => {
    expect(
      [
        ...membersIn([
          { paidBy: { a: 1 }, splits: { b: 1, c: 0 } },
          { paidBy: { b: 2 }, splits: {} },
        ]),
      ].sort(),
    ).toEqual(['a', 'b', 'c'])
  })
  it('says whether they joined', () => {
    expect(memberState({ uid: 'u' })).toBe('Joined')
    expect(memberState({ email: 'a@b.co' })).toBe('a@b.co · not joined yet')
    expect(memberState({})).toMatch(/^Not joined yet/)
  })
})

describe('removed members', () => {
  const members = {
    a: { name: 'Asha' },
    z: { name: 'Zoe', removedAt: 1 },
    b: { name: 'Bo' },
    y: { name: 'Yan', removedAt: 2 },
  }
  it('pickers list the people in the group now, plus removed people kept for an old expense', () => {
    expect(orderMembers(members)).toEqual(['a', 'b'])
    expect(orderMembers(members, ['z', 'gone'])).toEqual(['a', 'b', 'z'])
  })
  it('Balances lists a removed member only while they still have money in the group', () => {
    expect(listedMemberIds(members, { a: 10, b: -10 })).toEqual(['a', 'b'])
    expect(listedMemberIds(members, { a: 10, y: -10 })).toEqual(['a', 'b', 'y'])
  })
  it('settle-up suggestions skip a settled removed member and keep one who still owes', () => {
    expect(simplifyDebts({ a: 100, b: -100, z: 0 }).some((d) => d.from === 'z' || d.to === 'z')).toBe(false)
    expect(simplifyDebts({ a: 100, y: -100 })).toEqual([{ from: 'y', to: 'a', amount: 100 }])
  })
  it('collects everyone in an expense, items included', () => {
    expect(expenseMemberIds({ paidBy: { a: 1 }, splits: { b: 1 }, items: [{ members: ['z', 'a'] }] }).sort()).toEqual(['a', 'b', 'z'])
  })
  it('someone already removed is not removed again', () => {
    expect(memberRemoval({ ...base, memberId: 'z', member: { removedAt: 1 }, balance: -5 })).toEqual({ kind: 'removed' })
  })
  it('says they left', () => {
    expect(memberState({ uid: 'u', removedAt: 3 })).toBe('Left the group')
  })
})

describe('memberActions', () => {
  it('red Remove or Leave only when allowed', () => {
    expect(memberActions({ kind: 'remove' }, 0)).toEqual(['remove'])
    expect(memberActions({ kind: 'leave' }, 0)).toEqual(['leave'])
  })
  it('someone who owes gets Settle up plus an explaining Remove', () => {
    expect(memberActions({ kind: 'unsettled', owes: true, amount: 5 }, -5)).toEqual(['settle', 'explain'])
    expect(memberActions({ kind: 'pending' }, 0)).toEqual(['explain'])
    expect(memberActions({ kind: 'creator' }, 0)).toEqual(['explain'])
  })
  it('a removed member with money left can still be settled', () => {
    expect(memberActions({ kind: 'removed' }, -5)).toEqual(['settle'])
    expect(memberActions({ kind: 'removed' }, 0)).toEqual([])
  })
})

describe('repeating expenses', () => {
  const rent = { id: 'e1', description: 'Rent', paidBy: { a: 100 }, splits: { a: 50, r: 50 }, recurrence: { nextDate: '2026-11-01' } }
  it('a series runs until deleted or past its end date', () => {
    expect(stillRepeats(rent)).toBe(true)
    expect(stillRepeats({ ...rent, recurrence: { nextDate: '2026-11-01', until: '2026-12-31' } })).toBe(true)
    expect(stillRepeats({ ...rent, recurrence: { nextDate: '2027-01-01', until: '2026-12-31' } })).toBe(false)
    expect(stillRepeats({ ...rent, deletedAt: 1 })).toBe(false)
    expect(stillRepeats({ ...rent, recurrence: undefined })).toBe(false)
  })
  it('maps everyone in a running series to it; copies and ended series do not count', () => {
    const m = repeatingByMember([
      rent,
      { id: 'e2', description: 'Gym', paidBy: { x: 1 }, splits: { x: 1 } },
      { ...rent, id: 'e3', deletedAt: 1, splits: { q: 100 } },
    ])
    expect(m.get('r')).toEqual({ id: 'e1', description: 'Rent' })
    expect(m.get('a')).toEqual({ id: 'e1', description: 'Rent' })
    expect(m.has('x')).toBe(false)
    expect(m.has('q')).toBe(false)
  })
  it('blocks removing or leaving while in one, with the expense to fix', () => {
    const repeating = repeatingByMember([rent])
    expect(memberRemoval({ ...base, memberId: 'r', member: {}, repeating })).toEqual({ kind: 'repeating', expenseId: 'e1', description: 'Rent' })
    expect(
      memberRemoval({ ...base, createdBy: 'u9', memberId: 'm1', member: { uid: 'u1' }, repeating: new Map([['m1', { id: 'e1', description: 'Rent' }]]) }).kind,
    ).toBe('repeating')
    // money owed still comes first
    expect(memberRemoval({ ...base, memberId: 'r', member: {}, balance: -5, repeating }).kind).toBe('unsettled')
    expect(memberActions({ kind: 'repeating', expenseId: 'e1', description: 'Rent' }, 0)).toEqual(['explain'])
  })
})
