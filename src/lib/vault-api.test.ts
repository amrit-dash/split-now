import { describe, expect, it } from 'vitest'
import {
  buzzFor,
  groupPatternProblem,
  lockButton,
  patternProblem,
  refusalWords,
  setupLines,
  stepOf,
  unlockMode,
  untilWords,
  vaultRefusal,
  type VaultStatus,
} from './vault-api'

const base: VaultStatus = { serverReady: true, hasPasskey: true, universal: true, ordered: true, triesLeft: 5 }

describe('vault api', () => {
  it('checks a universal pattern the way the server does', () => {
    expect(patternProblem('TTLTL')).toMatch(/at least 6/)
    expect(patternProblem('TTTTTT')).toBe('Mix taps and long presses.')
    expect(patternProblem('TTLTLL')).toBeNull()
    expect(patternProblem('T'.repeat(16) + 'L'.repeat(17))).toMatch(/at most 32/)
  })
  it('a group’s own pattern can be any length', () => {
    expect(groupPatternProblem('T')).toBeNull()
    expect(groupPatternProblem('TTTT')).toBeNull()
    expect(groupPatternProblem('')).not.toBeNull()
    expect(groupPatternProblem('T'.repeat(33))).toMatch(/at most 32/)
  })
  it('a long press is 450 ms or more, and buzzes longer', () => {
    expect(stepOf(120)).toBe('T')
    expect(stepOf(449)).toBe('T')
    expect(stepOf(450)).toBe('L')
    expect(buzzFor('L')).toBeGreaterThan(buzzFor('T'))
  })
  it('reads tries left and the lockout from a refusal', () => {
    expect(vaultRefusal({ details: { triesLeft: 2 } })).toEqual({ triesLeft: 2 })
    expect(vaultRefusal({ details: { lockedUntil: 9, x: 1 } })).toEqual({ lockedUntil: 9 })
    expect(vaultRefusal(new Error('x'))).toEqual({})
    expect(refusalWords({ triesLeft: 1 }, 0, 'x')).toBe('That’s not it. 1 try left.')
    expect(refusalWords({ triesLeft: 0, lockedUntil: 15 * 60_000 }, 0, 'x')).toBe('Too many wrong patterns. Try again in 15 minutes.')
    expect(refusalWords({}, 0, 'Offline')).toBe('Offline')
  })
})

describe('unlock sheet', () => {
  it('picks what to show from the status', () => {
    expect(unlockMode(undefined, 0)).toBe('loading')
    expect(unlockMode(null, 0, true)).toBe('unavailable')
    expect(unlockMode({ ...base, serverReady: false }, 0)).toBe('unavailable')
    expect(unlockMode({ ...base, universal: false }, 0)).toBe('setup')
    // no universal pattern, but this group has its own: it opens with that
    expect(unlockMode({ ...base, universal: false, group: { keyReady: true, hasPattern: true } }, 0)).toBe('unlock')
    expect(unlockMode(base, 0)).toBe('unlock')
    expect(unlockMode({ ...base, triesLeft: 0, lockedUntil: 10 }, 5)).toBe('lockedOut')
    expect(unlockMode({ ...base, triesLeft: 0, lockedUntil: 10 }, 10)).toBe('unlock')
    expect(untilWords(60_000, 0)).toBe('in 1 minute')
    expect(untilWords(90 * 60_000, 0)).toBe('in 2 hours')
  })
  it('says what is set up', () => {
    expect(setupLines(base)).toMatchObject({ passkey: 'Passkey added', pattern: 'Universal pattern set · in order', ready: true })
    expect(setupLines({ ...base, ordered: false }).pattern).toBe('Universal pattern set · any order')
    expect(setupLines({ ...base, hasPasskey: false, universal: false }).ready).toBe(false)
  })
})

describe('groups lock button', () => {
  it('unlocks while any private group is locked, locks once all are open', () => {
    expect(lockButton([], () => true)).toBe('none')
    expect(lockButton(['a', 'b'], (id) => id === 'a')).toBe('unlock')
    expect(lockButton(['a', 'b'], () => true)).toBe('lock')
  })
})
