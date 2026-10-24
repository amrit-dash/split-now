import { describe, expect, it } from 'vitest'
import { quickAddKeyLine, aiAvailability, aiDataNote, aiReaderName, aiSummaryText, FREE_AI_NOTE, isQuietReason, unavailableText } from './ai-copy'

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
      text: 'Not turned on for your account. Add your own Gemini key to use AI',
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
  it('free AI (Gemma) serves only after the person agrees, and says how', () => {
    const gemma = (images: 'available' | 'off' = 'available') => ({ admin: false, app: { images, sms: images, model: 'm', engine: 'gemma' as const } })
    expect(aiAvailability({ status: gemma(), hasOwnKey: false, enabled: true })).toMatchObject({
      images: false,
      sms: false,
      text: 'Free AI is available. Turn on “Use free AI” to use it',
      tone: 'muted',
    })
    expect(aiAvailability({ status: gemma(), hasOwnKey: false, enabled: true, freeOk: true })).toMatchObject({
      images: true,
      text: 'Available · free AI, slower',
      tone: 'ok',
    })
    expect(aiAvailability({ status: gemma(), hasOwnKey: true, enabled: true })).toMatchObject({ images: true, text: 'Using your own key' })
    expect(aiAvailability({ status: gemma('off'), hasOwnKey: false, enabled: true }).text).toBe(
      'AI features aren’t available. Add your own Gemini key to use them',
    )
  })
  it('nothing available points to the own key', () => {
    expect(aiAvailability({ status: app('off'), hasOwnKey: false, enabled: true }).text).toBe(
      'AI features aren’t available. Add your own Gemini key to use them',
    )
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
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiQuickAdd: true }, hasOwnKey: false, status: app('available') })).toBe(
      'On · Bills & statements, SMS, Quick add',
    )
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSms: false, aiPayments: true }, hasOwnKey: false, status: app('available') })).toBe(
      'On · Bills & statements, Payment screenshots',
    )
  })
  it('warns only when no key can serve it, and not while the status is loading', () => {
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: false, status: app('off') })).toBe('On · Bills & statements, SMS · no key available')
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: false, status: undefined })).toBe('On · Bills & statements, SMS')
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: true, status: app('off') })).toBe('On · Bills & statements, SMS')
    // the shared key doesn't count when the person chose their own key only, and vice versa
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSource: 'own' }, hasOwnKey: false, status: app('available') })).toContain('no key available')
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiSource: 'app' }, hasOwnKey: true, status: app('off') })).toContain('no key available')
  })
  it('free AI counts only once the person agreed to it', () => {
    const gemma = { app: { images: 'available' as const, sms: 'available' as const, model: 'm', engine: 'gemma' as const } }
    expect(aiSummaryText({ mode: 'firebase', prefs: on, hasOwnKey: false, status: gemma })).toContain('no key available')
    expect(aiSummaryText({ mode: 'firebase', prefs: { ...on, aiFreeOk: true }, hasOwnKey: false, status: gemma })).toBe('On · Bills & statements, SMS')
  })
})

describe('unavailableText', () => {
  it('says the phone reads it instead, by default', () => {
    expect(unavailableText('quota')).toBe('You’ve used today’s AI limit. Read on your phone for now.')
    expect(unavailableText('quota', { limit: 20 })).toBe('You’ve used today’s AI limit (20). Read on your phone for now.')
    expect(unavailableText('bad_key')).toBe('Google rejected the Gemini key. Check it in Settings → AI features; reading on your phone instead.')
    expect(unavailableText('server')).toBe('Gemini didn’t answer. Reading on your phone instead.')
    expect(unavailableText('not_listed')).toBe('AI reading is limited to listed accounts. Reading on your phone instead.')
    expect(unavailableText('not_configured')).toBe('AI reading isn’t set up for this app. Reading on your phone instead.')
    expect(unavailableText('off')).toBe('AI reading is off. Reading on your phone instead.')
    expect(unavailableText(undefined)).toBe('AI reading isn’t available right now. Reading on your phone instead.')
    expect(unavailableText('needs_ok')).toBe('Free AI is off until you turn on “Use free AI” in Settings → AI features. Reading on your phone instead.')
  })
  it('drops the phone line where there is no on-phone fallback', () => {
    const reasons = ['quota', 'bad_key', 'server', 'not_listed', 'not_configured', 'off', 'needs_ok', undefined] as const
    for (const r of reasons) expect(unavailableText(r, { onPhone: false })).not.toMatch(/phone/i)
    expect(unavailableText('quota', { limit: 20, onPhone: false })).toBe('You’ve used today’s AI limit (20).')
    expect(unavailableText('bad_key', { onPhone: false })).toBe('Google rejected the Gemini key. Check it in Settings → AI features.')
    expect(unavailableText('server', { onPhone: false })).toBe('Gemini didn’t answer.')
    expect(unavailableText(undefined, { onPhone: false })).toBe('AI reading isn’t available right now.')
  })
})

