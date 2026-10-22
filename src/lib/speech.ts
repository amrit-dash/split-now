/*
 * Voice for Quick add, the phone's own recognition: the browser's Web Speech API (Chrome on
 * Android, Safari on iOS 14.5+). Free, and always first (src/lib/voice.ts voiceEngine). Nothing is
 * recorded by the app and no audio leaves it through us; the browser does the recognition. Where
 * the API doesn't exist, or the person refused it, the mic isn't shown (unless they chose AI
 * transcription, src/lib/mic.ts).
 */
import { joinHeard } from './voice'

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
}

function ctor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const speechSupported = (): boolean => !!ctor()

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

const refused = (code: string | undefined) => code === 'not-allowed' || code === 'service-not-allowed'

/** Plain words for the API's error codes. */
export function speechErrorText(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was refused. Allow it in the browser to speak an expense.'
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
  const finish = () => {
    if (ended) return
    ended = true
    opts.onEnd(error)
  }
  const begin = () => {
    const r = new C()
    current = r
    r.lang = opts.lang ?? 'en-IN'
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
      error = speechErrorText(e.error) || undefined
      stopped = true
    }
    r.onaudiostart = () => opts.onAudio?.()
    r.onend = () => {
      settled = joinHeard(settled, hearing)
      hearing = ''
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
