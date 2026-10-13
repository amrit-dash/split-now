import { describe, expect, it } from 'vitest'
import { closedPlaces, pushDevice, pushPromptStep } from './push-prompt'

describe('pushPromptStep', () => {
  const base = { available: true, ios: false, standalone: false, supported: true, perm: 'default' as const, inGroup: true }

  it('asks for one Allow when the browser can ask', () => {
    expect(pushPromptStep(base)).toBe('allow')
    expect(pushPromptStep({ ...base, ios: true, standalone: true })).toBe('allow')
  })

  it('sends an iPhone browser tab to add the app first', () => {
    expect(pushPromptStep({ ...base, ios: true, supported: false, perm: 'unsupported' })).toBe('install')
  })

  it('shows how to unblock when notifications were blocked', () => {
    expect(pushPromptStep({ ...base, perm: 'denied' })).toBe('blocked')
  })

  it('stays away until the app is in use, once on, without push, or in the demo', () => {
    expect(pushPromptStep({ ...base, inGroup: false })).toBeNull()
    expect(pushPromptStep({ ...base, perm: 'granted' })).toBeNull()
    expect(pushPromptStep({ ...base, supported: false, perm: 'unsupported' })).toBeNull()
    expect(pushPromptStep({ ...base, available: false })).toBeNull()
  })
})

describe('pushDevice', () => {
  it('tells the devices apart by where their notification settings live', () => {
    expect(pushDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', true)).toBe(
      'iphone',
    )
    expect(pushDevice('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36', false)).toBe('android')
    expect(pushDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', false)).toBe('mac-safari')
    expect(pushDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', false)).toBe('desktop')
    expect(pushDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', false)).toBe('firefox')
  })
})

describe('closedPlaces', () => {
  it('reads the places closed on this device and ignores anything else', () => {
    expect(closedPlaces(null)).toEqual([])
    expect(closedPlaces('["home"]')).toEqual(['home'])
    expect(closedPlaces('["home","settings","inbox",3]')).toEqual(['home', 'settings'])
    expect(closedPlaces('not json')).toEqual([])
    expect(closedPlaces('{"home":true}')).toEqual([])
  })
})
