import { useRef, useState } from 'react'
import { recognizeImage } from '@/lib/ocr'

/** Thrown by `run()` when `cancel()` was tapped before the text came back. */
export class OcrCancelled extends Error {
  name = 'OcrCancelled'
  constructor() { super('Reading cancelled') }
}

/**
 * On-device OCR with progress for the UI. `cancel()` drops the result of the read in flight
 * (the worker itself finishes in the background; src/lib/ocr.ts owns its lifetime).
 */
export function useOcr() {
  const [progress, setProgress] = useState<number | null>(null)
  const run = useRef(0)
  return {
    busy: progress !== null,
    progress: progress ?? 0,
    async run(file: File) {
      const id = ++run.current
      setProgress(0)
      try {
        const text = await recognizeImage(file, (p) => { if (run.current === id) setProgress(p) })
        if (run.current !== id) throw new OcrCancelled()
        return text
      } finally {
        if (run.current === id) setProgress(null)
      }
    },
    cancel() {
      run.current++
      setProgress(null)
    },
  }
}
