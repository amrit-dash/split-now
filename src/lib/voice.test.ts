import { describe, expect, it } from 'vitest'
import {
  voiceWhyNot,
  aiVoiceStep,
  browserName,
  speechRefusedText,
  liveWordsBesideRecording,
  micFailure,
  micPreflight,
  micProblemText,
  barHeights,
  finalVoiceText,
  holdDrag,
  isDoubleTap,
  joinHeard,
  liveTail,
  meterBesideSpeech,
  SPEECH_NONE_TTL_MS,
  speechNoneStill,
  speechServiceMissing,
  googleBuiltSpeech,
  addFinal,
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
    ...o,
  })

describe('transcribeOffer', () => {
  it('Split Now’s transcription key serves anyone when everyone may use it', () => {
    expect(offer()).toEqual({ ai: true, why: null })
  })
  it('without the shared key, only someone with their own key', () => {
    expect(offer({ sharedFlag: false })).toEqual({ ai: false, why: expect.stringMatching(/own Gemini key/) })
    expect(offer({ sharedFlag: false, hasOwnKey: true })).toEqual({ ai: true, why: null })
    expect(offer({ status: { transcribe: { configured: false } } }).why).toMatch(/Add your own Gemini key/)
    expect(offer({ status: { transcribe: { configured: false } }, hasOwnKey: true }).ai).toBe(true)
  })
  it('your own key is enough, with or without Split Now’s', () => {
    expect(offer({ hasOwnKey: true, sharedFlag: false }).ai).toBe(true)
    expect(offer({ hasOwnKey: true, status: { transcribe: { configured: false } } }).ai).toBe(true)
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
  const base = { native: true, aiChosen: false, aiReady: false, recorder: true }
  it('the phone’s own recognition first, free', () => {
    expect(voiceEngine(base)).toBe('native')
    expect(voiceEngine({ ...base, aiReady: true })).toBe('native')
  })
  it('AI when chosen and able to serve now', () => {
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: true })).toBe('ai')
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: false })).toBe('native')
    expect(voiceEngine({ ...base, aiChosen: true, aiReady: true, recorder: false })).toBe('native')
  })
  it('AI is an option, never a fallback: without the browser’s recognition and without choosing AI, no voice', () => {
    expect(voiceEngine({ ...base, native: false })).toBeNull()
    expect(voiceEngine({ ...base, native: false, aiReady: true })).toBeNull()
    expect(voiceEngine({ ...base, native: false, aiChosen: true, aiReady: true })).toBe('ai')
  })
  it('while AI’s answer loads, someone who chose it keeps a mic: the phone’s, or AI where the phone has none', () => {
    expect(voiceEngine({ ...base, aiChosen: true, aiPending: true })).toBe('native')
    expect(voiceEngine({ ...base, native: false, aiChosen: true, aiPending: true })).toBe('ai')
  })
})

describe('micPreflight', () => {
  it('granted listens; blocked explains; a prompt (or a browser that can’t say, first time) asks first', () => {
    expect(micPreflight({ perm: 'granted', okBefore: false })).toBe('go')
    expect(micPreflight({ perm: 'denied', okBefore: true })).toBe('blocked')
    expect(micPreflight({ perm: 'prompt', okBefore: true })).toBe('ask')
    expect(micPreflight({ perm: 'unknown', okBefore: false })).toBe('ask')
    expect(micPreflight({ perm: 'unknown', okBefore: true })).toBe('go')
  })
})

