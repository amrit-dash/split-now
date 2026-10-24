/*
 * Voice for Quick add, the decisions: which engine hears the person (the phone's own recognition,
 * free and first; AI transcription only when they chose it and it can serve them), whether the
 * mic shows at all, what a press on the mic means, and the level bars above + while someone talks.
 * Pure, so every choice is tested; src/hooks/useVoice.ts and the components wire it up.
 * See docs/PENDING.md "Voice and Quick add" (owner's spec, 22 Oct 2026).
 */

export type Transcription = 'native' | 'ai'
export type VoiceEngine = 'native' | 'ai'

export interface TranscribeOffer {
  /** AI transcription can serve this person right now */
  ai: boolean
  /** why not, in plain words (Preferences shows it under Native); null when it can, or while unknown */
  why: string | null
}

/**
 * Can this person choose AI transcription? Only with the admin's switch on (aiTranscribe), AI on in
 * their settings, and a key for them: their own Gemini key, or else Split Now's transcription key
 * when everyone may use it (aiTranscribeShared) and it is set up. Always that order, no choosing
 * (shared/transcribe.ts planTranscribe). With neither, it asks for their own key.
 */
export function transcribeOffer(o: {
  mode: 'firebase' | 'demo'
  /** config/app flags.aiTranscribe */
  flag: boolean
  /** config/app flags.aiTranscribeShared */
  sharedFlag: boolean
  /** the aiStatus answer: undefined while loading, null when it can't be checked */
  status: { transcribe?: { configured: boolean } } | null | undefined
  hasOwnKey: boolean
  aiEnabled: boolean
}): TranscribeOffer {
  if (o.mode === 'demo') return { ai: false, why: 'AI transcription needs the online app. The demo uses your phone’s own speech recognition.' }
  if (!o.flag) return { ai: false, why: 'Transcription with AI is switched off for everyone right now.' }
  if (!o.aiEnabled) return { ai: false, why: 'Turn on Use AI in Settings → AI features first.' }
  const shared = o.sharedFlag && !!o.status?.transcribe?.configured
  if (o.hasOwnKey || shared) return { ai: true, why: null }
  if (o.status === undefined && o.sharedFlag) return { ai: false, why: null }
  if (!o.sharedFlag) return { ai: false, why: 'Needs your own Gemini key, added in Settings → AI features.' }
  if (o.status === null) return { ai: false, why: 'Can’t check right now. Try again when you’re online.' }
  return { ai: false, why: 'Add your own Gemini key in Settings → AI features to transcribe with AI. Split Now’s isn’t set up yet.' }
}

/**
 * Who hears the person. AI only when they chose it (an option, never a fallback: owner, 23 Oct
 * 2026) and it can serve them now (online, a key); else the browser's own recognition when it has a
 * working one. null when neither: no mic in Quick add, and a hold on + opens the Create sheet.
 *
 * A refused microphone no longer hides the mic (it used to, remembered on the device, and a
 * permission granted later, or a refusal that was really the prompt being dismissed by letting go,
 * left voice gone for good): the press explains how to allow it instead (micPreflight).
 */
export function voiceEngine(o: {
  /** the browser has speech recognition with a service behind it (not found missing lately) */
  native: boolean
  /** the person picked AI (AI features → Voice → Transcribe with AI) */
  aiChosen: boolean
  /** transcribeOffer(...).ai, and online */
  aiReady: boolean
  /** AI's answer is still loading (aiStatus) while they chose it */
  aiPending?: boolean
  /** the browser can record audio (MediaRecorder) */
  recorder: boolean
}): VoiceEngine | null {
  if (o.aiChosen && o.recorder && (o.aiReady || (o.aiPending && !o.native))) return 'ai'
  if (o.native) return 'native'
  return null
}

/** The site's microphone permission as the browser reports it ('unknown' where it can't say). */
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/**
 * What a press for voice does before listening. 'go': listen now. 'ask': open the microphone first,
 * which shows the browser's permission prompt; once allowed, listening carries on if the finger is
 * still down, else the person is told it's ready (never "didn't catch that" for a prompt they had to
 * let go to answer). 'blocked': the site's microphone is blocked, so say how to allow it. `okBefore`:
 * voice has worked on this device before (browsers that can't report the permission).
 */
export function micPreflight(o: { perm: MicPermission; okBefore: boolean }): 'go' | 'ask' | 'blocked' {
  if (o.perm === 'granted') return 'go'
  if (o.perm === 'denied') return 'blocked'
  if (o.perm === 'prompt') return 'ask'
  return o.okBefore ? 'go' : 'ask'
}

/** What went wrong opening the microphone, from the DOMException's name (getUserMedia). */
export type MicFailure = 'refused' | 'busy' | 'missing' | 'insecure' | 'other'
export function micFailure(name: string | undefined): MicFailure {
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'refused'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing'
    case 'SecurityError':
    case 'TypeError':
      return 'insecure'
    default:
      return 'other'
  }
}

