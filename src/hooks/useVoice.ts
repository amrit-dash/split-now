import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useOnline } from '@/hooks/useOnline'
import { reportAppError, voiceProblem } from '@/lib/app-errors'
import {
  blobToBase64,
  blip,
  buzz,
  closeMic,
  levelMeter,
  markMicAllowed,
  micAllowedBefore,
  micPermission,
  micPermissionNow,
  micPolicyAllows,
  openMic,
  record,
  recorderSupported,
  subscribeMicPermission,
  type Recording,
} from '@/lib/mic'
import { listen, speechNeedsMicFirst, speechSupported, subscribeSpeechSupport, type SpeechSession } from '@/lib/speech'
import {
  finalVoiceText,
  liveWordsBesideRecording,
  meterBesideSpeech,
  micFailure,
  micPreflight,
  browserName,
  MIC_POLICY_TEXT,
  micProblemText,
  speechRefusedText,
  transcribeFailText,
  transcribeOffer,
  voiceEngine,
  voiceWhyNot,
  type TranscribeOffer,
  type VoiceEngine,
} from '@/lib/voice'
import { isStandalone } from '@/lib/push'
import { TRANSCRIBE_MAX_SECONDS } from '../../shared/transcribe'

/** The language people speak to Quick add in: English with Indian names and places, by default. */
const LANG = 'en-IN'

/**
 * Who hears this person, and whether AI transcription is open to them (src/lib/voice.ts): the
 * admin's flags, their AI settings, the transcription key, the phone's own recognition and the
 * microphone permission. `engine` null means no voice here (no mic, no hold-for-voice on +).
 */
export function useVoiceSetup(): {
  engine: VoiceEngine | null
  offer: TranscribeOffer
  aiChosen: boolean
  nativeOk: boolean
  whyNot: ReturnType<typeof voiceWhyNot>
} {
  const quickAdd = useFlag('quickAdd')
  const flag = useFlag('aiTranscribe')
  const sharedFlag = useFlag('aiTranscribeShared')
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const status = useAiStatus()
  const aiState = useAiState(firebase)
  const online = useOnline()
  // Re-read when the browser turns out to have no speech service: voice moves to AI where it can.
  const native = useSyncExternalStore(subscribeSpeechSupport, speechSupported, () => false)
  const recorder = useMemo(() => recorderSupported(), [])
  // Watch the permission (a later "granted" is noticed); it no longer hides the mic.
  useSyncExternalStore(subscribeMicPermission, micPermission, () => 'unknown' as const)
  const offer = transcribeOffer({
    mode: firebase ? 'firebase' : 'demo',
    flag,
    sharedFlag,
    status,
    hasOwnKey: !!aiState?.hint,
    aiEnabled: prefs?.aiEnabled ?? true,
  })
  const aiChosen = !!prefs?.aiTranscribe && flag
  // AI's answer still loading (transcribeOffer says neither yes nor why not).
  const aiPending = !offer.ai && offer.why === null && online
  const engine = quickAdd ? voiceEngine({ native, aiChosen, aiReady: offer.ai && online, aiPending, recorder }) : null
  // No engine: why not, so the mic stays and a tap says so (src/lib/voice.ts voiceWhyNot).
  const whyNot = engine ? null : voiceWhyNot({ quickAdd, native, recorder, aiChosen, offer, online })
  return { engine, offer, aiChosen, nativeOk: native, whyNot }
}

export type VoiceState = 'idle' | 'listening' | 'transcribing'

/** What letting go returned: the words, a problem to show, or why there are none yet. */
export interface VoiceResult {
  text: string
  error?: string
  /** the browser's permission prompt took the press: a how-to, not "didn't catch that"; onReady follows once it's allowed */
  asking?: boolean
}

interface Live {
  engine: VoiceEngine
  speech?: SpeechSession | null
  stream?: MediaStream | null
  meter?: () => void
  rec?: Recording
  /** with AI: the phone's recognition running alongside, only for the words live */
  live?: SpeechSession | null
  text: string
  error?: string
  stopping?: boolean
  ended?: Promise<void>
  autoStop?: () => void
  /** waiting on the browser's microphone prompt */
  asking?: boolean
  /** the finger came off while the prompt was up */
  released?: boolean
  /** the browser had the microphone (audio started, or a recording ran) */
  heardAudio?: boolean
  /** the browser's own prompt took this press */
  firstPrompt?: boolean
}

