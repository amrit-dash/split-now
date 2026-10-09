import { repo } from '@/data'
import type { AiUnavailableReason } from '../../shared/ai-config'
import { abortable, throwIfAborted } from './abortable'
import { downscale, blobToDataUrl } from './image'
import { recognizeImage } from './ocr'
import { parseReceipt, type ParsedReceipt } from './ocr-parse'

/*
 * Bill reading: Gemini (server-side, see functions/src/ai.ts) first, the on-device OCR + parser
 * as the fallback when AI is off, offline, in demo mode, or fails.
 */

export type { AiUnavailableReason }
// The copy for a declined AI call lives with the other AI copy (pure, tested); re-exported for the screens.
export { isQuietReason, unavailableText } from './ai-copy'

/** What parseReceiptAi answers (the repo passes it through; null = offline, demo or the call failed). */
export type ReceiptAiResult = { receipt: ParsedReceipt | null; unavailable?: undefined } | { unavailable: true; reason?: AiUnavailableReason }

const PREF = 'splitit-ai-scan'

/** On unless the user chose on-device only. */
export function aiScanEnabled(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off'
  } catch {
    return true
  }
}
export function setAiScan(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off')
  } catch {
    /* storage unavailable */
  }
}
export const aiScanPossible = () => repo.mode === 'firebase'

export type ReadVia = 'ai' | 'device'

export interface ReadResult {
  parsed: ParsedReceipt
  via: ReadVia
  /** AI was on but no key could be used (or it failed), so the phone read it instead */
  fellBack?: boolean
  /** why, when the server said so (see unavailableText) */
  reason?: AiUnavailableReason
  /** Gemini looked and says the image isn't a bill (no items, no total); the caller may offer a phone read */
  notABill?: boolean
}

/**
 * `stage` reports 'ai' while waiting on Gemini, then OCR progress 0..1 if it falls back. `signal`
 * cancels: the wait on Gemini ends at once (the call itself runs out on the server and its answer
 * is dropped), no fallback starts, and the OCR stage stops (see recognizeImage). An aborted read
 * rejects with an AbortError (src/lib/abortable.ts isAbortError).
 */
export async function readReceipt(file: File, onStage: (s: { stage: ReadVia; progress?: number }) => void, signal?: AbortSignal): Promise<ReadResult> {
  let reason: AiUnavailableReason | undefined
  if (aiScanEnabled() && aiScanPossible()) {
    onStage({ stage: 'ai' })
    try {
      const img = await abortable(downscale(file, 1600, 0.82), signal)
      const url = await abortable(blobToDataUrl(img), signal)
      const [head, data] = url.split(',', 2)
      const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
      // The repo returns { receipt } or null today; once it passes the server's reason through
      // (src/data/repo.ts contract), the right line is shown without further changes here.
      const r = (await abortable(repo.readReceiptAi(data, mime), signal)) as ReceiptAiResult | null
      if (r && !r.unavailable && r.receipt) return { parsed: r.receipt, via: 'ai' }
      if (r && !r.unavailable) return { parsed: { items: [] }, via: 'ai', notABill: true }
      reason = r?.reason ?? 'server'
    } catch (e) {
      if (signal?.aborted) throw e
      console.warn('AI reading failed, using on-device OCR', e)
      reason = 'server'
    }
  }
  throwIfAborted(signal)
  const fellBack = aiScanEnabled() && aiScanPossible()
  onStage({ stage: 'device', progress: 0 })
  const text = await recognizeImage(file, (p) => onStage({ stage: 'device', progress: p }), signal)
  return fellBack ? { parsed: parseReceipt(text), via: 'device', fellBack, reason } : { parsed: parseReceipt(text), via: 'device' }
}
