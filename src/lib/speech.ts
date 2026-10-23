/*
 * Voice for Quick add, the phone's own recognition: the browser's Web Speech API (Chrome on
 * Android, Safari on iOS 14.5+, Chrome / Edge / Safari on a computer). Free, and always first
 * (src/lib/voice.ts voiceEngine). Some Chromium browsers (Opera, Opera GX, Brave) have the API but
 * not Google's speech service behind it: there it moves to the browser's on-device recogniser
 * (processLocally, Chrome 139+, the model installed once) when the browser has one, and otherwise
 * says so plainly and remembers it for a week (AI transcription still works there). Nothing is
 * recorded by the app and no audio leaves it through us; the browser does the recognition. Where
 * the API doesn't exist, or the person refused it, the mic isn't shown (unless they chose AI
 * transcription, src/lib/mic.ts).
 */
import { joinHeard, speechNoneStill, speechServiceMissing } from './voice'

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

export const speechSupported = (): boolean => !!ctor() && !speechNoneStill(readNum(NONE_KEY), Date.now())

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
  for (const l of [...new Set([lang, 'en-US'])]) {
    try {
      const a = await C.available({ langs: [l], processLocally: true })
      if (a === 'available') return l
      if ((a === 'downloadable' || a === 'downloading') && C.install && (await C.install({ langs: [l], processLocally: true }))) return l
    } catch {
      /* try the next */
    }
  }
  return null
}

const NO_SERVICE_TEXT = 'This browser can’t turn speech into text. Chrome, Edge and Safari can, or turn on Transcribe with AI in Settings → AI features.'

// ---- Refused on this device -------------------------------------------------------------
// After a not-allowed error the mic hides (a button that only ever fails is worse than none);
// when the site's microphone permission later reads "granted", it comes back (src/lib/mic.ts).
const DENIED_KEY = 'splitnow-speech-denied'
const deniedSubs = new Set<() => void>()
export function speechDenied(): boolean {
  try {
    return localStorage.getItem(DENIED_KEY) === '1'
  } catch {
    return false
  }
}
export function setSpeechDenied(on: boolean): void {
  try {
    if (on) localStorage.setItem(DENIED_KEY, '1')
    else localStorage.removeItem(DENIED_KEY)
  } catch {
    /* private mode */
  }
  for (const f of deniedSubs) f()
}
export function subscribeSpeechDenied(f: () => void): () => void {
  deniedSubs.add(f)
  return () => deniedSubs.delete(f)
}

// Only the person's own refusal hides the mic until the microphone is allowed again;
// "service-not-allowed" is the browser lacking the service (handled above), not a refusal.
const refused = (code: string | undefined) => code === 'not-allowed'

/** Plain words for the API's error codes. */
export function speechErrorText(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access was refused. Allow it in the browser to speak an expense.'
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
export function listen(opts: { lang?: string; onText: (text: string) => void; onEnd: (error?: string) => void; onAudio?: () => void }): SpeechSession | null {
  const C = ctor()
  if (!C) return null
  let settled = ''
  let hearing = ''
  let stopped = false
  let ended = false
  let error: string | undefined
  let current: Recognition | null = null
  let restarts = 0
  /** recognising on the device: set once the cloud service was found missing (or remembered so) */
  let local = readStr(LOCAL_KEY)
  /** the cloud service failed and the on-device one is being tried */
  let switching = false
  const finish = () => {
    if (ended) return
    ended = true
    opts.onEnd(error)
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
      let done = ''
      let now = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? ''
        if (e.results[i].isFinal) done += ` ${t}`
        else now += ` ${t}`
      }
      hearing = joinHeard(done, now)
      opts.onText(joinHeard(settled, hearing))
    }
    r.onerror = (e) => {
      // Silence is not an ending: the session restarts below. A refusal hides the mic from now on.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (refused(e.error)) setSpeechDenied(true)
      // The device's recogniser went away (its model was removed): back to the cloud one next time.
      if (local && speechServiceMissing(e.error, true)) write(LOCAL_KEY, null)
      // No speech service behind the API: try the device's own recogniser before giving up.
      if (!local && !switching && speechServiceMissing(e.error, navigator.onLine)) {
        switching = true
        return
      }
      error = speechErrorText(e.error) || undefined
      stopped = true
    }
    r.onaudiostart = () => opts.onAudio?.()
    r.onend = () => {
      settled = joinHeard(settled, hearing)
      hearing = ''
      if (switching) {
        void localLang(C, opts.lang ?? 'en-IN').then((l) => {
          switching = false
          if (!l) {
            write(NONE_KEY, String(Date.now()))
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
