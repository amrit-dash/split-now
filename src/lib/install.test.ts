import { describe, expect, it } from 'vitest'
import { countVisit, dismissInstall, isInstallDismissed, shouldOfferInstall, installMethod } from './install'

const mem = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}

describe('shouldOfferInstall', () => {
  it('waits for engagement', () => {
    expect(shouldOfferInstall({ visits: 1, hasExpense: false, dismissed: false })).toBe(false)
    expect(shouldOfferInstall({ visits: 2, hasExpense: false, dismissed: false })).toBe(true)
    expect(shouldOfferInstall({ visits: 1, hasExpense: true, dismissed: false })).toBe(true)
  })
  it('a dismiss is for good', () => {
    expect(shouldOfferInstall({ visits: 9, hasExpense: true, dismissed: true })).toBe(false)
  })
})

describe('countVisit', () => {
  it('counts a session once', () => {
    const local = mem()
    const session = mem()
    expect(countVisit(local, session)).toBe(1)
    expect(countVisit(local, session)).toBe(1)
    expect(countVisit(local, mem())).toBe(2)
  })
  it('survives missing or broken storage', () => {
    expect(countVisit(undefined, undefined)).toBe(1)
    const broken = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {},
    }
    expect(countVisit(broken, broken)).toBe(1)
  })
})

describe('dismiss', () => {
  it('persists', () => {
    const local = mem()
    expect(isInstallDismissed(local)).toBe(false)
    dismissInstall(local)
    expect(isInstallDismissed(local)).toBe(true)
    expect(isInstallDismissed(undefined)).toBe(false)
  })
})

describe('installMethod', () => {
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    oldMacSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
    androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
    androidChrome: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  }
  const m = (ua: string, o: Partial<{ installed: boolean; canPrompt: boolean; platform: string; touchPoints: number }> = {}) =>
    installMethod({ installed: false, canPrompt: false, ua, ...o })
  it('nothing once installed', () => {
    expect(m(UA.androidChrome, { installed: true, canPrompt: true })).toBeNull()
  })
  it('the browser’s own dialog when it offered one, on a phone or a computer', () => {
    expect(m(UA.androidChrome, { canPrompt: true })).toBe('prompt')
    expect(m(UA.winEdge, { canPrompt: true })).toBe('prompt')
    expect(m(UA.macChrome, { canPrompt: true })).toBe('prompt')
  })
  it('iPhone and iPad (which says it is a Mac) add to the Home Screen', () => {
    expect(m(UA.iphone)).toBe('ios')
    expect(m(UA.ipad, { platform: 'MacIntel', touchPoints: 5 })).toBe('ios')
  })
  it('Safari 17+ on a Mac adds to the Dock; older Safari can’t', () => {
    expect(m(UA.macSafari, { platform: 'MacIntel', touchPoints: 0 })).toBe('mac')
    expect(m(UA.oldMacSafari, { platform: 'MacIntel' })).toBeNull()
  })
  it('Chromium without its dialog yet, and Firefox on Android: the browser menu', () => {
    expect(m(UA.winEdge)).toBe('menu')
    expect(m(UA.androidChrome)).toBe('menu')
    expect(m(UA.androidFirefox)).toBe('menu')
  })
  it('Firefox on a computer can’t install', () => {
    expect(m(UA.winFirefox)).toBeNull()
  })
})
