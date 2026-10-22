import { describe, expect, it } from 'vitest'
import {
  barHeights,
  holdDrag,
  isDoubleTap,
  joinHeard,
  liveTail,
  meterBesideSpeech,
  SPEECH_NONE_TTL_MS,
  speechNoneStill,
  speechServiceMissing,
  micRelease,
  pickRecorderMime,
  rmsToLevel,
  smoothLevel,
  transcribeFailText,
  transcribeOffer,
  voiceEngine,
} from './voice'

const offer = (o: Partial<Parameters<typeof transcribeOffer>[0]> = {}) =>
  transcribeOffer({
    mode: 'firebase',
    flag: true,
    sharedFlag: true,
    status: { transcribe: { configured: true } },
    hasOwnKey: false,
    aiEnabled: true,
    keyChoice: 'auto',
    ...o,
  })

describe('transcribeOffer', () => {
  it('Split Now’s transcription key serves anyone when everyone may use it', () => {
    expect(offer()).toEqual({ ai: true, why: null })
  })
  it('without the shared key, only someone with their own key', () => {
    expect(offer({ sharedFlag: false })).toEqual({ ai: false, why: expect.stringMatching(/own Gemini key/) })
    expect(offer({ sharedFlag: false, hasOwnKey: true })).toEqual({ ai: true, why: null })
    expect(offer({ status: { transcribe: { configured: false } } }).why).toMatch(/isn’t set up yet/)
    expect(offer({ status: { transcribe: { configured: false } }, hasOwnKey: true }).ai).toBe(true)
  })
  it('Which key narrows it', () => {
    expect(offer({ keyChoice: 'own' }).ai).toBe(false)
    expect(offer({ keyChoice: 'own', hasOwnKey: true }).ai).toBe(true)
    expect(offer({ keyChoice: 'app', hasOwnKey: true, sharedFlag: false }).ai).toBe(false)
  })
  it('says why: demo, the admin’s switch, AI off, offline', () => {
    expect(offer({ mode: 'demo' }).why).toMatch(/needs the online app/)
    expect(offer({ flag: false }).why).toMatch(/switched off for everyone/)
    expect(offer({ aiEnabled: false }).why).toMatch(/Use AI/)
    expect(offer({ status: null }).why).toMatch(/Can’t check/)
  })
  it('while the status loads it is not offered yet, without a reason', () => {
    expect(offer({ status: undefined })).toEqual({ ai: false, why: null })
  })
})

describe('voiceEngine', () => {
  const base = { native: true, nativeDenied: false, micDenied: false, aiChosen: false, aiReady: false, recorder: true }
  it('the phone’s own recognition first, free', () => {
    expect(voiceEngine(base)).toBe('native')
    expect(voiceEngine({ ...base, aiReady: true })).toBe('native')
  })
  it('AI only when chosen and able to serve now', () => {
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: true })).toBe('ai')
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: false })).toBe('native')
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: true, recorder: false })).toBe('native')
  })
  it('no recognition, or refused: no voice, unless AI is on for the person', () => {
    expect(voiceEngine({ ...base, native: false })).toBeNull()
    expect(voiceEngine({ ...base, nativeDenied: true })).toBeNull()
    expect(voiceEngine({ ...base, native: false, aiChosen: true, aiReady: true })).toBe('ai')
  })
  it('a blocked microphone stops both', () => {
    expect(voiceEngine({ ...base, micDenied: true, aiChosen: true, aiReady: true })).toBeNull()
  })
})

describe('mic presses', () => {
  it('a quick tap keeps listening; a hold stops on release', () => {
    expect(micRelease(120)).toBe('keep')
    expect(micRelease(349)).toBe('keep')
    expect(micRelease(350)).toBe('stop')
    expect(micRelease(2000)).toBe('stop')
  })
})

describe('joinHeard', () => {
  it('joins the settled words and the ones still being heard', () => {
    expect(joinHeard('dinner 1200', 'with Rahul')).toBe('dinner 1200 with Rahul')
    expect(joinHeard('', ' dinner ')).toBe('dinner')
    expect(joinHeard('dinner  1200 ', '')).toBe('dinner 1200')
  })
})

