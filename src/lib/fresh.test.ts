import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRESH_MS, markCreated, rewatchWhileFresh, watchGroupSettled } from './fresh'

type Cb = (g: string | null) => void

/** A fake repo.watchGroup: each call is one listener; the test decides what it reports. */
function fakeWatch() {
  const listeners: Array<{ cb: Cb; open: boolean }> = []
  const watch = (_id: string, cb: Cb) => {
    const l = { cb, open: true }
    listeners.push(l)
    return () => { l.open = false }
  }
  const last = () => listeners[listeners.length - 1]
  return { watch, listeners, last }
}

describe('watchGroupSettled', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes "not found" straight on for a group not created here', () => {
    const f = fakeWatch()
    const cb = vi.fn()
    watchGroupSettled(f.watch, 'old', cb)
    f.last().cb(null)
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('retries a just-created group refused by the server until it shows up', () => {
    markCreated('g1')
    const f = fakeWatch()
    const cb = vi.fn()
    watchGroupSettled(f.watch, 'g1', cb)
    f.last().cb('cached') // latency-compensated snapshot
    f.last().cb(null) // listen refused: the create hadn't landed yet
    expect(cb.mock.calls).toEqual([['cached']])
    vi.advanceTimersByTime(300)
    expect(f.listeners).toHaveLength(2)
    expect(f.listeners[0].open).toBe(false)
    f.last().cb('server')
    expect(cb.mock.calls).toEqual([['cached'], ['server']])
  })

  it('gives up after the grace period', () => {
    markCreated('g2', Date.now() - FRESH_MS - 1)
    const f = fakeWatch()
    const cb = vi.fn()
    watchGroupSettled(f.watch, 'g2', cb)
    f.last().cb(null)
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('stops retrying once unsubscribed', () => {
    markCreated('g3')
    const f = fakeWatch()
    const cb = vi.fn()
    const unsub = watchGroupSettled(f.watch, 'g3', cb)
    f.last().cb(null)
    unsub()
    vi.advanceTimersByTime(10_000)
    expect(f.listeners).toHaveLength(1)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('rewatchWhileFresh', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('restarts a fresh group\'s list watcher a few times, then leaves it', () => {
    markCreated('g4')
    const stops: number[] = []
    let n = 0
    const start = () => { const i = n++; return () => { stops.push(i) } }
    const unsub = rewatchWhileFresh('g4', start)
    vi.advanceTimersByTime(FRESH_MS)
    expect(n).toBe(4)
    unsub()
    expect(stops).toEqual([0, 1, 2, 3])
  })

  it('subscribes once for other groups', () => {
    let n = 0
    rewatchWhileFresh('other', () => { n++; return () => {} })
    vi.advanceTimersByTime(FRESH_MS)
    expect(n).toBe(1)
  })
})
