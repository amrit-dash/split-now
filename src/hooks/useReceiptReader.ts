import { useRef, useState } from 'react'
import { isAbortError } from '@/lib/abortable'
import { readReceipt, type ReadVia } from '@/lib/ai'
import { OcrCancelled } from './useOcr'

/**
 * Bill reading with a stage for the UI: "Reading with AI…" or OCR progress. `cancel()` frees the
 * UI at once: `read()` rejects with OcrCancelled, the wait on Gemini ends (its answer is dropped),
 * no on-phone fallback starts and an OCR stage in progress is stopped.
 */
export function useReceiptReader() {
  const [state, setState] = useState<{ stage: ReadVia; progress?: number } | null>(null)
  const run = useRef(0)
  const ctrl = useRef<AbortController>(undefined)
  return {
    busy: state !== null,
    stage: state?.stage,
    progress: state?.progress ?? 0,
    /** e.g. "Reading with AI…" / "Reading… 42%" */
    label: !state ? '' : state.stage === 'ai' ? 'Reading with AI…' : `Reading… ${Math.round((state.progress ?? 0) * 100)}%`,
    async read(file: File) {
      const id = ++run.current
      const c = new AbortController()
      ctrl.current = c
      setState({ stage: 'ai' })
      try {
        return await readReceipt(
          file,
          (s) => {
            if (run.current === id) setState(s)
          },
          c.signal,
        )
      } catch (e) {
        if (c.signal.aborted || isAbortError(e)) throw new OcrCancelled()
        throw e
      } finally {
        if (ctrl.current === c) ctrl.current = undefined
        if (run.current === id) setState(null)
      }
    },
    cancel() {
      run.current++
      ctrl.current?.abort()
      ctrl.current = undefined
      setState(null)
    },
  }
}
