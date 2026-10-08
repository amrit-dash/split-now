import type { ParsedPayment, ParsedReceipt } from './ocr-parse'
import type { ScanKind } from './scanHistory'

/** In-memory hand-off between the Scan screen and the expense/settle forms (survives SPA navigation). */
export const pending: {
  /** `history`: the Recent scans entry it came from, so the saved expense can be noted on it */
  receipt?: { parsed: ParsedReceipt; file: File; history?: { id: string; kind: ScanKind } }
  payment?: { parsed: ParsedPayment; file: File }
} = {}

const CAPTURE_KEY = 'splitit-pending-capture'

/**
 * Remember a /capture link opened while signed out, so it is filed right after sign-in.
 * localStorage (not sessionStorage) so it survives a sign-in redirect or a closed tab.
 */
export function stashCapture(search: string) {
  try { localStorage.setItem(CAPTURE_KEY, search) } catch { /* storage unavailable */ }
}

export function takeStashedCapture(): string | null {
  try {
    const v = localStorage.getItem(CAPTURE_KEY)
    if (v) localStorage.removeItem(CAPTURE_KEY)
    return v
  } catch {
    return null
  }
}
