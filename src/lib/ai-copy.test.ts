import { describe, expect, it } from 'vitest'
import { aiAvailability } from './ai-copy'

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
  it('copy never blames the user', () => {
    for (const s of [app('off'), app('not_listed'), app('feature_off'), null, undefined]) {
      expect(aiAvailability({ status: s, hasOwnKey: false, enabled: true }).text).not.toMatch(/error|fail|!/i)
    }
  })
})
