import { useRef, useState } from 'react'
import { isAbortError } from '@/lib/abortable'
import { recognizeImage } from '@/lib/ocr'

/** Thrown by `run()` when `cancel()` was tapped before the text came back. */
export class OcrCancelled extends Error {
  name = 'OcrCancelled'
  constructor() {
    super('Reading cancelled')
  }
}

/**
 * On-device OCR with progress for the UI. `cancel()` ends the read in flight: `run()` rejects
 * with OcrCancelled at once and the job on the shared worker is stopped (src/lib/ocr.ts decides
 * whether the worker can be terminated or the job must run out with its answer dropped).
 */
export function useOcr() {
  const [progress, setProgress] = useState<number | null>(null)
  const run = useRef(0)
  const ctrl = useRef<AbortController>(undefined)
  return {
    busy: progress !== null,
    progress: progress ?? 0,
    async run(file: File) {
      const id = ++run.current
      const c = new AbortController()
      ctrl.current = c
      setProgress(0)
      try {
        const text = await recognizeImage(
          file,
          (p) => {
            if (run.current === id) setProgress(p)
          },
          c.signal,
        )
        if (run.current !== id) throw new OcrCancelled()
        return text
      } catch (e) {
        if (c.signal.aborted || isAbortError(e)) throw new OcrCancelled()
        throw e
      } finally {
        if (ctrl.current === c) ctrl.current = undefined
        if (run.current === id) setProgress(null)
      }
    },
    cancel() {
      run.current++
      ctrl.current?.abort()
      ctrl.current = undefined
      setProgress(null)
    },
  }
}
