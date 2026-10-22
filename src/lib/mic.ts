/*
 * The microphone, for voice in Quick add (browser-only helpers; the decisions are src/lib/voice.ts):
 * the site's microphone permission, a level meter for the bars above + (an AnalyserNode on the
 * mic stream), recording a short clip for AI transcription (MediaRecorder), and the soft blip
 * when listening starts and stops (a tiny WebAudio tone, no sound file).
 */
import { pickRecorderMime, rmsToLevel, smoothLevel } from './voice'
import { setSpeechDenied } from './speech'

type Perm = 'granted' | 'denied' | 'prompt' | 'unknown'
let perm: Perm = 'unknown'
const permSubs = new Set<() => void>()
let watching = false

/** The site's microphone permission, watched once: a later "granted" brings a hidden mic back. */
export function micPermission(): Perm {
  if (!watching && typeof navigator !== 'undefined' && navigator.permissions?.query) {
    watching = true
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        const set = () => {
          perm = s.state as Perm
          if (perm === 'granted') setSpeechDenied(false)
          for (const f of permSubs) f()
        }
        set()
        s.onchange = set
      })
      .catch(() => {
        /* not offered (Firefox, older Safari): unknown */
      })
  }
  return perm
}
export function subscribeMicPermission(f: () => void): () => void {
  permSubs.add(f)
  return () => permSubs.delete(f)
}

export const recorderSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export async function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
}

export const closeMic = (s: MediaStream | null | undefined) => {
  for (const t of s?.getTracks() ?? []) t.stop()
}

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  ctx ??= new C()
  return ctx
}

/** Call inside a tap or press: phones only let sound start from a gesture. */
export function primeAudio(): void {
  try {
    void audio()?.resume()
  } catch {
    /* no sound here */
  }
}

/**
 * The level of the voice, 0..1, about 30 times a second, until the returned stop is called. Drawn
 * by the caller (the bars write their own heights; no React state per frame).
 */
export function levelMeter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const a = audio()
  if (!a) return () => {}
  const src = a.createMediaStreamSource(stream)
  const an = a.createAnalyser()
  an.fftSize = 512
  src.connect(an)
  const buf = new Float32Array(an.fftSize)
  let level = 0
  let raf = 0
  const tick = () => {
    an.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    level = smoothLevel(level, rmsToLevel(Math.sqrt(sum / buf.length)))
    onLevel(level)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    try {
      src.disconnect()
    } catch {
      /* gone */
    }
  }
}

export interface Recording {
  /** stop and get the clip */
  stop(): Promise<Blob>
  /** throw the clip away */
  cancel(): void
}

/** Record the stream (Opus where the browser makes it, MP4 on Safari) at a speech bitrate; stops itself after `maxMs`. */
export function record(stream: MediaStream, maxMs: number, onLimit: () => void): Recording {
  const mimeType = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  rec.start(250)
  const limit = setTimeout(onLimit, maxMs)
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        clearTimeout(limit)
        if (rec.state === 'inactive') return resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
        rec.stop()
      }),
    cancel: () => {
      clearTimeout(limit)
      if (rec.state !== 'inactive') rec.stop()
    },
  }
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

/** A soft, short tone: rising when listening starts, falling when it stops. Quiet, and silent where sound can't play. */
export function blip(kind: 'start' | 'stop'): void {
  try {
    const a = audio()
    if (a?.state !== 'running') return
    const t = a.currentTime
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(kind === 'start' ? 660 : 880, t)
    o.frequency.exponentialRampToValueAtTime(kind === 'start' ? 990 : 590, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + 0.13)
  } catch {
    /* no sound here */
  }
}

/** A short buzz where the phone has one. */
export function buzz(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not offered */
  }
}