/**
 * Plain words for a microphone that couldn't be used. `perm` tells a refusal the browser now
 * remembers ('denied': only the site settings can undo it) from one it will ask about again.
 * `android` / `ios` name where the switch is; `host` is the site's address, as Chrome lists it.
 * An app added to an Android home screen has no Microphone of its own in App info: Chrome holds the
 * permission for the site (and keeps it when the app is removed), so the steps go through Chrome.
 */
export function micProblemText(f: MicFailure, perm: MicPermission, where: { android: boolean; ios: boolean; standalone: boolean; host?: string }): string {
  if (f === 'refused' || perm === 'denied') {
    if (perm !== 'denied') return 'Allow the microphone when your phone asks, then try again.'
    if (where.ios) return 'The microphone is off for Split Now. Turn it on in Settings → Apps → Safari → Microphone (or the site’s aA menu), then try again.'
    if (where.android && where.standalone)
      return `Chrome has the microphone blocked for ${where.host || 'Split Now'}. Open Chrome → ⋮ → Settings → Site settings → Microphone → ${where.host || 'this site'} → Allow, then try again.`
    return 'The microphone is blocked for this site. Tap the icon left of the address (or ⋮ → Site settings) → Microphone → Allow, then try again.'
  }
  if (f === 'busy') return 'Another app is using the microphone. Close it (a call, a recorder, an assistant) and try again.'
  if (f === 'missing') return 'No microphone was found.'
  if (f === 'insecure') return 'The microphone only works on the secure (https) app.'
  return 'Couldn’t open the microphone. Try again, or type it.'
}

/**
 * Whether the phone's own recognition may run next to an AI recording, only to show the words live
 * (owner, 23 Oct 2026). Not on Android: Chrome there hands recognition to Google's app, a second
 * app on the microphone, and Android gives the microphone to one of them, so the recording (or the
 * recognition) heard nothing and the next press found the microphone "refused".
 */
export const liveWordsBesideRecording = (ua: string): boolean => !/Android/i.test(ua)

/**
 * A press that heard nothing, before voice has ever worked on this device: the permission prompt
 * took the press (the finger had to come off to answer it), so it gets a how-to, not an error.
 */
export const VOICE_FIRST_TEXT = 'Ready. Hold + and speak, then let go.'
export const VOICE_ALLOW_TEXT = 'Allow the microphone when asked. Then hold + and speak.'

/** A press on the mic shorter than this is a tap (it keeps listening until the next tap); longer is hold-to-talk. */
export const HOLD_TO_TALK_MS = 350

/** The finger left the mic after `heldMs`: stop now (it was held while talking), or keep listening (it was a tap). */
export const micRelease = (heldMs: number): 'stop' | 'keep' => (heldMs >= HOLD_TO_TALK_MS ? 'stop' : 'keep')

/** The running words: what the recognizer has settled on, then what it is still hearing. */
export function joinHeard(settled: string, hearing: string): string {
  return [settled.trim(), hearing.trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ')
}

/** Microphone loudness (RMS of samples in -1..1) → 0..1, with a curve so normal speech fills the bars. */
export function rmsToLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0.005) return 0
  return Math.min(1, Math.sqrt((rms - 0.005) / 0.18))
}

/** Bars rise fast with the voice and fall back slowly, so they read as speech, not flicker. */
export function smoothLevel(prev: number, next: number): number {
  return next > prev ? prev + (next - prev) * 0.6 : prev + (next - prev) * 0.15
}

/** How much each of the bars above + follows the voice: the middle most, the edges less. */
const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55]

/**
 * The bars' heights (0.15..1 of their full height) for a level at time `t` (ms): each bar sways a
 * little on its own so the row looks alive, and all of them rise with the voice.
 */
export function barHeights(level: number, t: number, n = BAR_WEIGHTS.length): number[] {
  const l = Math.max(0, Math.min(1, level))
  return Array.from({ length: n }, (_, i) => {
    const w = BAR_WEIGHTS[i % BAR_WEIGHTS.length]
    const sway = 0.5 + 0.5 * Math.sin(t / 140 + i * 1.7)
    return Math.max(0.15, Math.min(1, 0.15 + l * w * (0.7 + 0.3 * sway)))
  })
}

/**
 * Why a recording came back without words (AI transcription), in plain words. `reason` is the
 * server's (shared/ai-config.ts AiUnavailableReason); none means the call couldn't be made.
 */
export function transcribeFailText(o: { demo: boolean; reason?: string }): string {
  if (o.demo) return 'AI transcription needs the online app. The demo uses your phone’s own speech recognition.'
  switch (o.reason) {
    case 'quota':
      return 'You’ve used today’s voice allowance. Type it, or set Transcription to Native in Preferences.'
    case 'bad_key':
      return 'Google rejected the Gemini key. Check it in Settings → AI features.'
    case 'off':
    case 'not_configured':
    case 'not_listed':
    case 'needs_ok':
      return 'AI transcription isn’t available right now. Set Transcription to Native in Preferences.'
    default:
      return 'Couldn’t write that down. Try again, or type it.'
  }
}

