import { describe, expect, it } from 'vitest'
import { netBalances, pendingApprovers } from './balances-core'
import { activeMemberIds, activeMembers, formerMemberMatch, isRemoved } from './members'

const members: Record<string, { name: string; uid?: string; email?: string; removedAt?: number }> = {
  a: { name: 'Asha', uid: 'ua' },
  b: { name: 'Bo', removedAt: 5 },
  c: { name: 'Cy', email: 'cy@x.com', removedAt: 6 },
  d: { name: 'Dee', uid: 'ud', removedAt: 7 },
  e: { name: 'Eve' },
}

describe('activeMembers', () => {
  it('drops removed entries', () => {
    expect(Object.keys(activeMembers(members))).toEqual(['a', 'e'])
    expect(activeMemberIds(members)).toEqual(['a', 'e'])
    expect(isRemoved(members.b)).toBe(true)
    expect(isRemoved(members.a)).toBe(false)
    expect(isRemoved(undefined)).toBe(false)
  })
  it('returns the same object when nobody was removed, and caches per members object', () => {
    const plain = { a: { name: 'A' } }
    expect(activeMembers(plain)).toBe(plain)
    expect(activeMembers(members)).toBe(activeMembers(members))
    expect(activeMembers(undefined)).toEqual({})
  })
})

describe('formerMemberMatch', () => {
  it('finds the same person by account, email, or (placeholders) name', () => {
    expect(formerMemberMatch(members, { name: 'Someone', uid: 'ud' })).toBe('d')
    expect(formerMemberMatch(members, { name: 'Cyrus', email: 'CY@x.com ' })).toBe('c')
    expect(formerMemberMatch(members, { name: ' bo' })).toBe('b')
  })
  it('never matches someone still in the group, or a stranger', () => {
    expect(formerMemberMatch(members, { name: 'Eve' })).toBeUndefined()
    expect(formerMemberMatch(members, { name: 'Zed' })).toBeUndefined()
    // a removed account member is matched by account, not by a typed name
    expect(formerMemberMatch(members, { name: 'Dee' })).toBeUndefined()
  })
})

describe('balances with removed members', () => {
  const ex = [{ amount: 300, paidBy: { a: 300 }, splits: { a: 100, b: 100, e: 100 } }]
  const st = [{ from: 'b', to: 'a', amount: 100 }]
  it('a settled removed member has no balance and no suggested payment', () => {
    const net = netBalances(ex, st, { members })
    expect(net.b ?? 0).toBe(0)
  })
  it('old data with a non-zero balance still shows it (money is never hidden)', () => {
    const net = netBalances(ex, [], { members })
    expect(net.b).toBe(-100)
  })
  it('a removed member is never waited on for approval', () => {
    const e = { requiresApproval: true, splits: { a: 50, d: 50 }, createdBy: 'ua' }
    expect(pendingApprovers(e, members)).toEqual([])
  })
})
