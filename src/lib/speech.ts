/*
 * Voice for Quick add, the phone's own recognition: the browser's Web Speech API (Chrome on
 * Android, Safari on iOS 14.5+, Chrome / Edge / Safari on a computer). Free, and always first
 * (src/lib/voice.ts voiceEngine). Some Chromium browsers (Opera, Opera GX, Brave) have the API but
 * not Google's speech service behind it: there it moves to the browser's on-device recogniser
 * (processLocally, Chrome 139+, the model installed once) when the browser has one, and otherwise
 * says so plainly and remembers it for a week, and voice moves to AI transcription where the person
 * can use it (src/lib/voice.ts voiceEngine). Nothing is recorded by the app and no audio leaves it
 * through us; the browser does the recognition. A refused microphone doesn't hide the mic: the
 * press explains how to allow it (src/hooks/useVoice.ts).
 */
import { addFinal, googleBuiltSpeech, joinHeard, speechNoneStill, speechServiceMissing } from './voice'

/** Google's or Apple's own browser: its speech service is there, so "network" means the network. */
const googleBuilt = (): boolean =>
  typeof navigator !== 'undefined' &&
  googleBuiltSpeech({
    brands: (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands,
    ua: navigator.userAgent,
  })

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  onaudiostart?: (() => void) | null
  /** on-device recognition (Chrome 139+) */
  processLocally?: boolean
}
type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'
interface RecognitionCtor {
  new (): Recognition
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Availability>
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

function ctor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * Browsers whose recogniser has no Google or Apple service behind it (Opera, Brave, Vivaldi): it
 * may never ask for the microphone itself, so the app opens it first, which shows the browser's
 * prompt (owner's Opera GX, 24 Oct 2026: no prompt, no error, nothing heard).
 */
export const speechNeedsMicFirst = (): boolean => !googleBuilt()

/** How long such a recogniser may show no sign of life (no audio, words or error) before it counts as missing. */
export const SPEECH_SILENT_MS = 5000

export const speechSupported = (): boolean => !!ctor() && !speechNoneStill(readNum(NONE_KEY), Date.now())
/** Told when the browser is found to have no working recogniser, so voice moves to AI (where it can) on the next press. */
const noneSubs = new Set<() => void>()
export function subscribeSpeechSupport(f: () => void): () => void {
  noneSubs.add(f)
  return () => noneSubs.delete(f)
}

// ---- No speech service here ----------------------------------------------------------------
// LOCAL_KEY: the language to recognise on the device (the cloud one isn't there); NONE_KEY: when
// neither worked, so the mic hides for a week instead of failing on every hold.
const LOCAL_KEY = 'splitnow-speech-local'
const NONE_KEY = 'splitnow-speech-none'
function readNum(k: string): number | null {
  try {
    const v = Number(localStorage.getItem(k))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
function readStr(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}

/** The on-device recogniser for `lang` (else US English), installing its model once if the browser offers it; null when there's none. */
async function localLang(C: RecognitionCtor, lang: string): Promise<string | null> {
  if (!C.available) return null
  // Browsers without the on-device component answer "downloading" for ever and never finish
  // install() (Brave, brave-browser#55414): give each a limit, so a hold can't hang on it.
  const within = <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> => Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))])
  for (const l of [...new Set([lang, 'en-US'])]) {
    try {
      const a = await within(C.available({ langs: [l], processLocally: true }), 3000)
      if (a === 'available') return l
      if ((a === 'downloadable' || a === 'downloading') && C.install && (await within(C.install({ langs: [l], processLocally: true }), 20_000)) === true)
        return l
    } catch {
      /* try the next */
    }
  }
  return null
}

export const NO_SERVICE_TEXT = 'This browser can’t turn speech into text. Chrome, Edge and Safari can, or turn on Transcribe with AI in Settings → AI features.'

// ---- Refused: never remembered ----------------------------------------------------------
// Earlier versions hid the mic after a not-allowed error and remembered it on the device. On
// Android that error also comes when the permission prompt takes the press, or when another app
// has the microphone, so voice vanished for good on phones that had allowed it. The key is cleared
// once here; a press now explains a refusal instead (src/lib/voice.ts micPreflight).
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('splitnow-speech-denied')
    // Chrome, Edge or Safari marked "no speech service" (or moved to on-device) after a bad
    // connection by an earlier version: they have the service, so start over with it.
    if (googleBuilt()) {
      localStorage.removeItem(NONE_KEY)
      localStorage.removeItem(LOCAL_KEY)
    }
  }
} catch {
  /* private mode */
}

