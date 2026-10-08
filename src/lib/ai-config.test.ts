import { describe, expect, it } from 'vitest'
import { appKeyStatus, DEFAULT_APP_AI, DEFAULT_MODEL, DEFAULT_USER_AI, MODEL_ALIAS, planAi, resolveAppAi, resolveUserAi, usefulModels } from './ai-config'

const app = (p: Partial<typeof DEFAULT_APP_AI> = {}) => ({ ...DEFAULT_APP_AI, ...p })
const user = (p: Partial<typeof DEFAULT_USER_AI> = {}) => ({ ...DEFAULT_USER_AI, ...p })

describe('planAi', () => {
  it('own key first, then the shared key, each with model fallbacks', () => {
    const plan = planAi({ feature: 'images', user: user({ aiModel: 'gemini-3-flash' }), app: app({ mode: 'everyone' }), hasOwnKey: true })
    expect(plan).toEqual([
      { key: 'own', models: ['gemini-3-flash', DEFAULT_MODEL, MODEL_ALIAS] },
      { key: 'app', models: [DEFAULT_MODEL, MODEL_ALIAS] },
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
  it('status explains why the shared key is unavailable', () => {
    expect(appKeyStatus(app(), 'images', 'a@b.c')).toBe('off')
    expect(appKeyStatus(app({ mode: 'everyone', images: false }), 'images', 'a@b.c')).toBe('feature_off')
    expect(appKeyStatus(app({ mode: 'allowlist' }), 'images', 'a@b.c')).toBe('not_listed')
    expect(appKeyStatus(app({ mode: 'everyone' }), 'sms', undefined)).toBe('available')
  })
})

describe('resolvers', () => {
  it('fill defaults and reject junk', () => {
    expect(resolveAppAi({ mode: 'everyone', model: 'bad model!', perDay: -1, allowEmails: ['A@B.co', 'nope', 3] }))
      .toEqual({ ...DEFAULT_APP_AI, mode: 'everyone', allowEmails: ['a@b.co'] })
    expect(resolveUserAi({ aiEnabled: false, aiSource: 'weird', aiModel: 'gemini-3-flash' })).toEqual({ ...DEFAULT_USER_AI, aiEnabled: false, aiModel: 'gemini-3-flash' })
  })
})

describe('usefulModels', () => {
  it('keeps Flash text models, newest first', () => {
    const list = [
      { name: 'models/gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ]
    expect(usefulModels(list).map((m) => m.id)).toEqual(['gemini-3-flash', 'gemini-2.5-flash-lite'])
  })
})
