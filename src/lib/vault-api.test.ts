import { describe, expect, it } from 'vitest'
import {
  aiAfterPick,
  scanOnDeviceFirst,
  groupPatternProblem,
  lockButton,
  privateMenuShown,
  withoutLocked,
  patternProblem,
  refusalKind,
  shouldSend,
  setupLines,
  stepOf,
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

describe('settings', () => {
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

describe('pickers', () => {
  it('leave out private groups that are locked here', () => {
    const gs = [{ id: 'a' }, { id: 'b', vault: true }, { id: 'c', vault: true }]
    expect(withoutLocked(gs, (id) => id === 'c').map((g) => g.id)).toEqual(['a', 'c'])
  })
})

describe('the lock button', () => {
  it('sends 6 or more presses; fewer only where the group has its own pattern', () => {
    expect(shouldSend('', {})).toBe(false)
    expect(shouldSend('T', {})).toBe(false)
    expect(shouldSend('TTLTL', {})).toBe(false)
    expect(shouldSend('TTLTLL', {})).toBe(true)
    expect(shouldSend('TL', { groupHasOwn: true })).toBe(true)
    expect(shouldSend('T'.repeat(33), { groupHasOwn: true })).toBe(false)
  })
  it('reads a refusal without showing it', () => {
    expect(refusalKind({ details: { triesLeft: 3 } })).toBe('wrong')
    expect(refusalKind({ details: { triesLeft: 0, lockedUntil: 9 } })).toBe('locked')
    expect(refusalKind({ code: 'functions/failed-precondition', message: 'Set up encrypted groups first: Settings → Encrypted groups.' })).toBe('setup')
    expect(refusalKind(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe('cancelled')
    expect(refusalKind(new Error('offline'))).toBe('other')
  })
})

describe('the group menu', () => {
  it('offers Private group to everyone in a private group, and to the creator of any other shared group', () => {
    expect(privateMenuShown({ vault: true }, false, false)).toBe(true)
    expect(privateMenuShown({ type: 'trip' }, true, true)).toBe(true)
    expect(privateMenuShown({ type: 'trip' }, false, true)).toBe(false)
    expect(privateMenuShown({ type: 'trip' }, true, false)).toBe(false)
    expect(privateMenuShown({ type: 'personal' }, true, true)).toBe(false)
  })
})

describe('the Scan tab', () => {
  it('reads on the phone first for someone with private groups, and uses the AI only for a group that isn’t private', () => {
    expect(scanOnDeviceFirst({ vaultsOn: true, hasPrivate: true })).toBe(true)
    expect(scanOnDeviceFirst({ vaultsOn: true, hasPrivate: false })).toBe(false)
    expect(scanOnDeviceFirst({ vaultsOn: false, hasPrivate: true })).toBe(false)
    expect(aiAfterPick({ readOnDevice: true, pickedPrivate: false, aiOn: true })).toBe(true)
    expect(aiAfterPick({ readOnDevice: true, pickedPrivate: true, aiOn: true })).toBe(false)
    expect(aiAfterPick({ readOnDevice: true, pickedPrivate: false, aiOn: false })).toBe(false)
    expect(aiAfterPick({ readOnDevice: false, pickedPrivate: false, aiOn: true })).toBe(false)
  })
})
