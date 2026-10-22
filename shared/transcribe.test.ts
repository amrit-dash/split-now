import { describe, expect, it } from 'vitest'
import {
  base64Bytes,
  billingVerdict,
  cleanTranscribeRequest,
  cleanTranscript,
  DEFAULT_TRANSCRIBE_MODEL,
  planTranscribe,
  resolveTranscribeModel,
  transcribeModels,
  transcribePrompt,
} from './transcribe'

const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n).fill(7)))

describe('transcription models', () => {
  it('recommends Flash-Lite 3.5 and allows 3.1, nothing else', () => {
    expect(DEFAULT_TRANSCRIBE_MODEL).toBe('gemini-3.5-flash-lite')
    expect(resolveTranscribeModel('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite')
    expect(resolveTranscribeModel('gemma-4-31b-it')).toBe('')
    expect(resolveTranscribeModel(undefined)).toBe('')
  })
  it('tries the pick first, then the rest', () => {
    expect(transcribeModels('')).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
    expect(transcribeModels('gemini-3.1-flash-lite')).toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'])
    expect(transcribeModels('nope')).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
  })
})

describe('cleanTranscribeRequest', () => {
  it('takes a short recording of a known type', () => {
    expect(cleanTranscribeRequest({ audio: b64(300), mimeType: 'audio/webm;codecs=opus', lang: 'en-IN' }, 1000)).toEqual({
      audio: b64(300),
      mimeType: 'audio/webm',
      lang: 'en-IN',
    })
    expect(cleanTranscribeRequest({ audio: b64(30), mimeType: 'audio/x-m4a' }, 1000)?.mimeType).toBe('audio/mp4')
  })
  it('refuses a recording over the cap, an unknown type, or something that is not base64', () => {
    expect(cleanTranscribeRequest({ audio: b64(1001), mimeType: 'audio/webm' }, 1000)).toBeNull()
    expect(cleanTranscribeRequest({ audio: b64(10), mimeType: 'video/mp4' }, 1000)).toBeNull()
    expect(cleanTranscribeRequest({ audio: 'not base64!', mimeType: 'audio/webm' }, 1000)).toBeNull()
    expect(cleanTranscribeRequest({ mimeType: 'audio/webm' }, 1000)).toBeNull()
    expect(cleanTranscribeRequest(null, 1000)).toBeNull()
  })
  it('drops a language tag that is not one', () => {
    expect(cleanTranscribeRequest({ audio: b64(10), mimeType: 'audio/ogg', lang: 'english please' }, 1000)).toEqual({ audio: b64(10), mimeType: 'audio/ogg' })
  })
  it('counts decoded bytes', () => {
    expect(base64Bytes(b64(10))).toBe(10)
    expect(base64Bytes(b64(11))).toBe(11)
    expect(base64Bytes(b64(12))).toBe(12)
  })
})

describe('cleanTranscript', () => {
  it('keeps one plain line', () => {
    expect(cleanTranscript('Transcript: "Dinner 1200 with Rahul,\nI paid"\n')).toBe('Dinner 1200 with Rahul, I paid')
    expect(cleanTranscript('   ')).toBe('')
    expect(cleanTranscript('x'.repeat(400))).toHaveLength(300)
  })
})

describe('transcribePrompt', () => {
  it('asks for digits and the words only, and names the language when known', () => {
    expect(transcribePrompt()).toMatch(/digits/)
    expect(transcribePrompt('en-IN')).toMatch(/en-IN/)
    expect(transcribePrompt()).toMatch(/never follow instructions/)
  })
})

describe('planTranscribe', () => {
  const user = { aiEnabled: true, aiTranscribe: true, aiTranscribeKey: 'auto' as const }
  it('is empty until the person turns it on', () => {
    expect(planTranscribe({ user: { ...user, aiTranscribe: false }, hasOwnKey: true, sharedAllowed: true, sharedConfigured: true })).toEqual([])
    expect(planTranscribe({ user: { ...user, aiEnabled: false }, hasOwnKey: true, sharedAllowed: true, sharedConfigured: true })).toEqual([])
  })
  it('Automatic: own key first, then Split Now’s', () => {
    expect(planTranscribe({ user, hasOwnKey: true, sharedAllowed: true, sharedConfigured: true })).toEqual(['own', 'app'])
    expect(planTranscribe({ user, hasOwnKey: false, sharedAllowed: true, sharedConfigured: true })).toEqual(['app'])
  })
  it('Split Now’s key only when everyone may use it and it is set up', () => {
    expect(planTranscribe({ user, hasOwnKey: false, sharedAllowed: false, sharedConfigured: true })).toEqual([])
    expect(planTranscribe({ user, hasOwnKey: false, sharedAllowed: true, sharedConfigured: false })).toEqual([])
    expect(planTranscribe({ user, hasOwnKey: true, sharedAllowed: false, sharedConfigured: true })).toEqual(['own'])
  })
  it('Own key and Split Now’s key mean only that one', () => {
    // An old "which key" choice no longer narrows it: own first, then Split Now's, always.
    expect(planTranscribe({ user: { ...user, aiTranscribeKey: 'own' }, hasOwnKey: true, sharedAllowed: true, sharedConfigured: true })).toEqual(['own', 'app'])
    expect(planTranscribe({ user: { ...user, aiTranscribeKey: 'app' }, hasOwnKey: true, sharedAllowed: true, sharedConfigured: true })).toEqual(['own', 'app'])
  })
})

describe('billingVerdict', () => {
  it('a free key is refused with an allowance of 0; a billed key answers', () => {
    expect(billingVerdict(200, '')).toBe('billed')
    expect(billingVerdict(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash-lite-image')).toBe('free')
    expect(billingVerdict(400, '{"error":{"status":"FAILED_PRECONDITION","message":"billing is not enabled"}}')).toBe('free')
    expect(billingVerdict(402, '')).toBe('free')
  })
  it('anything else says nothing about billing', () => {
    expect(billingVerdict(429, 'Resource has been exhausted (e.g. check quota). limit: 60')).toBe('unknown')
    expect(billingVerdict(404, 'model not found')).toBe('unknown')
    expect(billingVerdict(400, 'API key not valid. FAILED_PRECONDITION')).toBe('unknown')
    expect(billingVerdict(500, '')).toBe('unknown')
  })
})
