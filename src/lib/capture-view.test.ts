import { describe, expect, it } from 'vitest'
import { captureView } from './capture-view'
import { LOOKS } from './look'

describe('captureView', () => {
  it('Full shows everything, set up or not (the page as it was)', () => {
    for (const k of [true, false]) expect(Object.values(captureView('full', k)).every(Boolean)).toBe(true)
  })
  it('before setup, the other looks show nothing to switch or filter', () => {
    for (const l of LOOKS.filter((l) => l !== 'full')) {
      const v = captureView(l, false)
      expect([v.master, v.scope, v.filters, v.trips, v.activity]).toEqual([false, false, false, false, false])
    }
    // Tooltip is a full-detail look: the Apple Pay path stays reachable before setup.
    expect(captureView('tooltip', false).advanced).toBe(true)
    expect(captureView('needed', false).advanced).toBe(false)
  })
  it('after setup, Minimal keeps what changes what gets captured', () => {
    expect(captureView('minimal', true)).toEqual({ master: true, scope: true, filters: false, trips: true, activity: false, advanced: false })
    expect(captureView('needed', true)).toEqual({ master: true, scope: true, filters: true, trips: true, activity: true, advanced: true })
    expect(Object.values(captureView('tooltip', true)).every(Boolean)).toBe(true)
  })
})
