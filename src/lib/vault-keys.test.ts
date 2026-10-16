import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVaultKey, isUnlocked, lockVault, onVaultChange, setVaultKey, startAutoLock } from './vault-keys'
import type { VaultKey } from './vault-crypto'

const key = (groupId: string) => ({ groupId }) as unknown as VaultKey

class FakeDoc {
  visibilityState: DocumentVisibilityState = 'visible'
  handlers = new Map<string, Set<() => void>>()
  addEventListener(t: string, h: () => void) {
    this.handlers.set(t, (this.handlers.get(t) ?? new Set()).add(h))
  }
  removeEventListener(t: string, h: () => void) {
    this.handlers.get(t)?.delete(h)
  }
  fire(t: string) {
    for (const h of this.handlers.get(t) ?? []) h()
  }
}

let leave = true

describe('vault keys', () => {
  let stop: () => void = () => {}
  const doc = new FakeDoc()
  beforeEach(() => {
    vi.useFakeTimers()
    lockVault()
    stop = startAutoLock(doc as unknown as Document, { idleMs: (id) => (id === 'slow' ? 120_000 : 60_000), onLeave: () => leave })
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })
  it('keeps keys in memory and tells listeners', () => {
    const heard: Array<string | null> = []
    const off = onVaultChange((g) => heard.push(g))
    setVaultKey(key('g1'))
    expect(isUnlocked('g1')).toBe(true)
    expect(getVaultKey('g2')).toBeNull()
    lockVault('g1')
    lockVault('g1') // already locked: no second event
    off()
    setVaultKey(key('g2'))
    expect(heard).toEqual(['g1', 'g1'])
  })
  it('locks after the idle time, and activity restarts it', () => {
    setVaultKey(key('g1'))
    vi.advanceTimersByTime(50_000)
    doc.fire('pointerdown')
    vi.advanceTimersByTime(50_000)
    expect(isUnlocked('g1')).toBe(true)
    vi.advanceTimersByTime(11_000)
    expect(isUnlocked('g1')).toBe(false)
  })
  it('locks everything when the app goes to the background', () => {
    setVaultKey(key('g1'))
    setVaultKey(key('g2'))
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(isUnlocked('g1') || isUnlocked('g2')).toBe(false)
    doc.visibilityState = 'visible'
  })
  it('each group after its own idle time; a pointer move counts', () => {
    setVaultKey(key('g1'))
    setVaultKey(key('slow'))
    vi.advanceTimersByTime(59_000)
    expect(isUnlocked('g1')).toBe(true)
    vi.advanceTimersByTime(2_000)
    expect(isUnlocked('g1')).toBe(false)
    expect(isUnlocked('slow')).toBe(true)
    doc.fire('pointermove')
    vi.advanceTimersByTime(119_000)
    expect(isUnlocked('slow')).toBe(true)
    vi.advanceTimersByTime(2_000)
    expect(isUnlocked('slow')).toBe(false)
  })
  it('with Lock when I leave off, the background keeps them open, and coming back checks the time', () => {
    leave = false
    setVaultKey(key('g1'))
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(isUnlocked('g1')).toBe(true)
    // a background tab's timers may not run: coming back after the idle time locks at once
    vi.setSystemTime(Date.now() + 61_000)
    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    expect(isUnlocked('g1')).toBe(false)
    leave = true
  })
})
