import { describe, expect, it } from 'vitest'
import { inviteKey, linkCandidates, normEmail, pendingEmails, planLinks } from './link'

describe('normEmail', () => {
  it('lower-cases and trims real addresses, rejects the rest', () => {
    expect(normEmail(' Priya@Example.COM ')).toBe('priya@example.com')
    expect(normEmail('not an email')).toBe('')
    expect(normEmail(undefined)).toBe('')
  })
})

describe('linkCandidates', () => {
  const members = {
    me: { name: 'Asha', uid: 'u0', email: 'asha@x.com' },
    p1: { name: 'Priya', email: 'Priya@x.com' },
    p2: { name: 'Rahul' },
    p3: { name: 'Old', email: 'old@x.com', removedAt: 5 },
  }
  it('placeholders with an email, still in the group', () => {
    expect(linkCandidates(members)).toEqual([{ memberId: 'p1', email: 'priya@x.com' }])
  })
  it('with the group as it was, only new or changed entries', () => {
    expect(linkCandidates(members, members)).toEqual([])
    expect(linkCandidates(members, { ...members, p1: { name: 'Priya' } })).toEqual([{ memberId: 'p1', email: 'priya@x.com' }])
  })
})

describe('planLinks', () => {
  const candidates = [
    { memberId: 'p1', email: 'priya@x.com' },
    { memberId: 'p2', email: 'rahul@x.com' },
    { memberId: 'p3', email: 'sam@x.com' },
    { memberId: 'p4', email: 'asha@x.com' },
    { memberId: 'p5', email: 'priya@x.com' },
  ]
  const found = {
    'priya@x.com': { uid: 'u1', emailVerified: true },
    'rahul@x.com': { uid: 'u2', emailVerified: false },
    'asha@x.com': { uid: 'u0', emailVerified: true },
  }
  it('links verified accounts not already in the group, once each', () => {
    expect(planLinks({ candidates, memberUids: ['u0'], found })).toEqual([{ memberId: 'p1', uid: 'u1' }])
  })
  it('never an unverified, disabled or blocked account', () => {
    expect(planLinks({ candidates: candidates.slice(1, 2), memberUids: [], found })).toEqual([])
    expect(
      planLinks({ candidates: candidates.slice(0, 1), memberUids: [], found: { 'priya@x.com': { uid: 'u1', emailVerified: true, disabled: true } } }),
    ).toEqual([])
    expect(planLinks({ candidates: candidates.slice(0, 1), memberUids: [], found, blocked: new Set(['u1']) })).toEqual([])
  })
  it('stops at 60 accounts', () => {
    expect(planLinks({ candidates: candidates.slice(0, 1), memberUids: Array.from({ length: 60 }, (_, i) => `x${i}`), found })).toEqual([])
  })
  it('emails with no account are remembered', () => {
    expect(pendingEmails(candidates, found).map((c) => c.email)).toEqual(['sam@x.com'])
    expect(inviteKey('g1', 'p3')).toBe('g1__p3')
  })
})
