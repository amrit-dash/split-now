import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useOnline } from '@/hooks/useOnline'
import {
  blobToBase64,
  blip,
  buzz,
  closeMic,
  levelMeter,
  micPermission,
  openMic,
  record,
  recorderSupported,
  subscribeMicPermission,
  type Recording,
} from '@/lib/mic'
import { listen, speechDenied, speechSupported, subscribeSpeechDenied, type SpeechSession } from '@/lib/speech'
import { transcribeFailText, transcribeOffer, voiceEngine, type TranscribeOffer, type VoiceEngine } from '@/lib/voice'
import { TRANSCRIBE_MAX_SECONDS } from '../../shared/transcribe'

/** The language people speak to Quick add in: English with Indian names and places, by default. */
const LANG = 'en-IN'

/**
 * Who hears this person, and whether AI transcription is open to them (src/lib/voice.ts): the
 * admin's flags, their AI settings, the transcription key, the phone's own recognition and the
 * microphone permission. `engine` null means no voice here (no mic, no hold-for-voice on +).
 */
export function useVoiceSetup(): { engine: VoiceEngine | null; offer: TranscribeOffer; aiChosen: boolean; nativeOk: boolean } {
  const quickAdd = useFlag('quickAdd')
  const flag = useFlag('aiTranscribe')
  const sharedFlag = useFlag('aiTranscribeShared')
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const status = useAiStatus()
  const aiState = useAiState(firebase)
  const online = useOnline()
  const denied = useSyncExternalStore(subscribeSpeechDenied, speechDenied, () => false)
  const mic = useSyncExternalStore(subscribeMicPermission, micPermission, () => 'unknown' as const)
  const native = useMemo(() => speechSupported(), [])
  const recorder = useMemo(() => recorderSupported(), [])
  const offer = transcribeOffer({
    mode: firebase ? 'firebase' : 'demo',
    flag,
    sharedFlag,
    status,
    hasOwnKey: !!aiState?.hint,
    aiEnabled: prefs?.aiEnabled ?? true,
    keyChoice: prefs?.aiTranscribeKey ?? 'auto',
  })
  const aiChosen = !!prefs?.aiTranscribe && flag
  const engine = quickAdd ? voiceEngine({ native, nativeDenied: denied, micDenied: mic === 'denied', aiChosen, aiReady: offer.ai && online, recorder }) : null
  return { engine, offer, aiChosen, nativeOk: native && !denied }
}

export type VoiceState = 'idle' | 'listening' | 'transcribing'

interface Live {
  engine: VoiceEngine
  speech?: SpeechSession | null
  stream?: MediaStream | null
  meter?: () => void
  rec?: Recording
  text: string
  error?: string
  stopping?: boolean
  ended?: Promise<void>
  autoStop?: () => void
}

/**
 * One voice session at a time: start() listens (the phone's recognition, or a recording for AI),
 * stop() ends it and resolves with the words (or an error to show). `onText` gets the running
 * words while the phone listens; `onLevel` the voice level for the bars (0..1, every frame, only
 * when asked for with `meter`). A soft blip and a short buzz mark the start and the stop.
 */