/** The recorder type to ask for: the first the browser can make (Opus in WebM or Ogg, else MP4 on Safari). */
export function pickRecorderMime(supported: (t: string) => boolean): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'].find((t) => {
    try {
      return supported(t)
    } catch {
      return false
    }
  })
}

/** While holding + to talk, a finger that slides this far from where it pressed (any way) cancels on letting go. */
export const HOLD_CANCEL_PX = 72

/** Where the held finger has slid to: still talking, or letting go now cancels. */
export const holdDrag = (dx: number, dy: number): 'talk' | 'cancel' => (Math.hypot(dx, dy) > HOLD_CANCEL_PX ? 'cancel' : 'talk')

/** Two taps on + this close together, while it works out what was said, stop it. */
export const DOUBLE_TAP_MS = 400

export const isDoubleTap = (prev: number | null, now: number): boolean => prev !== null && now - prev >= 0 && now - prev <= DOUBLE_TAP_MS

/** The running words in the talk pill: the latest ones, cut at a word with a leading ellipsis when long. */
export function liveTail(text: string, max = 40): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(t.length - max)
  const space = cut.indexOf(' ')
  return `…${space > 0 && space < max - 8 ? cut.slice(space + 1) : cut}`
}

/**
 * Whether the bars may open their own microphone stream next to the phone's speech recognition.
 * Apple's WebKit (every iPhone browser, and Safari on a Mac) and Android give the microphone to one
 * of them only: a second stream can leave recognition hearing nothing ("Didn't catch that"), or
 * refused, and asks for the microphone a second time. There the bars follow the words heard instead.
 */
export function meterBesideSpeech(ua: string): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return false
  // Android: Chrome hands recognition to Google's app, a second app on the microphone; a stream
  // opened here takes the microphone from it ("refused", or nothing heard).
  if (/Android/i.test(ua)) return false
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return false
  return true
}

/**
 * The browser has speech recognition but no service behind it (Opera, Brave and other Chromium
 * builds without Google's speech service answer "network" while online, or "service-not-allowed"):
 * not a refused microphone, and worth trying the on-device recogniser before giving up.
 */
export const speechServiceMissing = (code: string | undefined, online: boolean, googleBuilt = false): boolean =>
  code === 'service-not-allowed' || code === 'language-not-supported' || (code === 'network' && online && !googleBuilt)

/**
 * The browser is one whose makers run the speech service behind it: Google Chrome and Microsoft Edge
 * (their brands, User-Agent Client Hints), or Safari / any iPhone browser (Apple's). There a "network"
 * error is the network, never a missing service: it used to hide the mic for a week on an Android
 * phone after one bad connection. Opera, Brave and Vivaldi share Chrome's engine but not Google's
 * speech key, which only Google's own Chrome build carries, so a website can't lend it to them.
 */
export function googleBuiltSpeech(o: { brands?: ReadonlyArray<{ brand: string }>; ua: string }): boolean {
  if (o.brands?.some((b) => /^(Google Chrome|Microsoft Edge)$/.test(b.brand))) return true
  if (/iPhone|iPad|iPod/.test(o.ua)) return true
  if (/OPR\/|Opera|Brave|Vivaldi|YaBrowser|SamsungBrowser|Firefox\//.test(o.ua)) return false
  // Safari on a Mac (no client hints there)
  return /Safari\//.test(o.ua) && !/Chrome|Chromium|Edg\//.test(o.ua)
}

/**
 * The words the recogniser has settled on so far, from each final result in turn. Chrome on Android
 * repeats earlier words in a later final result ("dinner", then "dinner 1200 with Rahul"), and adding
 * them up wrote "dinner dinner 1200 with Rahul": a result that starts with what came before replaces
 * it, one already said is dropped.
 */
export function addFinal(settled: string, next: string): string {
  const a = settled.replace(/\s+/g, ' ').trim()
  const b = next.replace(/\s+/g, ' ').trim()
  if (!b) return a
  if (!a) return b
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (lb.startsWith(la)) return b
  if (la.endsWith(lb) || la.includes(lb)) return a
  return `${a} ${b}`
}

/** A browser found to have no working recogniser is asked again after this long (it may have gained one). */
export const SPEECH_NONE_TTL_MS = 7 * 24 * 3600 * 1000

export const speechNoneStill = (since: number | null, now: number): boolean => since !== null && now - since >= 0 && now - since < SPEECH_NONE_TTL_MS

/**
 * With AI transcription the phone's own recognition runs alongside, only to show the words live
 * (owner, 23 Oct 2026). On letting go AI's text wins; when AI heard nothing or failed, the words
 * the phone heard are kept instead of an error.
 */
export function finalVoiceText(ai: { text: string; error?: string }, live: string): { text: string; error?: string } {
  if (ai.text.trim()) return { text: ai.text.trim() }
  if (live.trim()) return { text: live.trim() }
  return ai.error ? { text: '', error: ai.error } : { text: '' }
}