describe('isQuietReason', () => {
  it('is quiet only for nothing-to-fix reasons', () => {
    expect(['off', 'not_listed', 'not_configured', 'needs_ok'].every((r) => isQuietReason(r as 'off'))).toBe(true)
    expect(['quota', 'bad_key', 'server', undefined].some((r) => isQuietReason(r as 'quota'))).toBe(false)
  })
})

describe('aiDataNote', () => {
  const st = (v: 'available' | 'off', engine?: 'gemini' | 'gemma') => ({ app: { images: v, sms: v, model: 'm', engine } })
  it('on Split Now’s Gemini key says where the data goes and that it stays out of training', () => {
    const t = aiDataNote(st('available', 'gemini'))
    expect(t).toContain('Mumbai (Google Cloud, asia-south1)')
    expect(t).toContain('paid Gemini API')
    expect(t).not.toMatch(/free/i)
  })
  it('on the free AI points to the switch that carries the warning, which names the trade and the regions', () => {
    expect(aiDataNote(st('available', 'gemma'))).toContain('Gemma, Google’s free model, only if you turn on “Use free AI”')
    expect(FREE_AI_NOTE).toMatch(/may use what you send/)
    expect(FREE_AI_NOTE).toMatch(/payment screenshots, bank SMS/)
    expect(FREE_AI_NOTE).toMatch(/EU, the UK or Switzerland/)
  })
  it('with no shared AI claims nothing about it', () => {
    for (const s of [st('off', 'gemma'), st('off'), null, undefined]) expect(aiDataNote(s)).not.toMatch(/Mumbai|Gemma/)
  })
})

describe('aiReaderName', () => {
  const o = { free: true, freeOk: false, source: 'auto', hasOwnKey: false, appAvailable: true }
  it('free AI off: never Gemma', () => {
    expect(aiReaderName(o)).toBe('the AI')
    expect(aiReaderName({ ...o, hasOwnKey: true })).toBe('Gemini')
  })
  it('free AI on: Gemma first on Automatic and Only Split Now’s key', () => {
    expect(aiReaderName({ ...o, freeOk: true, hasOwnKey: true })).toBe('Gemma')
    expect(aiReaderName({ ...o, freeOk: true, source: 'app', hasOwnKey: true })).toBe('Gemma')
  })
  it('Only my key: their Gemini key, never Gemma', () => {
    expect(aiReaderName({ ...o, freeOk: true, source: 'own', hasOwnKey: true })).toBe('Gemini')
    expect(aiReaderName({ ...o, freeOk: true, source: 'own' })).toBe('the AI')
  })
  it('Split Now’s paid key is Gemini', () => {
    expect(aiReaderName({ ...o, free: false })).toBe('Gemini')
    expect(aiReaderName({ ...o, free: false, appAvailable: false })).toBe('the AI')
  })
})

describe('quickAddKeyLine', () => {
  const base = { free: true, freeOk: true, source: 'auto', hasOwnKey: false, appAvailable: true }
  it('the free AI: says so, with the note about your own key', () => {
    expect(quickAddKeyLine(base)).toEqual({
      uses: 'Uses Split Now’s free AI (Gemma)',
      note: 'The free AI misreads some long or uneven lines. Add your own Gemini key below for the best results.',
    })
  })
  it('your own key, or Split Now’s paid one: no note', () => {
    expect(quickAddKeyLine({ ...base, source: 'own', hasOwnKey: true })).toEqual({ uses: 'Uses your own key (Gemini)' })
    expect(quickAddKeyLine({ ...base, freeOk: false, hasOwnKey: true })).toEqual({ uses: 'Uses your own key (Gemini)' })
    expect(quickAddKeyLine({ ...base, free: false })).toEqual({ uses: 'Uses Split Now’s key (Gemini)' })
  })
  it('nothing can read for them: no line', () => {
    expect(quickAddKeyLine({ ...base, freeOk: false })).toBeNull()
  })
})
