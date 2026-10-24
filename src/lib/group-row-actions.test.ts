import { describe, expect, it } from 'vitest'
import { groupRowActions } from './group-row-actions'

const base = { personal: false, archived: false, myBalance: 0, waitingOnYou: 0, locked: false }

describe('groupRowActions', () => {
  it('square: Archive only', () => {
    expect(groupRowActions(base)).toEqual([{ kind: 'archive' }])
  })
  it('owing or owed: Settle up, and no Archive until square or while something waits for your OK', () => {
    expect(groupRowActions({ ...base, myBalance: -500 })).toEqual([{ kind: 'settle' }])
    expect(groupRowActions({ ...base, waitingOnYou: 1 })).toEqual([])
  })
  it('archived: Unarchive; a wallet never settles; a locked private group has none', () => {
    expect(groupRowActions({ ...base, archived: true })).toEqual([{ kind: 'unarchive' }])
    expect(groupRowActions({ ...base, personal: true, myBalance: 900 })).toEqual([{ kind: 'archive' }])
    expect(groupRowActions({ ...base, locked: true, myBalance: 300 })).toEqual([])
  })
})
