import { describe, expect, it } from 'vitest'
import {
  foldList,
  mergeApprover,
  foldMap,
  mergedEntries,
  mergeDirection,
  mergeExpense,
  mergeOpenItem,
  mergePayLink,
  mergeProblem,
  mergeSettlement,
} from './merge-members'

const members = {
  p: { name: 'Priya', email: 'priya@x.com' },
  k: { name: 'Priya Shah', uid: 'u1' },
  b: { name: 'Bob', uid: 'u2' },
  gone: { name: 'Sam', removedAt: 1 },
}

describe('which merges are allowed', () => {
  it('two different people in the group, not both with accounts, nobody who left', () => {
    expect(mergeProblem(members, 'p', 'k')).toBe('')
    expect(mergeProblem(members, 'p', 'p')).toMatch(/two different/)
    expect(mergeProblem(members, 'p', 'nobody')).toMatch(/two different/)
    expect(mergeProblem(members, 'k', 'b')).toMatch(/own accounts/)
    expect(mergeProblem(members, 'p', 'gone')).toMatch(/left/)
  })
  it('the entry with an account stays', () => {
    expect(mergeDirection(members, 'k', 'p')).toEqual({ from: 'p', into: 'k' })
    expect(mergeDirection(members, 'p', 'k')).toEqual({ from: 'p', into: 'k' })
    expect(mergeDirection(members, 'p', 'gone')).toEqual({ from: 'p', into: 'gone' })
  })
})

describe('folding one member into another', () => {
  it('adds amounts and keeps untouched maps as they were', () => {
    const m = { p: 300, k: 200, b: 100 }
    expect(foldMap(m, 'p', 'k')).toEqual({ k: 500, b: 100 })
    expect(foldMap({ p: 300, b: 100 }, 'p', 'k')).toEqual({ k: 300, b: 100 })
    expect(foldMap(m, 'x', 'k')).toBe(m)
    expect(foldMap(undefined, 'p', 'k')).toBeUndefined()
  })
  it('lists name the person once', () => {
    expect(foldList(['p', 'k', 'b'], 'p', 'k')).toEqual(['k', 'b'])
    expect(foldList(['p', 'b'], 'p', 'k')).toEqual(['k', 'b'])
    const l = ['b']
    expect(foldList(l, 'p', 'k')).toBe(l)
  })
})

describe('mergeExpense', () => {
  it('sums who paid and who owes, and rewrites the split inputs and items', () => {
    const e = {
      paidBy: { p: 600 },
      splits: { p: 200, k: 200, b: 200 },
      splitInput: {
        selected: ['p', 'k', 'b'],
        items: [
          { name: 'Beer', amount: 300, members: ['p', 'k'], shares: { p: 2, k: 1 } },
          { name: 'Tea', amount: 300, members: ['b'] },
        ],
      },
    }
    expect(mergeExpense(e, 'p', 'k')).toEqual({
      paidBy: { k: 600 },
      splits: { k: 400, b: 200 },
      splitInput: {
        selected: ['k', 'b'],
        items: [
          { name: 'Beer', amount: 300, members: ['k'], shares: { k: 3 } },
          { name: 'Tea', amount: 300, members: ['b'] },
        ],
      },
    })
  })
  it('a flag raised about the merged person points at the one that stays', () => {
    const e = { paidBy: { b: 100 }, splits: { b: 100 }, dispute: { u2: { memberId: 'p', reason: 'x' } } }
    expect(mergeExpense(e, 'p', 'k')).toEqual({ dispute: { u2: { memberId: 'k', reason: 'x' } } })
  })
  it('null for an expense that never names them', () => {
    expect(mergeExpense({ paidBy: { b: 100 }, splits: { b: 50, k: 50 }, splitInput: { selected: ['b', 'k'] } }, 'p', 'k')).toBeNull()
  })
})

describe('payments, open items and Pay me links', () => {
  it('a payment between the two goes; others point at the one that stays', () => {
    expect(mergeSettlement({ from: 'p', to: 'k' }, 'p', 'k')).toBe('delete')
    expect(mergeSettlement({ from: 'k', to: 'p' }, 'p', 'k')).toBe('delete')
    expect(mergeSettlement({ from: 'p', to: 'b' }, 'p', 'k')).toEqual({ from: 'k' })
    expect(mergeSettlement({ from: 'b', to: 'p' }, 'p', 'k')).toEqual({ to: 'k' })
    expect(mergeSettlement({ from: 'b', to: 'k' }, 'p', 'k')).toBeNull()
  })
  it('open items name the person once', () => {
    expect(mergeOpenItem({ suspects: ['p', 'k'] }, 'p', 'k')).toEqual({ suspects: ['k'] })
    expect(mergeOpenItem({ suspects: ['b'] }, 'p', 'k')).toBeNull()
    expect(mergeOpenItem({}, 'p', 'k')).toBeNull()
  })
  it('Pay me links and their parts', () => {
    const link = { from: 'p', to: 'b', parts: [{ from: 'p', to: 'b', amount: 1 }] }
    expect(mergePayLink(link, 'p', 'k')).toEqual({
      from: 'k',
      parts: [{ from: 'k', to: 'b', amount: 1 }],
    })
    expect(mergePayLink({ from: 'b', to: 'k' }, 'p', 'k')).toBeNull()
  })
})

describe('mergedEntries', () => {
  it('the one that stays gains the email it lacked; the other is marked merged', () => {
    expect(mergedEntries(members, 'p', 'k', 9)).toEqual({ into: { email: 'priya@x.com' }, from: { removedAt: 9, mergedInto: 'k' } })
    expect(mergedEntries({ a: { name: 'A', email: 'a@x.com' }, b: { name: 'B', email: 'b@x.com' } }, 'a', 'b', 9).into).toEqual({})
  })
})

describe('mergeApprover', () => {
  const g = {
    createdBy: 'u0',
    memberUids: ['u0', 'u1', 'u2'],
    members: { a: { name: 'Asha', uid: 'u0' }, k: { name: 'Priya', uid: 'u1' }, p: { name: 'Priya (work)' } },
  }
  it('merging into someone with an account needs them, unless they ask', () => {
    expect(mergeApprover(g, 'k', 'u2')).toBe('u1')
    expect(mergeApprover(g, 'k', 'u0')).toBe('u1')
    expect(mergeApprover(g, 'k', 'u1')).toBeNull()
  })
  it('otherwise the creator, when they asked for it; never someone who left', () => {
    expect(mergeApprover(g, 'p', 'u2')).toBeNull()
    expect(mergeApprover({ ...g, mergeNeedsOk: true }, 'p', 'u2')).toBe('u0')
    expect(mergeApprover({ ...g, mergeNeedsOk: true }, 'p', 'u0')).toBeNull()
    expect(mergeApprover({ ...g, memberUids: ['u0', 'u2'] }, 'k', 'u2')).toBeNull()
  })
})
