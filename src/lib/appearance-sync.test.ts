import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideSync, isDefaultAppearance, localAppearance, parseAppearance, startAppearanceSync, toAppearanceDoc } from './appearance-sync'
import { getLookPref, resetLookPref } from './look-pref'
import { DEFAULT_MOTION, resetMotion } from './motion'
import { notePrefChange } from './pref-events'

// vitest runs in node: a minimal localStorage, <html> and matchMedia for the setters.
const store = new Map<string, string>()
const attrs = new Map<string, string>()
beforeEach(() => {
  store.clear()
  const g = globalThis as Record<string, unknown>
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  }
  g.matchMedia = () => ({ matches: false, addEventListener() {} })
  g.document = {
    documentElement: {
      classList: { toggle() {} },
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      style: { setProperty() {} },
    },
    querySelector: () => null,
  }
  // motion.ts and look-pref.ts cache what they last read; start each test from the default.
  resetMotion()
  resetLookPref()
})
afterEach(() => {
  const g = globalThis as Record<string, unknown>
  delete g.localStorage
  delete g.document
  delete g.matchMedia
  vi.useRealTimers()
})

describe('parseAppearance', () => {
  it('needs a time; everything else falls back to the defaults', () => {
    expect(parseAppearance(null)).toBeNull()
    expect(parseAppearance({ theme: 'dark' })).toBeNull()
    const a = parseAppearance({ theme: 'sepia', accent: 'rainbow', duo: 'x', inks: { ocean: 'dark', nope: 'dark', koi: 'grey' }, motion: 'on', updatedAt: 5 })
    expect(a).toEqual({ theme: 'system', accent: 'violet', duo: true, inks: { ocean: 'dark' }, motion: DEFAULT_MOTION, look: 'app', updatedAt: 5 })
  })
  it('round-trips through the document', () => {
    const a = {
      theme: 'dark' as const,
      accent: 'koi' as const,
      duo: false,
      inks: { koi: 'dark' as const },
      motion: { ...DEFAULT_MOTION, speed: 'fast' as const },
      look: 'tooltip' as const,
      updatedAt: 7,
    }
    expect(parseAppearance(toAppearanceDoc(a))).toEqual(a)
  })
})

describe('decideSync', () => {
  const remote = (updatedAt: number) => ({
    theme: 'dark' as const,
    accent: 'ocean' as const,
    duo: true,
    inks: {},
    motion: DEFAULT_MOTION,
    look: 'app' as const,
    updatedAt,
  })
  it('takes a newer copy from the account, sends a newer local change', () => {
    expect(decideSync(0, remote(5), true)).toBe('pull')
    expect(decideSync(0, remote(5), false)).toBe('pull')
    expect(decideSync(9, remote(5), false)).toBe('push')
    expect(decideSync(5, remote(5), false)).toBe('none')
  })
  it('with nothing on the account, uploads only a look someone chose', () => {
    expect(decideSync(0, null, true)).toBe('none')
    expect(decideSync(0, null, false)).toBe('push')
    expect(decideSync(3, null, true)).toBe('push')
  })
})

describe('isDefaultAppearance', () => {
  it('is true for a fresh device', () => {
    expect(isDefaultAppearance(localAppearance())).toBe(true)
    store.set('splitit-accent', 'ocean')
    expect(isDefaultAppearance(localAppearance())).toBe(false)
    store.delete('splitit-accent')
    store.set('splitnow-look', 'tooltip')
    resetLookPref()
    expect(isDefaultAppearance(localAppearance())).toBe(false)
  })
})

describe('startAppearanceSync', () => {
  it('a fresh device takes the account’s look without sending anything back', () => {
    const save = vi.fn(async () => {})
    let answer: (raw: unknown) => void = () => {}
    const stop = startAppearanceSync((cb) => {
      answer = cb
      return () => {}
    }, save)
    answer({ theme: 'dark', accent: 'ocean', duo: false, inks: {}, motion: { on: false }, look: 'minimal', updatedAt: 50 })
    expect(store.get('splitit-accent')).toBe('ocean')
    expect(store.get('splitit-theme')).toBe('dark')
    expect(store.get('splitit-duo')).toBe('off')
    expect(JSON.parse(store.get('splitit-motion') ?? '{}').on).toBe(false)
    expect(store.get('splitnow-appearance-at')).toBe('50')
    expect(getLookPref()).toBe('minimal')
    expect(save).not.toHaveBeenCalled()
    stop()
  })
  it('a change here is uploaded once, after a pause', () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    let answer: (raw: unknown) => void = () => {}
    const stop = startAppearanceSync(
      (cb) => {
        answer = cb
        return () => {}
      },
      save,
      100,
    )
    answer(null)
    expect(save).not.toHaveBeenCalled()
    store.set('splitit-accent', 'koi')
    notePrefChange()
    notePrefChange()
    vi.advanceTimersByTime(150)
    expect(save).toHaveBeenCalledTimes(1)
    expect((save.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ accent: 'koi' })
    stop()
  })
  it('an older copy on the account gets this device’s newer look', () => {
    const save = vi.fn(async () => {})
    store.set('splitnow-appearance-at', '100')
    store.set('splitit-accent', 'gold')
    let answer: (raw: unknown) => void = () => {}
    const stop = startAppearanceSync((cb) => {
      answer = cb
      return () => {}
    }, save)
    answer({ accent: 'ocean', updatedAt: 40 })
    expect(store.get('splitit-accent')).toBe('gold')
    expect(save).toHaveBeenCalledTimes(1)
    stop()
  })
})
