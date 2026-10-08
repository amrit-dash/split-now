import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LINGER_MS, clearSharedStore, peekShared, peekSharedMeta, sharedStoreSize, subscribeShared } from './store'
import type { SnapMeta } from './repo'

type Cb = (v: number[], m?: SnapMeta) => void

/** A fake repo watcher: counts starts/stops and lets the test push values. */
function fakeWatch() {
  const open: Cb[] = []
  let starts = 0
  let stops = 0
  const start = (cb: Cb) => {
    starts++
    open.push(cb)
    return () => { stops++; open.splice(open.indexOf(cb), 1) }
  }
  const push = (v: number[], m?: SnapMeta) => open.forEach((cb) => cb(v, m))
  return { start, push, starts: () => starts, stops: () => stops, open: () => open.length }
}

describe('subscribeShared', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { clearSharedStore(); vi.useRealTimers() })

  it('opens one listener for many subscribers and fans values out', () => {
    const w = fakeWatch()
    const a = vi.fn(), b = vi.fn()
    subscribeShared('k', w.start, a)
    subscribeShared('k', w.start, b)
    expect(w.starts()).toBe(1)
    w.push([1], { fromCache: true, hasPendingWrites: false })
    expect(a).toHaveBeenCalledWith([1], { fromCache: true, hasPendingWrites: false })
    expect(b).toHaveBeenCalledWith([1], { fromCache: true, hasPendingWrites: false })
  })

  it('replays the last value synchronously to a late subscriber', () => {
    const w = fakeWatch()
    subscribeShared('k', w.start, () => {})
    w.push([1, 2])
    const late = vi.fn()
    subscribeShared('k', w.start, late)
    expect(late).toHaveBeenCalledTimes(1)
    expect(late).toHaveBeenCalledWith([1, 2], undefined)
    expect(peekShared('k')).toEqual([1, 2])
  })

  it('keeps the listener alive for a while after the last subscriber leaves', () => {
    const w = fakeWatch()
    const unsub = subscribeShared('k', w.start, () => {})
    unsub()
    expect(w.stops()).toBe(0)
    vi.advanceTimersByTime(LINGER_MS - 1)
    expect(w.stops()).toBe(0)
    // Coming back in time reuses the open listener and cancels the release.
    const again = subscribeShared('k', w.start, () => {})
    vi.advanceTimersByTime(LINGER_MS)
    expect(w.stops()).toBe(0)
    expect(w.starts()).toBe(1)
    again()
    vi.advanceTimersByTime(LINGER_MS)
    expect(w.stops()).toBe(1)
    expect(sharedStoreSize()).toBe(0)
  })

  it('unsubscribing twice is harmless', () => {
    const w = fakeWatch()
    const u1 = subscribeShared('k', w.start, () => {})
    const u2 = subscribeShared('k', w.start, () => {})
    u1(); u1()
    vi.advanceTimersByTime(LINGER_MS)
    expect(w.stops()).toBe(0) // u2 still holds it
    u2()
    vi.advanceTimersByTime(LINGER_MS)
    expect(w.stops()).toBe(1)
  })

  it('drops a failed query at once and restarts it for the next subscriber', () => {
    const w = fakeWatch()
    const unsub = subscribeShared('k', w.start, () => {})
    w.push([], { fromCache: true, hasPendingWrites: false, error: true })
    expect(peekSharedMeta('k')?.error).toBe(true)
    unsub()
    expect(w.stops()).toBe(1)
    expect(sharedStoreSize()).toBe(0)
    const cb = vi.fn()
    subscribeShared('k', w.start, cb)
    expect(w.starts()).toBe(2)
    expect(cb).not.toHaveBeenCalled() // the stale fallback isn't replayed
  })

  it('restarts a failed query even while a stale subscriber is leaving', () => {
    const w = fakeWatch()
    const u1 = subscribeShared('k', w.start, () => {})
    w.push([], { fromCache: true, hasPendingWrites: false, error: true })
    // A second screen subscribes while the failed entry is still held: it shares the entry
    // (nothing better exists) and gets the fallback.
    const u2 = subscribeShared('k', w.start, () => {})
    expect(w.starts()).toBe(1)
    u1(); u2()
    expect(sharedStoreSize()).toBe(0)
  })

  it('clearSharedStore stops everything and forgets values', () => {
    const w = fakeWatch()
    subscribeShared('a', w.start, () => {})
    subscribeShared('b', w.start, () => {})
    w.push([9])
    clearSharedStore()
    expect(w.open()).toBe(0)
    expect(peekShared('a')).toBeUndefined()
    expect(sharedStoreSize()).toBe(0)
  })

  it('a value that arrives synchronously during start is delivered to the first subscriber', () => {
    const cb = vi.fn()
    subscribeShared('sync', (l) => { l([7]); return () => {} }, cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith([7], undefined)
  })
})