describe('levels and bars', () => {
  it('silence is 0, normal speech fills most of the range, loud is capped', () => {
    expect(rmsToLevel(0)).toBe(0)
    expect(rmsToLevel(0.004)).toBe(0)
    expect(rmsToLevel(0.06)).toBeGreaterThan(0.4)
    expect(rmsToLevel(1)).toBe(1)
    expect(rmsToLevel(Number.NaN)).toBe(0)
  })
  it('rises fast, falls slowly', () => {
    expect(smoothLevel(0, 1)).toBeCloseTo(0.6)
    expect(smoothLevel(1, 0)).toBeCloseTo(0.85)
  })
  it('five bars, the middle tallest, never flat and never past full', () => {
    const quiet = barHeights(0, 0)
    expect(quiet).toHaveLength(5)
    for (const h of quiet) expect(h).toBeCloseTo(0.15)
    const loud = barHeights(1, 0)
    for (const h of loud) {
      expect(h).toBeGreaterThan(0.15)
      expect(h).toBeLessThanOrEqual(1)
    }
    const avg = (i: number) => [0, 200, 400, 600, 800].reduce((s, t) => s + barHeights(1, t)[i], 0)
    expect(avg(2)).toBeGreaterThan(avg(0))
    expect(barHeights(2, 0).every((h) => h <= 1)).toBe(true)
  })
})

describe('transcribeFailText', () => {
  it('says why the words didn’t come back, and what to do', () => {
    expect(transcribeFailText({ demo: true })).toMatch(/needs the online app/)
    expect(transcribeFailText({ demo: false, reason: 'quota' })).toMatch(/allowance/)
    expect(transcribeFailText({ demo: false, reason: 'not_configured' })).toMatch(/Native in Preferences/)
    expect(transcribeFailText({ demo: false })).toMatch(/Try again, or type it/)
  })
})

describe('pickRecorderMime', () => {
  it('Opus in WebM first, MP4 on Safari, nothing when it can’t record', () => {
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecorderMime((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickRecorderMime(() => false)).toBeUndefined()
    expect(
      pickRecorderMime(() => {
        throw new Error('no')
      }),
    ).toBeUndefined()
  })
})

describe('hold to talk gestures', () => {
  it('cancels once the finger slides far enough, any way', () => {
    expect(holdDrag(0, 0)).toBe('talk')
    expect(holdDrag(40, -40)).toBe('talk')
    expect(holdDrag(-80, 0)).toBe('cancel')
    expect(holdDrag(0, -73)).toBe('cancel')
  })
  it('knows a double tap', () => {
    expect(isDoubleTap(null, 1000)).toBe(false)
    expect(isDoubleTap(1000, 1300)).toBe(true)
    expect(isDoubleTap(1000, 1401)).toBe(false)
    expect(isDoubleTap(1000, 900)).toBe(false)
  })
})

describe('liveTail', () => {
  it('shows short lines whole', () => {
    expect(liveTail('  dinner   1200 ')).toBe('dinner 1200')
  })
  it('keeps the latest words of a long line, cut at a word', () => {
    const t = liveTail('dinner at the beach shack 1200 with Rahul and Priya, I paid', 30)
    expect(t.startsWith('…')).toBe(true)
    expect(t.endsWith('I paid')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(31)
    expect(t.slice(1, 2)).not.toBe(' ')
  })
})

describe('meterBesideSpeech', () => {
  it('skips the second microphone on Apple WebKit only', () => {
    expect(meterBesideSpeech('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe(true)
    expect(meterBesideSpeech('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe(true)
  })
})

describe('speech service missing', () => {
  it('tells a missing service from a refusal or being offline', () => {
    expect(speechServiceMissing('network', true)).toBe(true)
    expect(speechServiceMissing('network', false)).toBe(false)
    expect(speechServiceMissing('service-not-allowed', true)).toBe(true)
    expect(speechServiceMissing('language-not-supported', true)).toBe(true)
    expect(speechServiceMissing('not-allowed', true)).toBe(false)
    expect(speechServiceMissing('no-speech', true)).toBe(false)
  })
  it('remembers it for a week', () => {
    expect(speechNoneStill(null, 5)).toBe(false)
    expect(speechNoneStill(1000, 1000 + SPEECH_NONE_TTL_MS - 1)).toBe(true)
    expect(speechNoneStill(1000, 1000 + SPEECH_NONE_TTL_MS)).toBe(false)
  })
})
