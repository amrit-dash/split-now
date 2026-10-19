import { describe, expect, it } from 'vitest'
import {
  stepMark,
  stepsSpoken,
  tryStillWanted,
  privateOffered,
  privateOn,
  privateSummary,
  statusCheckWanted,
  setupPrompt,
  suggestTurningOn,
  vaultView,
  stopPlan,
  firstPhase,
  phasePrompt,
  addPlan,
  addRefusal,
  askAgainWords,
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

describe('joining and adding to a private group', () => {
  it('only its creator adds people; a known account joins at once, a name is a placeholder', () => {
    expect(addPlan({}, false, 'u1')).toBe('placeholder')
    expect(addPlan({ vault: true }, false, 'u1')).toBe('forbidden')
    expect(addPlan({ vault: true }, false)).toBe('forbidden')
    expect(addPlan({ vault: true }, true, 'u1')).toBe('contact')
    expect(addPlan({ vault: true }, true)).toBe('placeholder')
    // new people need the creator's OK: only they add people, as placeholders
    expect(addPlan({ approveJoins: true }, false)).toBe('forbidden')
    expect(addPlan({ approveJoins: true }, true, 'u1')).toBe('placeholder')
    expect(addRefusal({}, false)).toBeNull()
    expect(addRefusal({ approveJoins: true }, true)).toBeNull()
    expect(addRefusal({ approveJoins: true }, false)).toMatch(/need their OK/)
    expect(addRefusal({ vault: true }, false)).toMatch(/private group/)
  })
  it('says when someone may ask again', () => {
    expect(askAgainWords(30 * 60_000, 0)).toBe('in about an hour')
    expect(askAgainWords(5 * 3_600_000, 0)).toBe('in about 5 hours')
  })
})

describe('the pattern sheet', () => {
  it('asks for a pattern that opens it before a new one, except for a first universal pattern', () => {
    expect(firstPhase({ kind: 'universal', hasCurrent: false })).toBe('new')
    expect(firstPhase({ kind: 'universal', hasCurrent: true })).toBe('current')
    // a group's own: the universal pattern or its own, whether or not it has one yet
    expect(firstPhase({ kind: 'group', hasCurrent: false })).toBe('current')
    // a group being made: nobody has its pattern yet
    expect(firstPhase({ kind: 'group', hasCurrent: false, fresh: true })).toBe('new')
    expect(phasePrompt('current', 'universal')).toBe('Enter your current pattern')
    expect(phasePrompt('current', 'group')).toBe('Enter a pattern that opens this group')
    expect(phasePrompt('again', 'group')).toBe('Once more to be sure')
  })
})

describe('stopping private groups', () => {
  it('hides private groups from someone who stopped, except the ones they are in', () => {
    expect(privateOffered(true, { privateGroupsOn: true })).toBe(true)
    expect(privateOffered(true, { privateGroupsOff: true })).toBe(false)
    expect(privateOffered(false, { privateGroupsOn: true })).toBe(false)
    expect(privateMenuShown({ type: 'trip' }, true, false)).toBe(false)
    expect(privateMenuShown({ type: 'trip', vault: true }, false, false)).toBe(true)
    // the Groups screen's button: nothing to unlock with, but still locks what is open
    expect(lockButton(['a'], () => false, true)).toBe('none')
    expect(lockButton(['a'], () => true, true)).toBe('lock')
    expect(lockButton(['a'], () => false)).toBe('unlock')
  })
  it('start off: offered to make them only once turned on', () => {
    expect(privateOn({})).toBe(false)
    expect(privateOn(null)).toBe(false)
    expect(privateOffered(true, {})).toBe(false)
    expect(privateOn({ privateGroupsOn: true })).toBe(true)
    // the creator's menu: Make private only for someone offered private groups, never for a wallet
    expect(privateMenuShown({ type: 'trip' }, true, true)).toBe(true)
    expect(privateMenuShown({ type: 'trip' }, false, true)).toBe(false)
    expect(privateMenuShown({ type: 'personal' }, true, true)).toBe(false)
    // a private group they were added to is still theirs to open, on or off
    expect(privateMenuShown({ type: 'trip', vault: true }, false, false)).toBe(true)
  })
  it('counts someone from before as on as soon as the app knows they have a universal pattern', () => {
    expect(privateOn({}, { universal: true })).toBe(true)
    expect(privateOffered(true, {}, { universal: true })).toBe(true)
    expect(privateOn({}, { universal: false, on: true })).toBe(true)
    expect(privateOn({}, { universal: false })).toBe(false)
    // a stop wins, on the profile or in the answer
    expect(privateOn({ privateGroupsOff: true }, { universal: true })).toBe(false)
    expect(privateOn({ privateGroupsOn: true }, { universal: false, off: true })).toBe(false)
  })
  it('asks the server once per device for someone neither on nor off', () => {
    expect(statusCheckWanted(true, {}, false)).toBe(true)
    expect(statusCheckWanted(true, {}, true)).toBe(false)
    expect(statusCheckWanted(true, { privateGroupsOn: true }, false)).toBe(false)
    expect(statusCheckWanted(true, { privateGroupsOff: true }, false)).toBe(false)
    expect(statusCheckWanted(false, {}, false)).toBe(false)
    expect(statusCheckWanted(true, null, false)).toBe(false)
  })
  it('says on or off in Settings, and suggests turning on inside a private group', () => {
    expect(privateSummary(true)).toMatch(/^On/)
    expect(privateSummary(false)).toBe('Off')
    expect(vaultView({})).toBe('off')
    expect(vaultView({ on: true })).toBe('on')
    expect(vaultView({ off: true })).toBe('stopped')
    expect(suggestTurningOn(true, false, false)).toBe(true)
    expect(suggestTurningOn(true, true, false)).toBe(false)
    // someone who stopped chose to: no nudge
    expect(suggestTurningOn(true, false, true)).toBe(false)
    expect(suggestTurningOn(false, false, false)).toBe(false)
  })
  it('a lock button’s setup prompt says to turn private groups on first while they are off', () => {
    expect(setupPrompt(true, false)).toMatch(/^Private groups are off for you/)
    expect(setupPrompt(false, false)).toMatch(/Turn them on in Settings/)
    expect(setupPrompt(true, true)).toMatch(/^Set your universal pattern to open/)
    expect(setupPrompt(false, true)).toMatch(/^Set your universal pattern first/)
  })
  it('says what keeps them from stopping', () => {
    expect(stopPlan({ made: 2 })).toBe('made')
    expect(stopPlan({ made: 0 })).toBe('ok')
    expect(stopPlan({ off: true, made: 0 })).toBe('stopped')
  })
})

describe('tries queued on a lock button', () => {
  it('a try drawn before the lock opened is dropped; one drawn after is sent', () => {
    expect(tryStillWanted(0, 0)).toBe(true)
    expect(tryStillWanted(0, 1)).toBe(false)
    expect(tryStillWanted(1, 1)).toBe(true)
  })
})

describe('the pad that sets a pattern', () => {
  it('shows a tap as a dot and a long press as a dash', () => {
    expect(['T', 'L', 'T'].map((s) => stepMark(s as 'T' | 'L'))).toEqual(['·', '–', '·'])
    expect(stepsSpoken(['T', 'L'])).toBe('2 steps: tap, long press')
    expect(stepsSpoken(['L'])).toBe('1 step: long press')
    expect(stepsSpoken([])).toBe('No steps yet')
  })
})
