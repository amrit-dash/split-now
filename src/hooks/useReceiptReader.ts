import { useState } from 'react'
import { readReceipt, type ReadVia } from '@/lib/ai'

/** Bill reading with a stage for the UI: "Reading with AI…" or OCR progress. */
export function useReceiptReader() {
  const [state, setState] = useState<{ stage: ReadVia; progress?: number } | null>(null)
  return {
    busy: state !== null,
    stage: state?.stage,
    progress: state?.progress ?? 0,
    /** e.g. "Reading with AI…" / "Reading… 42%" */
    label: !state ? '' : state.stage === 'ai' ? 'Reading with AI…' : `Reading… ${Math.round((state.progress ?? 0) * 100)}%`,
    async read(file: File) {
      setState({ stage: 'ai' })
      try {
        return await readReceipt(file, setState)
      } finally {
        setState(null)
      }
    },
  }
}
