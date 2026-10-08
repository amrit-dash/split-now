import { repo } from '@/data'
import type { AiUnavailableReason } from '../../shared/ai-config'
import { downscale, blobToDataUrl } from './image'
import { recognizeImage } from './ocr'
import { parseReceipt, type ParsedReceipt } from './ocr-parse'

/*
 * Bill reading: Gemini (server-side, see functions/src/ai.ts) first, the on-device OCR + parser
 * as the fallback when AI is off, offline, in demo mode, or fails.
 */

export type { AiUnavailableReason }

/** What parseReceiptAi answers (the repo passes it through; null = offline, demo or the call failed). */
export type ReceiptAiResult = { receipt: ParsedReceipt | null; unavailable?: undefined } | { unavailable: true; reason?: AiUnavailableReason }

/**
 * One line per reason, for the Scan / Statement screens. 'off', 'not_listed' and 'not_configured'
 * are not errors (the phone reads the bill instead); 'quota', 'bad_key' and 'server' are worth a
 * neutral mention. `limit` is the daily shared-key allowance, when known.
 */
export function unavailableText(reason: AiUnavailableReason | undefined, opts: { limit?: number } = {}): string {
  switch (reason) {
    case 'quota':
      return opts.limit
        ? `You’ve used today’s AI limit (${opts.limit}). Read on your phone for now.`
        : 'You’ve used today’s AI limit. Read on your phone for now.'
    case 'bad_key':
      return 'Google rejected the Gemini key. Check it in Settings → AI features; reading on your phone instead.'
    case 'server':
      return 'Gemini didn’t answer. Reading on your phone instead.'
    case 'not_listed':
      return 'AI reading is limited to listed accounts. Reading on your phone instead.'
    case 'not_configured':
      return 'AI reading isn’t set up for this app. Reading on your phone instead.'
    case 'off':
      return 'AI reading is off. Reading on your phone instead.'
    default:
      return 'AI reading isn’t available right now. Reading on your phone instead.'
  }
}

/** Reasons that mean "nothing to fix": show nothing, or at most a quiet line. */
export const isQuietReason = (reason: AiUnavailableReason | undefined) => reason === 'off' || reason === 'not_listed' || reason === 'not_configured'

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

/** `stage` reports 'ai' while waiting on Gemini, then OCR progress 0..1 if it falls back. */
export async function readReceipt(file: File, onStage: (s: { stage: ReadVia; progress?: number }) => void): Promise<ReadResult> {
  let reason: AiUnavailableReason | undefined
  if (aiScanEnabled() && aiScanPossible()) {
    onStage({ stage: 'ai' })
    try {
      const img = await downscale(file, 1600, 0.82)
      const url = await blobToDataUrl(img)
      const [head, data] = url.split(',', 2)
      const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
      // The repo returns { receipt } or null today; once it passes the server's reason through
      // (src/data/repo.ts contract), the right line is shown without further changes here.
      const r = (await repo.readReceiptAi(data, mime)) as ReceiptAiResult | null
      if (r && !r.unavailable && r.receipt) return { parsed: r.receipt, via: 'ai' }
      if (r && !r.unavailable) return { parsed: { items: [] }, via: 'ai', notABill: true }
      reason = r?.reason ?? 'server'
    } catch (e) {
      console.warn('AI reading failed, using on-device OCR', e)
      reason = 'server'
    }
  }
  const fellBack = aiScanEnabled() && aiScanPossible()
  onStage({ stage: 'device', progress: 0 })
  const text = await recognizeImage(file, (p) => onStage({ stage: 'device', progress: p }))
  return fellBack ? { parsed: parseReceipt(text), via: 'device', fellBack, reason } : { parsed: parseReceipt(text), via: 'device' }
}
