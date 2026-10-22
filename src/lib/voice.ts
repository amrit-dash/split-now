/*
 * Voice for Quick add, the decisions: which engine hears the person (the phone's own recognition,
 * free and first; AI transcription only when they chose it and it can serve them), whether the
 * mic shows at all, what a press on the mic means, and the level bars above + while someone talks.
 * Pure, so every choice is tested; src/hooks/useVoice.ts and the components wire it up.
 * See docs/PENDING.md "Voice and Quick add" (owner's spec, 22 Oct 2026).
 */
import type { AiSource } from './ai-config'

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
 * their settings, and a key for them: Split Now's transcription key when everyone may use it
 * (aiTranscribeShared) and it is set up, or their own Gemini key, as Which key allows.
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
  keyChoice: AiSource
}): TranscribeOffer {
  if (o.mode === 'demo') return { ai: false, why: 'AI transcription needs the online app. The demo uses your phone’s own speech recognition.' }
  if (!o.flag) return { ai: false, why: 'Transcription with AI is switched off for everyone right now.' }
  if (!o.aiEnabled) return { ai: false, why: 'Turn on Use AI in Settings → AI features first.' }
  const own = o.hasOwnKey && o.keyChoice !== 'app'
  const shared = o.sharedFlag && !!o.status?.transcribe?.configured && o.keyChoice !== 'own'
  if (own || shared) return { ai: true, why: null }
  if (o.status === undefined && o.sharedFlag) return { ai: false, why: null }
  if (o.keyChoice === 'own') return { ai: false, why: 'Needs your own Gemini key, added in Settings → AI features.' }
  if (!o.sharedFlag) return { ai: false, why: 'Needs your own Gemini key, added in Settings → AI features.' }
  if (o.status === null) return { ai: false, why: 'Can’t check right now. Try again when you’re online.' }
  return { ai: false, why: 'Split Now’s transcription isn’t set up yet. Your own Gemini key works too (Settings → AI features).' }
}

/**
 * Who hears the person. AI only when they chose it and it can serve them now (online, a key);
 * else the phone's own recognition when the phone has it and it wasn't refused. null: no voice at
 * all, so no mic in Quick add and no hold-for-voice on + (the hold does what it did before).
 */
export function voiceEngine(o: {
  /** the browser has speech recognition */
  native: boolean
  /** speech recognition was refused here (remembered after a not-allowed error) */
  nativeDenied: boolean
  /** the microphone itself is blocked for this site (Permissions API) */
  micDenied: boolean
  /** the person picked AI (AI features → Voice → Transcribe with AI) */
  aiChosen: boolean
  /** transcribeOffer(...).ai, and online */
  aiReady: boolean
  /** the browser can record audio (MediaRecorder) */
  recorder: boolean
}): VoiceEngine | null {
  if (o.micDenied) return null
  if (o.aiChosen && o.aiReady && o.recorder) return 'ai'
  if (o.native && !o.nativeDenied) return 'native'
  return null
}

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