/** Once the site's microphone permission reads "granted" (where the browser reports it): call `f` once. */
function whenAllowed(f: () => void) {
  if (micPermission() === 'granted') return
  const off = subscribeMicPermission(() => {
    if (micPermission() !== 'granted') return
    off()
    f()
  })
  // Don't wait forever on a prompt nobody answers.
  setTimeout(off, 120_000)
}

const where = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return {
    android: /Android/i.test(ua),
    ios: /iPhone|iPad|iPod/.test(ua),
    standalone: isStandalone(),
    host: typeof location === 'undefined' ? undefined : location.host,
    mac: /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua),
    windows: /Windows/.test(ua),
    browser: browserName(ua),
  }
}

/**
 * One voice session at a time: start() opens the microphone (asking for it first where the browser
 * hasn't been allowed yet) and listens (the phone's recognition, or a recording for AI); stop() ends
 * it and resolves with the words, a problem, or that the prompt took the press. `onText` gets the
 * running words while the phone listens; `onLevel` the voice level for the bars (0..1, every frame,
 * only when asked for with `meter`); `onReady` that the microphone was just allowed after the finger
 * came off. A soft blip and a short buzz mark the start and the stop. Every problem goes to the
 * admin's Logs (kind 'voice') with the browser's own code, so a phone's failure can be read.
 */
