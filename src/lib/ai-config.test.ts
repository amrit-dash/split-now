import { describe, expect, it } from 'vitest'
import {
  appKeyStatus,
  autoSourceHint,
  DEFAULT_APP_AI,
  DEFAULT_MODEL,
  DEFAULT_USER_AI,
  FALLBACK_MODELS,
  GEMMA_FALLBACK_MODELS,
  gemmaModels,
  gemmaPlanModels,
  needsFreeOk,
  planAi,
  resolveAppAi,
  resolveUserAi,
  looksLikeGeminiKey,
  usefulModels,
  userFeatureOn,
  withFallbacks,
} from './ai-config'

const app = (p: Partial<typeof DEFAULT_APP_AI> = {}) => ({ ...DEFAULT_APP_AI, ...p })
const user = (p: Partial<typeof DEFAULT_USER_AI> = {}) => ({ ...DEFAULT_USER_AI, ...p })

describe('planAi', () => {
  it('own key first, then the shared key, each with model fallbacks', () => {
    const plan = planAi({ feature: 'images', user: user({ aiModel: 'gemini-3-flash' }), app: app({ mode: 'everyone' }), hasOwnKey: true })
    expect(plan).toEqual([
      { key: 'own', models: ['gemini-3-flash', DEFAULT_MODEL, ...FALLBACK_MODELS] },
      { key: 'app', models: [DEFAULT_MODEL, ...FALLBACK_MODELS] },
    ])
  })
  it('pins a current lite model and never repeats one in the fallback list', () => {
    expect(DEFAULT_MODEL).toBe('gemini-3.5-flash-lite')
    expect(withFallbacks(undefined)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'])
    expect(withFallbacks('gemini-3.1-flash-lite')).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-flash-lite-latest',
    ])
  })
  it('respects the master switch, per-feature switches and source choice', () => {
    const base = { app: app({ mode: 'everyone' }), hasOwnKey: true }
    expect(planAi({ ...base, feature: 'images', user: user({ aiEnabled: false }) })).toEqual([])
    expect(planAi({ ...base, feature: 'sms', user: user({ aiSms: false }) })).toEqual([])
    expect(planAi({ ...base, feature: 'images', user: user({ aiSource: 'own' }) }).map((p) => p.key)).toEqual(['own'])
    expect(planAi({ ...base, feature: 'images', user: user({ aiSource: 'app' }) }).map((p) => p.key)).toEqual(['app'])
    expect(planAi({ ...base, hasOwnKey: false, feature: 'images', user: user({ aiSource: 'own' }) })).toEqual([])
  })
  it('shared key: off by default, allow-list by email, per-feature', () => {
    expect(planAi({ feature: 'images', user: user(), app: app(), hasOwnKey: false })).toEqual([])
    const listed = app({ mode: 'allowlist', allowEmails: ['amrit@example.com'] })
    expect(planAi({ feature: 'images', user: user(), app: listed, hasOwnKey: false, email: 'Amrit@Example.com' })).toHaveLength(1)
    expect(planAi({ feature: 'images', user: user(), app: listed, hasOwnKey: false, email: 'x@y.z' })).toEqual([])
    expect(planAi({ feature: 'sms', user: user(), app: app({ mode: 'everyone', sms: false }), hasOwnKey: false })).toEqual([])
  })
  it('Quick add with AI is opt-in, and on the shared key follows the bills switch and allowance', () => {
    const base = { app: app({ mode: 'everyone' }), hasOwnKey: false }
    expect(DEFAULT_USER_AI.aiQuickAdd).toBe(false)
    expect(planAi({ ...base, feature: 'quickAdd', user: user() })).toEqual([])
    expect(planAi({ ...base, feature: 'quickAdd', user: user({ aiQuickAdd: true }) }).map((p) => p.key)).toEqual(['app'])
    expect(planAi({ ...base, feature: 'quickAdd', user: user({ aiQuickAdd: true, aiEnabled: false }) })).toEqual([])
    // Not tied to the person's bills switch, only to the admin's shared-key switch for bills.
    expect(planAi({ ...base, feature: 'quickAdd', user: user({ aiQuickAdd: true, aiImages: false }) })).toHaveLength(1)
    expect(planAi({ ...base, app: app({ mode: 'everyone', images: false }), feature: 'quickAdd', user: user({ aiQuickAdd: true }) })).toEqual([])
    expect(appKeyStatus(app({ mode: 'everyone', images: false }), 'quickAdd', 'a@b.c')).toBe('feature_off')
    expect(userFeatureOn(user({ aiQuickAdd: true }), 'quickAdd')).toBe(true)
    expect(userFeatureOn(user({ aiQuickAdd: true }), 'sms')).toBe(false)
    expect(resolveUserAi({ aiQuickAdd: true }).aiQuickAdd).toBe(true)
    expect(resolveUserAi({ aiQuickAdd: 'yes' }).aiQuickAdd).toBe(false)
  })
  it('status explains why the shared key is unavailable', () => {
    expect(appKeyStatus(app(), 'images', 'a@b.c')).toBe('off')
    expect(appKeyStatus(app({ mode: 'everyone', images: false }), 'images', 'a@b.c')).toBe('feature_off')
    expect(appKeyStatus(app({ mode: 'allowlist' }), 'images', 'a@b.c')).toBe('not_listed')
    expect(appKeyStatus(app({ mode: 'everyone' }), 'sms', undefined)).toBe('available')
  })
})

