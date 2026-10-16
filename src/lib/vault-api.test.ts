import { describe, expect, it } from 'vitest'
import { patternProblem, stepOf, vaultRefusal } from './vault-api'

describe('vault api', () => {
  it('checks a pattern the way the server does', () => {
    expect(patternProblem('TTLTL')).toMatch(/at least 6/)
    expect(patternProblem('TTTTTT')).toBe('Mix taps and long presses.')
    expect(patternProblem('TTLTLL')).toBeNull()
    expect(patternProblem('T'.repeat(16) + 'L'.repeat(17))).toMatch(/at most 32/)
  })
  it('a long press is 450 ms or more', () => {
    expect(stepOf(120)).toBe('T')
    expect(stepOf(449)).toBe('T')
    expect(stepOf(450)).toBe('L')
  })
  it('reads tries left and the lockout from a refusal', () => {
    expect(vaultRefusal({ details: { triesLeft: 2 } })).toEqual({ triesLeft: 2 })
    expect(vaultRefusal({ details: { lockedUntil: 9, x: 1 } })).toEqual({ lockedUntil: 9 })
    expect(vaultRefusal(new Error('x'))).toEqual({})
  })
})

describe('lock screen', () => {
  it('picks what to show from the status', async () => {
    const { lockMode, untilWords } = await import('./vault-api')
    expect(lockMode(undefined, 0)).toBe('loading')
    expect(lockMode(null, 0, true)).toBe('unavailable')
    expect(lockMode({ setUp: false, hasPasskey: false, triesLeft: 5 }, 0)).toBe('setup')
    expect(lockMode({ setUp: true, hasPasskey: true, triesLeft: 3 }, 0)).toBe('unlock')
    expect(lockMode({ setUp: true, hasPasskey: true, triesLeft: 0, lockedUntil: 10 }, 5)).toBe('lockedOut')
    expect(lockMode({ setUp: true, hasPasskey: true, triesLeft: 0, lockedUntil: 10 }, 10)).toBe('unlock')
    expect(untilWords(60_000, 0)).toBe('in 1 minute')
    expect(untilWords(15 * 60_000, 0)).toBe('in 15 minutes')
    expect(untilWords(90 * 60_000, 0)).toBe('in 2 hours')
  })
})