/** Plain words for the API's error codes. */
export function speechErrorText(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
      return 'Allow the microphone when asked, then try again.'
    case 'service-not-allowed':
    case 'language-not-supported':
      return NO_SERVICE_TEXT
    case 'no-speech':
      return 'Didn’t catch that. Try again, a little closer to the phone.'
    case 'network':
      return 'Speech recognition needs a connection.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'aborted':
      return ''
    default:
      return 'Couldn’t hear that. Type it instead.'
  }
}

export interface SpeechSession {
  /** stop listening; onEnd follows with what was heard */
  stop(): void
  /** stop without waiting for the last words */
  abort(): void
}

/**
 * Listen until stop(). `continuous`: silence never ends it; when the browser ends a session on its
 * own (Chrome does after a quiet spell), a new one starts and the words carry on. `onText` gets
 * the running words; `onEnd` fires once, with an error message when something went wrong.
 * `onAudio` fires when the browser has the microphone (a level meter can open its own then).
 * null when unsupported.
 */
export function listen(opts: {
  lang?: string
  onText: (text: string) => void
  /** once: an error message when something went wrong, and the browser's own code (for Logs) */
  onEnd: (error?: string, code?: string) => void
  onAudio?: () => void
  /** only showing words beside an AI recording: its problems change nothing remembered on the device */
  side?: boolean
}): SpeechSession | null {
  const C = ctor()
  if (!C) return null
  let settled = ''
  let hearing = ''
  let stopped = false
  let ended = false
  let error: string | undefined
  let code: string | undefined
  let current: Recognition | null = null
  let restarts = 0
  /** the recogniser showed a sign of life: audio, words or an error */
  let alive = false
  /** recognising on the device: set once the cloud service was found missing (or remembered so) */
  let local = readStr(LOCAL_KEY)
  /** the cloud service failed and the on-device one is being tried */
  let switching = false
  const finish = () => {
    if (ended) return
    ended = true
    opts.onEnd(error, code)
  }
  const begin = () => {
    const r = new C()
    current = r
    r.lang = local ?? opts.lang ?? 'en-IN'
    if (local) r.processLocally = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.continuous = true
    r.onresult = (e) => {
      alive = true
      let done = ''
      let now = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? ''
        if (e.results[i].isFinal) done = addFinal(done, t)
        else now += ` ${t}`
      }
      hearing = joinHeard(done, now)
      opts.onText(joinHeard(settled, hearing))
    }
    r.onerror = (e) => {
      alive = true
      // Silence is not an ending: the session restarts below.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      code = e.error
      // Beside a recording only: nothing to remember or switch, the recording still counts.
      if (opts.side) {
        stopped = true
        return
      }
      // The device's recogniser went away (its model was removed): back to the cloud one next time.
      if (local && speechServiceMissing(e.error, true, googleBuilt())) write(LOCAL_KEY, null)
      // No speech service behind the API: try the device's own recogniser before giving up.
      if (!local && !switching && speechServiceMissing(e.error, navigator.onLine, googleBuilt())) {
        switching = true
        return
      }
      error = speechErrorText(e.error) || undefined
      stopped = true
    }
    r.onaudiostart = () => {
      alive = true
      opts.onAudio?.()
    }
    r.onend = () => {
      settled = joinHeard(settled, hearing)
      hearing = ''
      if (switching) {
        void localLang(C, opts.lang ?? 'en-IN').then((l) => {
          switching = false
          if (!l) {
            write(NONE_KEY, String(Date.now()))
            for (const f of noneSubs) f()
            error = NO_SERVICE_TEXT
            return finish()
          }
          local = l
          write(LOCAL_KEY, l)
          if (stopped) return finish()
          try {
            begin()
          } catch {
            finish()
          }
        })
        return
      }
      // The browser ended a session the person didn't: start another, a few times a minute at most.
      if (!stopped && restarts < 40) {
        restarts += 1
        try {
          begin()
          return
        } catch {
          /* fall through: finish */
        }
      }
      finish()
    }
    r.start()
  }
  try {
    begin()
  } catch {
    error = speechErrorText(undefined)
    finish()
    return null
  }
  // A recogniser with no service behind it can start and then do nothing at all: no audio, no
  // words, no error. Then it's missing here, said plainly, instead of a hold that hears nothing.
  if (!googleBuilt() && !opts.side) {
    setTimeout(() => {
      if (alive || ended || stopped || switching) return
      code = 'no-audio'
      error = NO_SERVICE_TEXT
      write(NONE_KEY, String(Date.now()))
      for (const f of noneSubs) f()
      stopped = true
      try {
        current?.abort()
      } catch {
        /* finish below */
      }
      finish()
    }, SPEECH_SILENT_MS)
  }
  return {
    stop() {
      stopped = true
      try {
        current?.stop()
      } catch {
        finish()
      }
    },
    abort() {
      stopped = true
      try {
        current?.abort()
      } catch {
        finish()
      }
    },
  }
}