describe('micFailure and micProblemText', () => {
  const phone = { android: true, ios: false, standalone: true }
  it('names the problem from the browser’s error name', () => {
    expect(micFailure('NotAllowedError')).toBe('refused')
    expect(micFailure('NotReadableError')).toBe('busy')
    expect(micFailure('AbortError')).toBe('busy')
    expect(micFailure('NotFoundError')).toBe('missing')
    expect(micFailure('SecurityError')).toBe('insecure')
    expect(micFailure(undefined)).toBe('other')
  })
  it('a refusal the browser will ask about again asks; a remembered block says where the switch is', () => {
    expect(micProblemText('refused', 'prompt', phone)).toMatch(/when your phone asks/)
    // An installed app on Android: Chrome holds the permission for the site, App info has none.
    expect(micProblemText('refused', 'denied', { ...phone, host: 'split-now.web.app' })).toBe(
      'The microphone is blocked. Allow it in Android Settings → Apps → Chrome → Permissions → Microphone, and in Chrome → ⋮ → Settings → Site settings → Microphone → split-now.web.app. Then try again.',
    )
    expect(micProblemText('refused', 'denied', phone)).not.toMatch(/App info/)
    expect(micProblemText('refused', 'denied', { ...phone, standalone: false })).toMatch(/Site settings/)
    expect(micProblemText('refused', 'denied', { android: false, ios: true, standalone: false })).toMatch(/Safari/)
    expect(micProblemText('busy', 'granted', phone)).toMatch(/Another app/)
  })
  it('a computer that keeps the microphone from the browser names that switch, not the site', () => {
    // Chromium's message when macOS or Windows blocks the browser (owner's Mac, Opera GX)
    expect(micFailure('NotAllowedError', 'Permission denied by system')).toBe('system')
    expect(micFailure('NotAllowedError', 'Permission denied')).toBe('refused')
    const mac = { android: false, ios: false, standalone: false, mac: true, browser: 'Opera' }
    expect(micProblemText('system', 'denied', mac)).toBe(
      'Your Mac is keeping the microphone from Opera. Turn it on in System Settings → Privacy & Security → Microphone → Opera, reopen Opera, then try again.',
    )
    expect(micProblemText('system', 'denied', { ...mac, mac: false, windows: true })).toMatch(/Windows Settings|Settings → Privacy & security/)
    expect(micProblemText('system', 'denied', { ...phone, browser: 'Chrome' })).toMatch(/Android Settings → Apps → Chrome/)
    // a desktop "denied" without the browser's reason names both switches
    expect(micProblemText('refused', 'denied', mac)).toMatch(/Site settings.*System Settings → Privacy & Security → Microphone/)
    expect(micProblemText('refused', 'denied', { android: false, ios: false, standalone: false })).toMatch(/blocked for this site/)
  })
  it('every browser and device gets its own switch', () => {
    const desk = { android: false, ios: false, standalone: false }
    expect(micProblemText('refused', 'denied', { ...desk, windows: true, browser: 'Firefox' })).toMatch(/crossed-out microphone.*Windows Settings/)
    expect(micProblemText('refused', 'denied', { ...desk, mac: true, browser: 'Safari', host: 'split-now.web.app' })).toMatch(
      /Safari → Settings for split-now.web.app → Microphone.*System Settings/,
    )
    expect(micProblemText('refused', 'denied', { ...desk, windows: true, browser: 'Microsoft Edge' })).toMatch(
      /Site settings.*Microsoft Edge in Windows Settings/,
    )
    expect(micProblemText('refused', 'denied', { android: true, ios: false, standalone: false, browser: 'Samsung Internet' })).toMatch(
      /Sites and downloads.*Android Settings → Apps → Samsung Internet/,
    )
    expect(micProblemText('refused', 'denied', { android: true, ios: false, standalone: false, browser: 'Firefox' })).toMatch(/lock left of the address/)
    expect(micProblemText('refused', 'denied', { android: false, ios: true, standalone: true, browser: 'Safari' })).toMatch(
      /Settings → Apps → Safari → Microphone, then reopen/,
    )
    expect(micProblemText('refused', 'denied', { android: false, ios: true, standalone: false, browser: 'Chrome' })).toMatch(
      /Settings → Apps → Chrome → Microphone/,
    )
    expect(micProblemText('system', 'denied', { android: false, ios: true, standalone: false, browser: 'Chrome' })).toMatch(/phone.*Settings → Apps → Chrome/)
    expect(micProblemText('refused', 'prompt', desk)).toMatch(/when your browser asks/)
    // Windows reports its own block as a busy microphone in some browsers
    expect(micProblemText('busy', 'granted', { ...desk, windows: true, browser: 'Chrome' })).toMatch(/If nothing is, allow Chrome in Windows Settings/)
    expect(micProblemText('missing', 'granted', { ...desk, mac: true, browser: 'Firefox' })).toMatch(/allow Firefox in System Settings/)
  })
  it('a refused recogniser with a working microphone is Apple’s Speech Recognition switch', () => {
    expect(speechRefusedText({ android: false, ios: true, standalone: true })).toMatch(/Settings → Privacy & Security → Speech Recognition/)
    expect(speechRefusedText({ android: false, ios: false, standalone: false, mac: true, browser: 'Safari' })).toMatch(
      /System Settings → Privacy & Security → Speech Recognition/,
    )
    expect(speechRefusedText({ android: true, ios: false, standalone: false })).toMatch(/Transcribe with AI/)
  })
  it('browserName: the name Settings lists the browser by', () => {
    const opera = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 OPR/136.0.0.0'
    expect(browserName(opera)).toBe('Opera')
    expect(browserName('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/150.0 Safari/537.36 Edg/150.0')).toBe('Microsoft Edge')
    expect(browserName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36')).toBe('Chrome')
    expect(browserName('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari')
    expect(browserName('')).toBe('')
  })
})

describe('liveWordsBesideRecording', () => {
  it('not on Android, where the recogniser is a second app on the microphone', () => {
    expect(liveWordsBesideRecording('Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/141.0 Mobile')).toBe(false)
    expect(liveWordsBesideRecording('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0')).toBe(true)
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
  it('skips the second microphone on Apple WebKit and Android', () => {
    expect(meterBesideSpeech('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe(false)
    expect(meterBesideSpeech('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe(true)
    // Android: Google's app does the recognising, a second app on the microphone
    expect(meterBesideSpeech('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe(false)
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
  it('in Google’s and Apple’s own browsers a network error is the network, not a missing service', () => {
    expect(speechServiceMissing('network', true, true)).toBe(false)
    expect(speechServiceMissing('service-not-allowed', true, true)).toBe(true)
  })
  it('knows which browsers carry their maker’s speech service', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'
    expect(googleBuiltSpeech({ brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }], ua: chrome })).toBe(true)
    expect(googleBuiltSpeech({ brands: [{ brand: 'Microsoft Edge' }], ua: 'x' })).toBe(true)
    expect(googleBuiltSpeech({ brands: [{ brand: 'Chromium' }, { brand: 'Opera GX' }], ua: `${chrome} OPR/120.0` })).toBe(false)
    expect(googleBuiltSpeech({ brands: [{ brand: 'Brave' }, { brand: 'Chromium' }], ua: chrome })).toBe(false)
    expect(googleBuiltSpeech({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1' })).toBe(true)
    expect(googleBuiltSpeech({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' })).toBe(true)
  })
})

describe('addFinal', () => {
  it('adds new words, and doesn’t repeat what Chrome on Android says again', () => {
    expect(addFinal('', 'dinner')).toBe('dinner')
    expect(addFinal('dinner', '1200 with Rahul')).toBe('dinner 1200 with Rahul')
    expect(addFinal('dinner', 'Dinner 1200 with Rahul')).toBe('Dinner 1200 with Rahul')
    expect(addFinal('dinner 1200 with Rahul', 'with Rahul')).toBe('dinner 1200 with Rahul')
    expect(addFinal('dinner', '  ')).toBe('dinner')
  })
})

describe('no speech service, remembered', () => {
  it('remembers it for a week', () => {
    expect(speechNoneStill(null, 5)).toBe(false)
    expect(speechNoneStill(1000, 1000 + SPEECH_NONE_TTL_MS - 1)).toBe(true)
    expect(speechNoneStill(1000, 1000 + SPEECH_NONE_TTL_MS)).toBe(false)
  })
})

describe('finalVoiceText', () => {
  it('AI’s text wins over the live words', () => {
    expect(finalVoiceText({ text: 'Dinner 1200 with Rahul' }, 'dinner twelve hundred')).toEqual({ text: 'Dinner 1200 with Rahul' })
  })
  it('keeps the live words when AI heard nothing or failed', () => {
    expect(finalVoiceText({ text: '' }, 'dinner 1200')).toEqual({ text: 'dinner 1200' })
    expect(finalVoiceText({ text: '', error: 'Couldn’t transcribe' }, 'dinner 1200')).toEqual({ text: 'dinner 1200' })
  })
  it('says why when neither heard anything', () => {
    expect(finalVoiceText({ text: '', error: 'Couldn’t transcribe' }, '  ')).toEqual({ text: '', error: 'Couldn’t transcribe' })
    expect(finalVoiceText({ text: '' }, '')).toEqual({ text: '' })
  })
})

describe('aiVoiceStep: the button on “This browser can’t turn speech into text”', () => {
  it('turns AI transcription on when a key can serve them, else opens AI features; nothing when switched off', () => {
    expect(aiVoiceStep({ flag: true, offerAi: true })).toBe('turn-on')
    expect(aiVoiceStep({ flag: true, offerAi: false })).toBe('settings')
    expect(aiVoiceStep({ flag: false, offerAi: true })).toBeNull()
  })
})

describe('voiceWhyNot: the mic stays and says why voice can’t listen here', () => {
  const base = { quickAdd: true, native: false, recorder: true, aiChosen: false, offer: { ai: false, why: null }, online: true }
  it('no speech service and AI not chosen: Use AI for voice', () => {
    expect(voiceWhyNot(base)).toEqual({ text: expect.stringMatching(/can’t turn speech into text/), fix: 'use-ai' })
  })
  it('AI chosen but no key can serve them: the reason, and AI features', () => {
    expect(voiceWhyNot({ ...base, aiChosen: true, offer: { ai: false, why: 'Needs your own Gemini key, added in Settings → AI features.' } })).toEqual({
      text: 'Needs your own Gemini key, added in Settings → AI features.',
      fix: 'settings',
    })
    expect(voiceWhyNot({ ...base, aiChosen: true, offer: { ai: true, why: null }, online: false })?.text).toMatch(/needs a connection/)
  })
  it('nothing to offer: no microphone at all, or Quick add off', () => {
    expect(voiceWhyNot({ ...base, recorder: false })).toBeNull()
    expect(voiceWhyNot({ ...base, quickAdd: false })).toBeNull()
  })
})
