import { describe, expect, it } from 'vitest'
import { countVisit, dismissInstall, isInstallDismissed, shouldOfferInstall } from './install'

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