export function useVoice(opts: {
  engine: VoiceEngine | null
  onText?: (t: string) => void
  onLevel?: (l: number) => void
  /** the session ended by itself with a problem (refused, no microphone) */
  onError?: (message: string) => void
  /** the microphone was allowed after the press ended: say it's ready */
  onReady?: () => void
  /** the browser's prompt took the press while the finger was still down: say what to do */
  onAsk?: () => void
  meter?: boolean
  sound?: boolean
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const o = useRef(opts)
  o.current = opts
  const live = useRef<Live | null>(null)

  const log = (stage: Parameters<typeof voiceProblem>[0]['stage'], code: string | undefined) =>
    reportAppError(
      voiceProblem({
        stage,
        code,
        engine: o.current.engine,
        perm: micPermission(),
        native: speechSupported(),
        recorder: recorderSupported(),
        okBefore: micAllowedBefore(),
        policy: micPolicyAllows(),
      }),
      'voice',
    )

  const cleanup = useCallback(() => {
    const l = live.current
    l?.meter?.()
    closeMic(l?.stream)
    live.current = null
  }, [])
  useEffect(
    () => () => {
      live.current?.speech?.abort()
      live.current?.live?.abort()
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

  /** The session can't go on: tidy up and say why (once). */
  const fail = (l: Live, message: string) => {
    if (live.current !== l) return
    stopPulse()
    cleanup()
    setState('idle')
    if (message) o.current.onError?.(message)
  }

  /** Why the browser's recognition was refused, found by opening the microphone once. */
  const explainRefusal = async (): Promise<string> => {
    try {
      const s = await openMic()
      for (const t of s.getTracks()) t.stop()
      return speechRefusedText(where())
    } catch (e) {
      const { name, message } = (e ?? {}) as { name?: string; message?: string }
      log('mic', `${name ?? ''} ${message ?? ''}`.trim().slice(0, 80))
      return micProblemText(micFailure(name, message), await micPermissionNow(), where())
    }
  }

  /** The phone's own recognition for this session. */
  const listenNative = (l: Live): boolean => {
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
      onEnd: (err, code) => {
        if (code) log('speech', code)
        // Refused before voice ever worked here, with the browser still able to ask: that was the
        // prompt taking the press (or answered late), not a no. Say what to do instead.
        if (code === 'not-allowed' && !micAllowedBefore() && micPermission() !== 'denied') {
          l.firstPrompt = true
          err = undefined
        }
        // A refusal (or no microphone) after voice was allowed: open the microphone to see which
        // switch it is (the site, the device, or Apple's Speech Recognition) and name that one.
        if ((code === 'not-allowed' || code === 'audio-capture') && !l.firstPrompt && !l.stopping && live.current === l) {
          done()
          void explainRefusal().then((t) => fail(l, t))
          return
        }
        // No speech service in this browser: the next press goes to AI when AI can serve them.
        l.error = err
        done()
        // Ended by itself (a refusal, no microphone): the session is over.
        if (live.current === l && l.error && !l.stopping) fail(l, l.error)
        // The prompt ended it while the finger was still down: say what to do, and when it's ready.
        else if (live.current === l && l.firstPrompt && !l.stopping) {
          fail(l, '')
          o.current.onAsk?.()
          whenAllowed(() => o.current.onReady?.())
        }
      },
      // The browser has the microphone now; the bars' meter opens its own where that's safe (Chrome
      // shares it). On Apple's WebKit a second stream can starve recognition: the words drive the bars.
      onAudio: () => {
        l.heardAudio = true
        markMicAllowed()
        void (meterBesideSpeech(navigator.userAgent) ? openMeter(l) : startPulse())
      },
    })
    if (!l.speech) {
      log('start', 'no-recognition')
      fail(l, 'Couldn’t start listening. Type it instead.')
      return false
    }
    return true
  }

  /** Starts listening; false (with the problem already passed to onError, or the prompt still up) when it isn't. */
  const start = async (): Promise<boolean> => {
    const engine = o.current.engine
    if (!engine || live.current) return false
    const l: Live = { engine, text: '' }
    live.current = l
    setState('listening')
    if (o.current.sound !== false) blip('start')
    buzz(12)

    // A blocked microphone says where to allow it, before anything else.
    // The site itself doesn't allow the microphone (its Permissions-Policy): no setting of theirs can
    // fix that, so don't send them looking for one.
    if (micPolicyAllows() === false) {
      log('mic', 'policy')
      fail(l, MIC_POLICY_TEXT)
      return false
    }
    let pre = micPreflight({ perm: micPermission(), okBefore: micAllowedBefore() })
    if (pre === 'blocked') {
      // Ask anyway, once per press: when it's Android that keeps the microphone from Chrome, Chrome
      // shows its own prompt that leads to the switch; a site the person blocked just refuses again.
      // The stream closes at once, so the browser's recognition still has the microphone to itself.
      const back = await openMic().then(
        (s) => {
          for (const t of s.getTracks()) t.stop()
          return null
        },
        (e: unknown) => e as { name?: string; message?: string },
      )
      if (live.current !== l) return false
      if (back) {
        // The browser's own words go to Logs: "by system" means the computer, not the site.
        log('mic', `blocked ${back.name ?? ''} ${back.message ?? ''}`.trim().slice(0, 80))
        const f = micFailure(back.name, back.message)
        fail(l, micProblemText(f === 'system' ? 'system' : 'refused', 'denied', where()))
        return false
      }
      pre = 'go'
    }
    // The browser's own recognition asks for the microphone itself and must have it to itself: no
    // stream is opened here (on Android a second one took it from Google's recogniser). Opera, Brave
    // and Vivaldi's may never ask, so the microphone is opened (and closed) first: the prompt shows.
    if (engine === 'native' && speechNeedsMicFirst() && pre !== 'go') {
      try {
        closeMic(await openMic())
      } catch (e) {
        const { name, message } = (e ?? {}) as { name?: string; message?: string }
        log('mic', `${name ?? ''} ${message ?? ''}`.trim().slice(0, 80))
        fail(l, micProblemText(micFailure(name, message), await micPermissionNow(), where()))
        return false
      }
      if (live.current !== l) return false
    }
    if (engine === 'native') return listenNative(l)

    // AI records: the stream first (its prompt shows now, where the browser hasn't been allowed yet).
    {
      l.asking = pre === 'ask'
      let stream: MediaStream
      try {
        stream = await openMic()
      } catch (e) {
        const { name, message } = (e ?? {}) as { name?: string; message?: string }
        log('mic', `${name ?? ''} ${message ?? ''}`.trim().slice(0, 80))
        const f = micFailure(name, message)
        // A refusal asks again only while the browser will; else where the switch is.
        const perm = await micPermissionNow()
        fail(l, micProblemText(f, perm, where()))
        return false
      }
      l.asking = false
      if (live.current !== l) {
        closeMic(stream)
        return false
      }
      // The finger came off to answer the prompt: nothing was said. Say it's ready instead.
      if (l.released) {
        closeMic(stream)
        cleanup()
        setState('idle')
        o.current.onReady?.()
        return false
      }
      l.stream = stream
    }

    if (!l.stream) {
      fail(l, 'Couldn’t open the microphone. Try again, or type it.')
      return false
    }
    l.heardAudio = true
    void openMeter(l)
    l.rec = record(l.stream, TRANSCRIBE_MAX_SECONDS * 1000, () => l.autoStop?.())
    // The words live while AI records (owner, 23 Oct 2026): the phone's own recognition, where it can
    // share the microphone, only shows them; AI's text replaces them on letting go (finalVoiceText).
    // Not on Android, where it is a second app on the microphone (liveWordsBesideRecording).
    if (speechSupported() && liveWordsBesideRecording(navigator.userAgent))
      l.live = listen({
        lang: LANG,
        side: true,
        onText: (t) => {
          l.text = t
          o.current.onText?.(t)
        },
        onEnd: (_err, code) => {
          if (code) log('side', code)
        },
      })
    return true
  }

  const stop = async (): Promise<VoiceResult> => {
    const l = live.current
    if (!l) return { text: '' }
    // Let go while the browser's prompt was up: it carries on; onReady says when it's allowed.
    if (l.asking) {
      l.released = true
      setState('idle')
      return { text: '', asking: true }
    }
    l.stopping = true
    if (o.current.sound !== false) blip('stop')
    stopPulse()
    if (l.engine === 'native') {
      l.speech?.stop()
      // The last words arrive just after stop(); wait for them, but never long.
      await Promise.race([l.ended, new Promise((r) => setTimeout(r, 1500))])
      cleanup()
      setState('idle')
      const text = l.text.trim()
      if (l.error) return { text, error: l.error }
      // Nothing heard and the browser never had the microphone, on a device where voice hasn't worked
      // yet: the press went to the browser's prompt (iPhone asks for speech recognition separately).
      if (!text && (l.firstPrompt || (!l.heardAudio && !micAllowedBefore()))) {
        whenAllowed(() => o.current.onReady?.())
        return { text: '', asking: true }
      }
      return { text }
    }
    // Let go before the microphone even opened: nothing was said.
    if (!l.rec) {
      cleanup()
      setState('idle')
      return { text: '' }
    }
    l.live?.abort()
    const blob = await l.rec.stop()
    l.meter?.()
    l.meter = undefined
    closeMic(l.stream)
    setState('transcribing')
    const heard = l.text
    try {
      if (blob.size < 800) return finalVoiceText({ text: '' }, heard)
      const r = await repo.transcribeAi({ audio: await blobToBase64(blob), mimeType: blob.type || 'audio/webm', lang: LANG })
      if (!r) {
        log('transcribe', 'no-answer')
        return finalVoiceText({ text: '', error: transcribeFailText({ demo: repo.mode !== 'firebase' }) }, heard)
      }
      if (r.unavailable) {
        log('transcribe', r.reason)
        return finalVoiceText({ text: '', error: transcribeFailText({ demo: false, reason: r.reason }) }, heard)
      }
      return finalVoiceText({ text: r.text }, heard)
    } catch (e) {
      log('transcribe', (e as { code?: string; name?: string })?.code ?? (e as { name?: string })?.name)
      return finalVoiceText({ text: '', error: transcribeFailText({ demo: false }) }, heard)
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
    const l = live.current
    // The prompt is still up: let it finish quietly (its stream is closed when it's answered).
    if (l?.asking) {
      l.released = true
      setState('idle')
      return
    }
    l?.speech?.abort()
    l?.live?.abort()
    l?.rec?.cancel()
    stopPulse()
    cleanup()
    setState('idle')
  }

  return { state, start, stop, cancel, onLimit }
}
