/*
 * Voice for Quick add: the browser's Web Speech API (Chrome on Android, Safari on iOS 14.5+).
 * Nothing is recorded by the app and no audio leaves it through us; the browser does the
 * recognition. Where the API doesn't exist the mic button isn't shown.
 */

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
}

function ctor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const speechSupported = (): boolean => !!ctor()

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
  stop(): void
}

/**
 * Listen for one utterance. `onText` gets the running transcript (final = the browser is done);
 * `onEnd` fires once, with an error message when something went wrong. null when unsupported.
 */
export function listenOnce(opts: { lang?: string; onText: (text: string, final: boolean) => void; onEnd: (error?: string) => void }): SpeechSession | null {
  const C = ctor()
  if (!C) return null
  const r = new C()
  r.lang = opts.lang ?? 'en-IN'
  r.interimResults = true
  r.maxAlternatives = 1
  r.continuous = false
  let ended = false
  let error: string | undefined
  const end = () => {
    if (ended) return
    ended = true
    opts.onEnd(error)
  }
  r.onresult = (e) => {
    let text = ''
    let final = false
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0]?.transcript ?? ''
      if (e.results[i].isFinal) final = true
    }
    opts.onText(text.trim(), final)
  }
  r.onerror = (e) => {
    const msg = speechErrorText(e.error)
    if (msg) error = msg
  }
  r.onend = end
  try {
    r.start()
  } catch {
    error = speechErrorText(undefined)
    end()
    return null
  }
  return {
    stop() {
      try {
        r.stop()
      } catch {
        end()
      }
    },
  }
}