describe('Gemma (free AI on the shared key)', () => {
  const gemma = app({ engine: 'gemma', mode: 'everyone' })
  it('is used only once the person agrees, never falls back to a paid model, and the own key still goes first', () => {
    expect(DEFAULT_USER_AI.aiFreeOk).toBe(false)
    expect(planAi({ feature: 'images', user: user(), app: gemma, hasOwnKey: false })).toEqual([])
    expect(needsFreeOk({ feature: 'images', user: user(), app: gemma })).toBe(true)
    expect(planAi({ feature: 'images', user: user({ aiFreeOk: true }), app: gemma, hasOwnKey: false })).toEqual([{ key: 'app', engine: 'gemma', models: [] }])
    expect(
      planAi({ feature: 'sms', user: user({ aiFreeOk: true, aiSms: true }), app: app({ ...gemma, gemmaModel: 'gemma-4-31b-it' }), hasOwnKey: true }),
    ).toEqual([
      // Automatic with the free AI turned on: the free AI first, your own key as the fallback.
      { key: 'app', engine: 'gemma', models: ['gemma-4-31b-it'] },
      { key: 'own', models: [DEFAULT_MODEL, ...FALLBACK_MODELS] },
    ])
    // Paid Gemini on Split Now's key, or the free AI not turned on: your own key stays first.
    expect(planAi({ feature: 'images', user: user({ aiFreeOk: true }), app: app({ mode: 'everyone' }), hasOwnKey: true }).map((p) => p.key)).toEqual([
      'own',
      'app',
    ])
    expect(planAi({ feature: 'images', user: user(), app: gemma, hasOwnKey: true }).map((p) => p.key)).toEqual(['own'])
    // "Only my key" never uses the free AI.
    expect(planAi({ feature: 'images', user: user({ aiFreeOk: true, aiSource: 'own' }), app: gemma, hasOwnKey: true }).map((p) => p.key)).toEqual(['own'])
    expect(autoSourceHint(true)).toBe('Split Now’s free AI first, then your key')
    expect(autoSourceHint(false)).toBe('Your key first, then Split Now’s')
    // Not asked when the shared AI couldn't serve them anyway.
    expect(needsFreeOk({ feature: 'images', user: user({ aiSource: 'own' }), app: gemma })).toBe(false)
    expect(needsFreeOk({ feature: 'images', user: user(), app: app({ engine: 'gemma' }) })).toBe(false)
    expect(needsFreeOk({ feature: 'images', user: user(), app: app({ mode: 'everyone' }) })).toBe(false)
  })
  it('is for everyone: an allow-list does not narrow it', () => {
    const listed = app({ engine: 'gemma', mode: 'allowlist', allowEmails: ['a@b.co'] })
    expect(planAi({ feature: 'images', user: user({ aiFreeOk: true }), app: listed, hasOwnKey: false, email: 'x@y.z' })).toHaveLength(1)
    expect(resolveAppAi({ engine: 'gemma', mode: 'allowlist', allowEmails: ['a@b.co'] })).toMatchObject({ mode: 'everyone', allowEmails: ['a@b.co'] })
    expect(resolveAppAi({ engine: 'gemma', mode: 'off' }).mode).toBe('off')
    expect(appKeyStatus(listed, 'images', undefined)).toBe('available')
    expect(appKeyStatus(app({ engine: 'gemma', mode: 'everyone', sms: false }), 'sms', undefined)).toBe('feature_off')
  })
  it('resolves the engine and model, and the consent', () => {
    expect(resolveAppAi({}).engine).toBe('gemini')
    expect(resolveAppAi({ engine: 'llama' }).engine).toBe('gemini')
    expect(resolveAppAi({ engine: 'gemma', gemmaModel: 'gemma-4-31b-it' })).toMatchObject({ engine: 'gemma', gemmaModel: 'gemma-4-31b-it' })
    expect(resolveAppAi({ gemmaModel: 'gemini-3.5-flash' }).gemmaModel).toBe('')
    expect(resolveUserAi({ aiFreeOk: true }).aiFreeOk).toBe(true)
    expect(resolveUserAi({ aiFreeOk: 'yes' }).aiFreeOk).toBe(false)
  })
  it('lists general Gemma models, newest first, the fast mixture-of-experts one before the dense ones', () => {
    const gen = ['generateContent']
    const list = [
      { name: 'models/gemma-3-27b-it', supportedGenerationMethods: gen },
      { name: 'models/gemma-4-31b-it', displayName: 'Gemma 4 31B', supportedGenerationMethods: gen },
      { name: 'models/gemma-3n-e4b-it', supportedGenerationMethods: gen },
      { name: 'models/gemma-4-26b-a4b-it', displayName: 'Gemma 4 26B A4B', supportedGenerationMethods: gen },
      { name: 'models/embeddinggemma-2', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/translategemma-27b', supportedGenerationMethods: gen },
      { name: 'models/gemma-4-e2b-it', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: gen },
    ]
    expect(gemmaModels(list).map((m) => m.id)).toEqual(['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemma-3-27b-it'])
    expect(gemmaModels(list)[0].label).toBe('Gemma 4 26B A4B')
    // A newer generation wins automatically.
    expect(gemmaModels([...list, { name: 'models/gemma-5-40b-it', supportedGenerationMethods: gen }])[0].id).toBe('gemma-5-40b-it')
  })
  it('plans the pick (or the newest), then the rest of the newest generation, at most three', () => {
    const avail = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemma-3-27b-it']
    expect(gemmaPlanModels('', avail)).toEqual(['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemma-3-27b-it'])
    expect(gemmaPlanModels('gemma-4-31b-it', avail)).toEqual(['gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemma-3-27b-it'])
    expect(gemmaPlanModels('', [])).toEqual([...GEMMA_FALLBACK_MODELS])
    expect(gemmaPlanModels('', avail).some((m) => m.startsWith('gemini'))).toBe(false)
  })
})

describe('resolvers', () => {
  it('fill defaults and reject junk', () => {
    expect(resolveAppAi({ mode: 'everyone', model: 'bad model!', perDay: -1, allowEmails: ['A@B.co', 'nope', 3] })).toEqual({
      ...DEFAULT_APP_AI,
      mode: 'everyone',
      allowEmails: ['a@b.co'],
    })
    expect(resolveAppAi({ globalPerDay: 500 }).globalPerDay).toBe(500)
    expect(resolveAppAi({ globalPerDay: 0 }).globalPerDay).toBe(DEFAULT_APP_AI.globalPerDay)
    expect(resolveUserAi({ aiEnabled: false, aiSource: 'weird', aiModel: 'gemini-3-flash' })).toEqual({
      ...DEFAULT_USER_AI,
      aiEnabled: false,
      aiModel: 'gemini-3-flash',
    })
  })
})

describe('usefulModels', () => {
  it('keeps Flash text models, cheapest (lite) first, then newest', () => {
    const list = [
      { name: 'models/gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-omni-1.1-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ]
    expect(usefulModels(list).map((m) => m.id)).toEqual(['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3-flash'])
    expect(usefulModels(list).map((m) => m.lite)).toEqual([true, true, false])
  })
})

describe('looksLikeGeminiKey', () => {
  it('accepts classic and newer key shapes, rejects obvious mistakes', () => {
    expect(looksLikeGeminiKey('AIzaSyD' + 'x'.repeat(32))).toBe(true)
    expect(looksLikeGeminiKey('AQ.Ab8RN6' + 'y'.repeat(40))).toBe(true)
    expect(looksLikeGeminiKey('hello')).toBe(false)
    expect(looksLikeGeminiKey('https://aistudio.google.com/apikey')).toBe(false)
  })
})
