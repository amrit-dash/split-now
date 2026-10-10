import { describe, expect, it } from 'vitest'
import { deleteMessage, groupDeleteState } from './group-delete'

const g = (over: object = {}) => ({
  name: 'Goa',
  createdBy: 'alice',
  memberUids: ['alice', 'bob'],
  members: { a: { name: 'Alice', uid: 'alice', color: '' }, b: { name: 'Bob', uid: 'bob', color: '' } },
  ...over,
})

describe('groupDeleteState', () => {
  it('lets the creator delete, settled or not', () => {
    expect(groupDeleteState(g(), 'alice', false)).toEqual({ allowed: true })
  })
  it('tells other members who can', () => {
    expect(groupDeleteState(g(), 'bob', true)).toEqual({ allowed: false, reason: 'Only Alice can delete “Goa”.' })
  })
  it('once the creator has left, lets any member delete, but only when everyone is square', () => {
    const left = g({ memberUids: ['bob'] })
    expect(groupDeleteState(left, 'bob', true)).toEqual({ allowed: true })
    expect(groupDeleteState(left, 'bob', false)).toMatchObject({ allowed: false, reason: expect.stringMatching(/settled up first/) })
  })
  it('refuses someone no longer in the group', () => {
    expect(groupDeleteState(g(), 'carol', true)).toMatchObject({ allowed: false })
  })
})

describe('deleteMessage', () => {
  const name = (id: string) => ({ a: 'Alice', b: 'Bob', c: 'Cat' })[id] ?? '?'
  const money = (n: number) => `₹${n}`
  it('says it can be restored, and for how long', () => {
    expect(deleteMessage([], name, money)).toMatch(/restore it within 30 days/)
  })
  it('lists the payments still open, three at most', () => {
    const debts = [
      { from: 'b', to: 'a', amount: 5 },
      { from: 'c', to: 'a', amount: 4 },
      { from: 'c', to: 'b', amount: 3 },
      { from: 'b', to: 'c', amount: 2 },
    ]
    expect(deleteMessage(debts, name, money)).toMatch(/Still open: Bob owes Alice ₹5; Cat owes Alice ₹4; Cat owes Bob ₹3, and 1 more\.$/)
  })
})
