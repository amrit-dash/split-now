import { describe, expect, it } from 'vitest'
import { COOLDOWN_MS, isOpenPlaceholder, joinGate, memberIdFor, sharesAGroup } from './join-core'

describe('joining a private group', () => {
  it('one request at a time, and a day after a decline before asking again', () => {
    expect(joinGate(undefined, 0)).toEqual({ kind: 'ask' })
    expect(joinGate({ status: 'pending' }, 0)).toEqual({ kind: 'pending' })
    expect(joinGate({ status: 'declined', decidedAt: 100 }, 100 + COOLDOWN_MS - 1)).toEqual({ kind: 'cooldown', retryAt: 100 + COOLDOWN_MS })
    expect(joinGate({ status: 'declined', decidedAt: 100 }, 100 + COOLDOWN_MS)).toEqual({ kind: 'ask' })
    // approved and then left: may ask again
    expect(joinGate({ status: 'approved', decidedAt: 1 }, 2)).toEqual({ kind: 'ask' })
  })
  it('a placeholder is open while nobody has it and it is still in the group', () => {
    const m = { p1: { name: 'Priya' }, p2: { name: 'Dev', uid: 'u2' }, p3: { name: 'Old', removedAt: 5 } }
    expect(isOpenPlaceholder(m, 'p1')).toBe(true)
    expect(isOpenPlaceholder(m, 'p2')).toBe(false)
    expect(isOpenPlaceholder(m, 'p3')).toBe(false)
    expect(isOpenPlaceholder(m, 'nope')).toBe(false)
    expect(isOpenPlaceholder(m, undefined)).toBe(false)
  })
  it('someone who left comes back into their old entry', () => {
    expect(memberIdFor({ a: { uid: 'u1', removedAt: 3 } }, 'u1', 'x')).toBe('a')
    expect(memberIdFor({ a: { uid: 'u9' } }, 'u1234567890', 'x7')).toBe('m_u1234567_x7')
  })
  it('adds directly only someone already in another live group with the creator', () => {
    const gs = [
      { id: 'here', memberUids: ['me', 'you'] },
      { id: 'old', memberUids: ['me', 'them'], deletedAt: 1 },
      { id: 'trip', memberUids: ['me', 'pal'] },
    ]
    expect(sharesAGroup(gs, 'me', 'pal', 'here')).toBe(true)
    expect(sharesAGroup(gs, 'me', 'you', 'here')).toBe(false)
    expect(sharesAGroup(gs, 'me', 'them', 'here')).toBe(false)
  })
})
