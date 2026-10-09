import type { Worker } from 'tesseract.js'
import { abortable, throwIfAborted } from './abortable'
import { downscale } from './image'

/*
 * On-device OCR. tesseract.js and its wasm core load on first use (never in the main bundle)
 * into one worker that is reused across scans: starting a worker means compiling ~3 MB of wasm
 * and loading the English model, seconds of CPU on a phone, so a worker per scan made every
 * scan a cold one. The worker is dropped after a minute idle.
 */

/** Core builds shipped under /tesseract/ by scripts/vite-tesseract.ts, fastest first. */
export type CoreVariant = 'relaxedsimd' | 'simd' | 'basic'

// Tiny modules that only validate on an engine with the feature (byte sequences from wasm-feature-detect, Apache-2.0).
const SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]
const RELAXED_SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11]

/** The fastest core this engine can run (the same check tesseract.js makes when given a directory). */
export function coreVariant(validate: (bytes: Uint8Array<ArrayBuffer>) => boolean = (b) => WebAssembly.validate(b)): CoreVariant {
  try {
    if (validate(new Uint8Array(RELAXED_SIMD))) return 'relaxedsimd'
    if (validate(new Uint8Array(SIMD))) return 'simd'
  } catch {
    /* no WebAssembly at all: the basic core fails too, with a clearer error from the worker */
  }
  return 'basic'
}

/** Path of a core's Emscripten glue; the matching .wasm sits next to it (and next to the worker). */
export function corePath(variant: CoreVariant): string {
  return `/tesseract/tesseract-core-${variant === 'basic' ? '' : `${variant}-`}lstm.js`
}

const IDLE_MS = 60_000
let workerP: Promise<Worker> | undefined
let idle: ReturnType<typeof setTimeout> | undefined
let inFlight = 0
let onProgress: ((p: number) => void) | undefined

async function spawn(): Promise<Worker> {
  const { createWorker } = await import('tesseract.js')
  return createWorker('eng', 1, {
    // Self-hosted (see scripts/vite-tesseract.ts) so the service worker can cache them for offline use.
    workerPath: '/tesseract/worker.min.js',
    // A .js corePath is loaded as given; a directory would make the worker pick the base64 *.wasm.js build.
    corePath: corePath(coreVariant()),
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
}

function worker(): Promise<Worker> {
  clearTimeout(idle)
  workerP ??= spawn().catch((e) => {
    workerP = undefined
    throw e
  })
  return workerP
}

function dropWorker() {
  const p = workerP
  workerP = undefined
  p?.then((w) => w.terminate()).catch(() => {
    /* never started or already gone */
  })
}

function scheduleIdle() {
  clearTimeout(idle)
  if (inFlight === 0) idle = setTimeout(dropWorker, IDLE_MS)
}

/** Start loading the worker and model now (e.g. when the Scan screen opens), so the first scan isn't a cold one. */
export function warmOcr(): void {
  worker().then(scheduleIdle, () => {
    /* reported by the scan that needs it */
  })
}

/**
 * Text of the image. With `signal`, an abort rejects at once with an AbortError. The job on the
 * shared worker can't be cancelled on its own, so when no other scan is using the worker it is
 * terminated (the next scan starts a fresh one rather than queueing behind a read nobody wants);
 * when another scan shares it, the job runs out and its answer is dropped.
 */
export async function recognizeImage(file: File, progress?: (p: number) => void, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  inFlight++
  clearTimeout(idle)
  onProgress = progress
  const stop = () => {
    if (inFlight === 1) dropWorker()
  }
  try {
    // Loading the worker carries on after an abort, so the next scan finds it warm.
    const [w, image] = await abortable(Promise.all([worker(), downscale(file, 1600, 0.9)]), signal)
    // Stage boundary: a cancel during loading never starts the recognize.
    throwIfAborted(signal)
    signal?.addEventListener('abort', stop, { once: true })
    try {
      const { data } = await abortable(w.recognize(image), signal)
      return data.text
    } catch (e) {
      // A worker that failed mid-recognition isn't trusted again; the next scan starts a fresh one.
      if (!signal?.aborted) dropWorker()
      throw e
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    inFlight--
    if (onProgress === progress) onProgress = undefined
    scheduleIdle()
  }
}
