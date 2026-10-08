import { repo } from '@/data'
import { downscale, blobToDataUrl } from './image'
import { recognizeImage } from './ocr'
import { parseReceipt, type ParsedReceipt } from './ocr-parse'

/*
 * Bill reading: Gemini (server-side, see functions/src/ai.ts) first, the on-device OCR + parser
 * as the fallback when AI is off, offline, in demo mode, or fails.
 */

const PREF = 'splitit-ai-scan'

/** On unless the user chose on-device only. */
export function aiScanEnabled(): boolean {
  try { return localStorage.getItem(PREF) !== 'off' } catch { return true }
}
export function setAiScan(on: boolean) {
  try { localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* storage unavailable */ }
}
export const aiScanPossible = () => repo.mode === 'firebase'

export type ReadVia = 'ai' | 'device'

export interface ReadResult {
  parsed: ParsedReceipt
  via: ReadVia
  /** AI was on but no key could be used (or it failed), so the phone read it instead */
  fellBack?: boolean
}

/** `stage` reports 'ai' while waiting on Gemini, then OCR progress 0..1 if it falls back. */
export async function readReceipt(file: File, onStage: (s: { stage: ReadVia; progress?: number }) => void): Promise<ReadResult> {
  if (aiScanEnabled() && aiScanPossible()) {
    onStage({ stage: 'ai' })
    try {
      const img = await downscale(file, 1600, 0.82)
      const url = await blobToDataUrl(img)
      const [head, data] = url.split(',', 2)
      const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
      const r = await repo.readReceiptAi(data, mime)
      if (r?.receipt) return { parsed: r.receipt, via: 'ai' }
      if (r && !r.receipt) return { parsed: { items: [] }, via: 'ai' }
    } catch (e) {
      console.warn('AI reading failed, using on-device OCR', e)
    }
  }
  const fellBack = aiScanEnabled() && aiScanPossible()
  onStage({ stage: 'device', progress: 0 })
  const text = await recognizeImage(file, (p) => onStage({ stage: 'device', progress: p }))
  return { parsed: parseReceipt(text), via: 'device', fellBack }
}
