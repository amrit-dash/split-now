import { describe, expect, it } from 'vitest'
import { aiAvailability, aiUnavailableText, ownKeyWouldHelp } from './ai-copy'

describe('aiUnavailableText', () => {
  it('has calm, non-blaming copy for every reason and a fallback', () => {
    for (const r of ['off', 'quota', 'not_listed', 'bad_key', 'server', 'not_configured', 'offline', 'demo', 'disabled']) {
      const t = aiUnavailableText(r)
      expect(t).not.toMatch(/error|fail|!/i)
      expect(t.length).toBeGreaterThan(10)
    }
    expect(aiUnavailableText(undefined)).toMatch(/phone/)
    expect(aiUnavailableText('something-new')).toMatch(/phone/)
  })
  it('only suggests a key where one would help', () => {
    expect(ownKeyWouldHelp('quota')).toBe(false)
    expect(ownKeyWouldHelp('server')).toBe(false)
    expect(ownKeyWouldHelp('offline')).toBe(false)
    expect(ownKeyWouldHelp('off')).toBe(true)
    expect(ownKeyWouldHelp('not_listed')).toBe(true)
    expect(ownKeyWouldHelp('bad_key')).toBe(true)
  })
})

describe('aiAvailability', () => {
  const app = (images: 'available' | 'off' | 'not_listed' | 'feature_off', sms = images) => ({ admin: false, app: { images, sms, model: 'm' } })
  it('off switch wins', () => {
    expect(aiAvailability({ status: app('available'), hasOwnKey: true, enabled: false })).toMatchObject({ images: false, sms: false, tone: 'muted' })
  })
  it('shared key available', () => {
    expect(aiAvailability({ status: app('available'), hasOwnKey: false, enabled: true })).toMatchObject({ images: true, sms: true, text: 'Available', tone: 'ok' })
  })
  it('own key covers a shared key that is off or not listed', () => {
    expect(aiAvailability({ status: app('off'), hasOwnKey: true, enabled: true })).toMatchObject({ images: true, sms: true, text: 'Using your own key' })
    expect(aiAvailability({ status: app('not_listed'), hasOwnKey: false, enabled: true })).toMatchObject({ images: false, text: 'Not turned on for your account', tone: 'muted' })
    expect(aiAvailability({ status: app('off'), hasOwnKey: true, ownKeyBroken: true, enabled: true })).toMatchObject({ images: false, tone: 'warn' })
  })
  it('partial availability names the feature', () => {
    expect(aiAvailability({ status: app('available', 'feature_off'), hasOwnKey: false, enabled: true })).toMatchObject({ images: true, sms: false, text: 'Available for bills only' })
  })
  it('unknown status: own key still counts', () => {
    expect(aiAvailability({ status: undefined, hasOwnKey: false, enabled: true }).text).toBe('Checking…')
    expect(aiAvailability({ status: null, hasOwnKey: true, enabled: true })).toMatchObject({ images: true, text: 'Using your own key' })
  })
})
