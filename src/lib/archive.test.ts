import { describe, expect, it } from 'vitest'
import { archiveRow } from './archive'

const base = { archived: false, personal: false, myBalance: 0, waitingOnYou: 0 }

describe('archiveRow', () => {
  it('lets you archive once you are square, and says it is only for you', () => {
    const r = archiveRow(base)
    expect(r).toMatchObject({ label: 'Archive', disabled: false })
    expect(r.hint).toMatch(/Only for you/)
  })
  it('asks you to settle up first while you owe or are owed', () => {
    expect(archiveRow({ ...base, myBalance: -500 })).toMatchObject({ disabled: true, hint: expect.stringMatching(/Settle up first/) })
    expect(archiveRow({ ...base, myBalance: 500 })).toMatchObject({ disabled: true })
  })
  it('waits while something involving you needs an OK', () => {
    expect(archiveRow({ ...base, waitingOnYou: 1 })).toMatchObject({ disabled: true })
  })
  it('always lets you unarchive, and lets a wallet archive any time', () => {
    expect(archiveRow({ ...base, archived: true, myBalance: 900 })).toMatchObject({ label: 'Unarchive', disabled: false })
    expect(archiveRow({ ...base, personal: true, myBalance: 900 })).toMatchObject({ label: 'Archive', disabled: false })
  })
})
