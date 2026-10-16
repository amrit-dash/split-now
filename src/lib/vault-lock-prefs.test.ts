import { describe, expect, it } from 'vitest'
import { dueToLock, lockMinutesFor, lockOnLeave, minutesWords, parseLockPrefs, readLockPrefs, withGroupMinutes, writeLockPrefs } from './vault-lock-prefs'

describe('lock times', () => {
  it('a group’s own time, then the person’s, then the admin’s default', () => {
    const p = { minutes: 10, groups: { g: 2 } }
    expect(lockMinutesFor(p, 'g', 5)).toBe(2)
    expect(lockMinutesFor(p, 'h', 5)).toBe(10)
    expect(lockMinutesFor({}, 'h', 5)).toBe(5)
    expect(lockMinutesFor(p, undefined, 5)).toBe(10)
  })
  it('keeps only times it offers', () => {
    expect(parseLockPrefs('{"minutes":7,"groups":{"a":30,"b":"x"},"onLeave":false}')).toEqual({ groups: { a: 30 }, onLeave: false })
    expect(parseLockPrefs('not json')).toEqual({})
    expect(parseLockPrefs(null)).toEqual({})
    expect(lockOnLeave({})).toBe(true)
    expect(lockOnLeave({ onLeave: false })).toBe(false)
  })
  it('sets and clears a group’s own time', () => {
    const p = withGroupMinutes({ minutes: 5 }, 'g', 15)
    expect(p).toEqual({ minutes: 5, groups: { g: 15 } })
    expect(withGroupMinutes(p, 'g', undefined)).toEqual({ minutes: 5 })
  })
  it('stores and reads back, and survives storage that throws', () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    writeLockPrefs(store, { minutes: 30 })
    expect(readLockPrefs(store)).toEqual({ minutes: 30 })
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readLockPrefs(broken)).toEqual({})
    expect(() => writeLockPrefs(broken, {})).not.toThrow()
  })
  it('in words', () => {
    expect(minutesWords(5)).toBe('5 min')
    expect(minutesWords(60)).toBe('1 hour')
  })
})

describe('which groups lock when', () => {
  const idle = (id: string) => (id === 'short' ? 60_000 : 300_000)
  it('each after its own idle time, with the next one’s wait', () => {
    expect(dueToLock(['short', 'long'], 0, 30_000, idle)).toEqual({ lock: [], nextIn: 30_000 })
    expect(dueToLock(['short', 'long'], 0, 60_000, idle)).toEqual({ lock: ['short'], nextIn: 240_000 })
    expect(dueToLock(['long'], 0, 400_000, idle)).toEqual({ lock: ['long'], nextIn: null })
    expect(dueToLock([], 0, 0, idle)).toEqual({ lock: [], nextIn: null })
  })
})
