import { describe, expect, it } from 'vitest'
import { pushOffer } from './push'

describe('turn on notifications offer', () => {
  const base = { available: true, ios: false, standalone: false, supported: true, perm: 'default' as const }
  it('offers one tap when push can be turned on here', () => {
    expect(pushOffer(base)).toBe('enable')
  })
  it('asks iPhone browser tabs to install the app first', () => {
    expect(pushOffer({ ...base, ios: true })).toBe('install')
    expect(pushOffer({ ...base, ios: true, standalone: true })).toBe('enable')
  })
  it('stays quiet when on, blocked, unsupported or not in this build', () => {
    expect(pushOffer({ ...base, perm: 'granted' })).toBeNull()
    expect(pushOffer({ ...base, perm: 'denied' })).toBeNull()
    expect(pushOffer({ ...base, supported: false, perm: 'unsupported' })).toBeNull()
    expect(pushOffer({ ...base, available: false })).toBeNull()
    expect(pushOffer({ ...base, available: false, ios: true })).toBeNull()
  })
})
