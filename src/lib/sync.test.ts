import { describe, expect, it } from 'vitest'
import { SAVING_AFTER_MS, syncNotice, syncText } from './sync'

describe('syncNotice', () => {
  it('says nothing while online and in sync, or while a save is still quick', () => {
    expect(syncNotice({ pending: 0, online: true, waitedMs: 0 })).toBeNull()
    expect(syncNotice({ pending: 2, online: true, waitedMs: SAVING_AFTER_MS - 1 })).toBeNull()
  })
  it('a slow save shows Saving…', () => {
    expect(syncNotice({ pending: 1, online: true, waitedMs: SAVING_AFTER_MS })).toEqual({ kind: 'saving', pending: 1 })
  })
  it('offline always shows, with what is waiting', () => {
    expect(syncNotice({ pending: 0, online: false, waitedMs: 0 })).toEqual({ kind: 'offline', pending: 0 })
    expect(syncNotice({ pending: 3, online: false, waitedMs: 0 })).toEqual({ kind: 'offline', pending: 3 })
  })
})

describe('syncText', () => {
  it('reads plainly', () => {
    expect(syncText({ kind: 'saving', pending: 1 })).toBe('Saving your change…')
    expect(syncText({ kind: 'saving', pending: 4 })).toBe('Saving 4 changes…')
    expect(syncText({ kind: 'offline', pending: 0 })).toBe('Offline — changes will sync when you’re back')
    expect(syncText({ kind: 'offline', pending: 1 })).toBe('Offline — 1 change is saved on this phone and will sync when you’re back')
    expect(syncText({ kind: 'offline', pending: 2 })).toBe('Offline — 2 changes are saved on this phone and will sync when you’re back')
  })
})