export function useVoice(opts: {
  engine: VoiceEngine | null
  onText?: (t: string) => void
  onLevel?: (l: number) => void
  /** the session ended by itself with a problem (refused, no microphone) */
  onError?: (message: string) => void
  meter?: boolean
  sound?: boolean
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const o = useRef(opts)
  o.current = opts
  const live = useRef<Live | null>(null)

  const cleanup = useCallback(() => {
    const l = live.current
    l?.meter?.()
    closeMic(l?.stream)
    live.current = null
  }, [])
  useEffect(
    () => () => {
      live.current?.speech?.abort()
      live.current?.rec?.cancel()
      cleanup()
    },
    [cleanup],
  )

  /** A level for the bars while only the phone's recognition runs and no meter could open: pulses with each word heard. */
  const pulse = useRef<{ raf: number; level: number } | null>(null)
  const startPulse = () => {
    if (!o.current.onLevel || pulse.current) return
    const p = { raf: 0, level: 0 }
    pulse.current = p
    const tick = () => {
      p.level *= 0.92
      o.current.onLevel?.(p.level)
      p.raf = requestAnimationFrame(tick)
    }
    p.raf = requestAnimationFrame(tick)
  }
  const stopPulse = () => {
    if (pulse.current) cancelAnimationFrame(pulse.current.raf)
    pulse.current = null
  }

  const openMeter = async (l: Live) => {
    if (!o.current.meter || !o.current.onLevel) return
    try {
      const s = l.stream ?? (await openMic())
      if (live.current !== l) return closeMic(s)
      l.stream = s
      l.meter = levelMeter(s, (v) => o.current.onLevel?.(v))
    } catch {
      startPulse()
    }
  }

  /** Starts listening; false (with the problem already passed to onError) when it couldn't. */
  const start = async (): Promise<boolean> => {
    const engine = o.current.engine
    if (!engine || live.current) return false
    const l: Live = { engine, text: '' }
    live.current = l
    setState('listening')
    if (o.current.sound !== false) blip('start')
    buzz(12)
    if (engine === 'native') {
      let done: () => void = () => {}
      l.ended = new Promise<void>((r) => {
        done = r
      })
      l.speech = listen({
        lang: LANG,
        onText: (t) => {
          l.text = t
          if (pulse.current) pulse.current.level = 0.85
          o.current.onText?.(t)
        },
        onEnd: (err) => {
          l.error = err
          done()
          // Ended by itself (a refusal, no microphone): the session is over.
          if (live.current === l && err && !l.stopping) {
            stopPulse()
            cleanup()
            setState('idle')
            o.current.onError?.(err)
          }
        },
        // The browser has the microphone now; the bars' meter opens its own (Chrome shares it).
        onAudio: () => void openMeter(l),
      })
      if (!l.speech) {
        cleanup()
        setState('idle')
        o.current.onError?.('Couldn’t start listening. Type it instead.')
        return false
      }
      return true
    }
    try {
      l.stream = await openMic()
    } catch {
      cleanup()
      setState('idle')
      o.current.onError?.('Microphone access was refused. Allow it in the browser to speak an expense.')
      return false
    }
    if (live.current !== l) {
      closeMic(l.stream)
      return false
    }
    void openMeter(l)
    l.rec = record(l.stream, TRANSCRIBE_MAX_SECONDS * 1000, () => l.autoStop?.())
    return true
  }

  const stop = async (): Promise<{ text: string; error?: string }> => {
    const l = live.current
    if (!l) return { text: '' }
    l.stopping = true
    if (o.current.sound !== false) blip('stop')
    stopPulse()
    if (l.engine === 'native') {
      l.speech?.stop()
      // The last words arrive just after stop(); wait for them, but never long.
      await Promise.race([l.ended, new Promise((r) => setTimeout(r, 1500))])
      cleanup()
      setState('idle')
      return { text: l.text.trim(), ...(l.error ? { error: l.error } : {}) }
    }
    // Let go before the microphone even opened: nothing was said.
    if (!l.rec) {
      cleanup()
      setState('idle')
      return { text: '' }
    }
    const blob = await l.rec.stop()
    l.meter?.()
    l.meter = undefined
    closeMic(l.stream)
    setState('transcribing')
    try {
      if (blob.size < 800) return { text: '' }
      const r = await repo.transcribeAi({ audio: await blobToBase64(blob), mimeType: blob.type || 'audio/webm', lang: LANG })
      if (!r) return { text: '', error: transcribeFailText({ demo: repo.mode !== 'firebase' }) }
      if (r.unavailable) return { text: '', error: transcribeFailText({ demo: false, reason: r.reason }) }
      return { text: r.text }
    } catch {
      return { text: '', error: transcribeFailText({ demo: false }) }
    } finally {
      cleanup()
      setState('idle')
    }
  }

  /** Called when the recording reaches its limit: the caller stops as if the person let go. */
  const onLimit = (f: () => void) => {
    if (live.current) live.current.autoStop = f
  }

  const cancel = () => {
    live.current?.speech?.abort()
    live.current?.rec?.cancel()
    stopPulse()
    cleanup()
    setState('idle')
  }

  return { state, start, stop, cancel, onLimit }
}
