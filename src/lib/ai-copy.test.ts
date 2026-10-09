import { describe, expect, it } from 'vitest'
import { aiAvailability, aiSummaryText } from './ai-copy'

describe('aiAvailability', () => {
  const app = (images: 'available' | 'off' | 'not_listed' | 'feature_off', sms = images) => ({ admin: false, app: { images, sms, model: 'm' } })
  it('off switch wins', () => {
    expect(aiAvailability({ status: app('available'), hasOwnKey: true, enabled: false })).toMatchObject({ images: false, sms: false, tone: 'muted' })
  })
  it('shared key available', () => {
    expect(aiAvailability({ status: app('available'), hasOwnKey: false, enabled: true })).toMatchObject({
      images: true,
      sms: true,
      text: 'Available',
      tone: 'ok',
    })
  })
  it('own key covers a shared key that is off or not listed', () => {
    expect(aiAvailability({ status: app('off'), hasOwnKey: true, enabled: true })).toMatchObject({ images: true, sms: true, text: 'Using your own key' })
    expect(aiAvailability({ status: app('not_listed'), hasOwnKey: false, enabled: true })).toMatchObject({
      images: false,
      text: 'Not turned on for your account',
      tone: 'muted',
    })
    expect(aiAvailability({ status: app('off'), hasOwnKey: true, ownKeyBroken: true, enabled: true })).toMatchObject({ images: false, tone: 'warn' })
  })
  it('partial availability names the feature', () => {
    expect(aiAvailability({ status: app('available', 'feature_off'), hasOwnKey: false, enabled: true })).toMatchObject({
      images: true,
      sms: false,
      text: 'Available for bills only',
    })
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

describe('aiSummaryText', () => {
  const app = (v: 'available' | 'off') => ({ app: { images: v, sms: v, model: 'm' } })
  const on = { aiEnabled: true, aiImages: true, aiSms: true, aiSource: 'auto' }
  it('says nothing in the demo and explains itself before prefs load', () => {
    expect(aiSummaryText({ mode: 'demo', prefs: on, hasOwnKey: false, status: app('available') })).toBeUndefined()
    expect(aiSummaryText({ mode: 'firebase', prefs: null, hasOwnKey: false, status: undefined })).toBe('Gemini reads bills, statements and hard-to-read SMS')
  })
  it('off, nothing selected, and what it reads', () => {
    expect(aiSummaryText({ mode: 'firebase', prefs: { aiEnabled: false }, hasOwnKey: false, status: null })).toBe('Off · bills are read on this phone')
    expect(aiSummaryText({ mode: 'firebase', prefs: { aiEnabled: true }, hasOwnKey: false, status: null })).toBe('On · nothing selected')
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSms: false }, hasOwnKey: false, status: app('available') })).toBe('On · Bills & statements')
  })
  it('warns only when no key can serve it, and not while the status is loading', () => {
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: false, status: app('off') })).toBe('On · Bills & statements, SMS · no key available')
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: false, status: undefined })).toBe('On · Bills & statements, SMS')
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: true, status: app('off') })).toBe('On · Bills & statements, SMS')
    // the shared key doesn't count when the person chose their own key only, and vice versa
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSource: 'own' }, hasOwnKey: false, status: app('available') })).toContain('no key available')
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSource: 'app' }, hasOwnKey: true, status: app('off') })).toContain('no key available')
  })
})
