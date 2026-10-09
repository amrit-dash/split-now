/*
 * Auto-capture filters set in Profile → Auto-capture (users/{uid}/settings/notifications),
 * shared by the capture webhook (functions/src/capture.ts) and the client (settings UI, demo
 * simulation, activity log). Pure: no Firebase imports.
 */

/** Most ignore keywords a user can keep, and the longest one. Mirrored in firestore.rules. */
export const MAX_IGNORE_WORDS = 20
export const MAX_IGNORE_WORD_LEN = 40
/** Upper bound for the minimum amount (₹1,00,000 in paise). Mirrored in firestore.rules. */
export const MAX_MIN_AMOUNT = 10_000_000

/** Suggestions shown as chips under the ignore-keywords field. */
export const IGNORE_SUGGESTIONS = ['SIP', 'mutual fund', 'rent', 'credit card bill', 'EMI', 'insurance'] as const

export interface CaptureFilterPrefs {
  /** master switch: the webhook stores nothing while paused */
  capturePaused: boolean
  /** minor units (paise). INR debits below this are ignored; 0 = off */
  minAmount: number
  /** case-insensitive words / phrases; a debit SMS (or merchant) containing one is ignored */
  ignoreWords: string[]
  /** let Gemini read bank SMS the built-in parser can't (server-side fallback) */
  aiSms: boolean
  /** read bill photos and statement screenshots with Gemini (the app falls back to on-device OCR) */
  aiImages: boolean
}

export const DEFAULT_FILTERS: CaptureFilterPrefs = { capturePaused: false, minAmount: 0, ignoreWords: [], aiSms: true, aiImages: true }

/** Trim, collapse spaces, drop empties and duplicates (case-insensitive), cap count and length. */
export function normaliseIgnoreWords(words: unknown): string[] {
  if (!Array.isArray(words)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of words) {
    if (typeof w !== 'string') continue
    const s = w.replace(/\s+/g, ' ').trim().slice(0, MAX_IGNORE_WORD_LEN)
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
    if (out.length >= MAX_IGNORE_WORDS) break
  }
  return out
}

/** "SIP, rent ,  Mutual fund" → ['SIP', 'rent', 'Mutual fund'] */
export function parseIgnoreWords(input: string): string[] {
  return normaliseIgnoreWords(input.split(/[,\n]/))
}

export function normaliseMinAmount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0
  return Math.min(Math.round(v), MAX_MIN_AMOUNT)
}

/** Raw stored doc → filters with defaults (bad types fall back to defaults). */
export function resolveFilters(raw: unknown): CaptureFilterPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    capturePaused: r.capturePaused === true,
    minAmount: normaliseMinAmount(r.minAmount),
    ignoreWords: normaliseIgnoreWords(r.ignoreWords),
    aiSms: r.aiSms !== false,
    aiImages: r.aiImages !== false,
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The first ignore word found in any of `texts`, matched case-insensitively on word boundaries
 * ("SIP" matches "SIP debit" and "NACH/SIP/..." but not "gossip"). Spaces in a phrase match any
 * run of whitespace.
 */
export function matchIgnoreWord(words: string[], ...texts: Array<string | undefined>): string | undefined {
  const hay = texts.filter(Boolean).join('\n')
  if (!hay) return undefined
  for (const w of words) {
    const core = escapeRe(w.trim()).replace(/\s+/g, '\\s+')
    if (!core) continue
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${core}($|[^\\p{L}\\p{N}])`, 'iu').test(hay)) return w
  }
  return undefined
}

/**
 * Why a parsed debit should be dropped by the user's filters, or undefined to keep it.
 * The minimum amount applies to INR only (it's set in rupees); foreign-currency card spends are
 * always kept.
 */
export function filterReason(
  f: CaptureFilterPrefs,
  p: { amount: number; currency: string; merchant?: string },
  text?: string,
): 'below_min' | 'ignored' | undefined {
  if (f.minAmount > 0 && p.currency === 'INR' && p.amount < f.minAmount) return 'below_min'
  if (f.ignoreWords.length && matchIgnoreWord(f.ignoreWords, text, p.merchant)) return 'ignored'
  return undefined
}

// ---- Capture activity log (users/{uid}/captureLog) ------------------------

export type CaptureLogResult =
  | 'captured' | 'duplicate' | 'outside_trip' | 'not_a_debit' | 'unparsed' | 'paused' | 'below_min' | 'ignored'

export interface CaptureLogEntry {
  /** epoch ms */
  at: number
  result: CaptureLogResult
  /** minor units */
  amount?: number
  currency?: string
  merchant?: string
  groupName?: string
  device: 'ios' | 'android' | 'other'
}

/** How many entries the webhook keeps per user (older ones are deleted, best-effort). */
export const CAPTURE_LOG_KEEP = 30

export const LOG_RESULTS: readonly CaptureLogResult[] = ['captured', 'duplicate', 'outside_trip', 'not_a_debit', 'unparsed', 'paused', 'below_min', 'ignored']
export const isLogResult = (r: string): r is CaptureLogResult => (LOG_RESULTS as readonly string[]).includes(r)

/** One-line friendly text for an activity entry. */
export function logResultText(e: Pick<CaptureLogEntry, 'result' | 'groupName'>): string {
  switch (e.result) {
    case 'captured': return e.groupName ? `Captured for ${e.groupName}` : 'Captured to your inbox'
    case 'duplicate': return 'Already captured (same message)'
    case 'outside_trip': return e.groupName ? `Ignored: outside ${e.groupName}’s dates` : 'Ignored: outside trip dates'
    case 'not_a_debit': return 'Ignored: not a debit (OTP, credit or alert)'
    case 'unparsed': return 'Couldn’t read the amount'
    case 'paused': return e.groupName ? `Ignored: capture paused for ${e.groupName}` : 'Ignored: capture paused'
    case 'below_min': return 'Ignored: below your minimum amount'
    case 'ignored': return 'Ignored: matched an ignore keyword'
  }
}

/** Tone for the log row's dot. */
export const logResultTone = (r: CaptureLogResult): 'ok' | 'muted' | 'warn' =>
  r === 'captured' ? 'ok' : r === 'unparsed' ? 'warn' : 'muted'

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", else a date. */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(at).toISOString().slice(0, 10)
}
