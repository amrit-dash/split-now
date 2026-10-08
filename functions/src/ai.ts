import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from './admin'
import { REGION } from './config'
import { generateJson, normaliseReceipt, normaliseSms, normaliseStatement, RECEIPT_PROMPT, RECEIPT_SCHEMA, SMS_PROMPT, SMS_SCHEMA, STATEMENT_SCHEMA, statementPrompt, type AiReceipt, type AiSms, type AiTxn, type GeminiPart } from './lib/gemini'
import { applyRateLimit, type RateState } from './lib/ratelimit'

/** Google AI Studio key (`firebase functions:secrets:set GEMINI_API_KEY`). */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

export const AI_LIMIT = { perHour: 40, perDay: 150 }
/** base64 of a downscaled JPEG; the app sends ~200-600 KB each */
const MAX_IMAGE_B64 = 4_000_000

/** Per-user AI quota in rateLimits/ai_{uid} (server-only). */
async function allow(uid: string, now: number): Promise<boolean> {
  const ref = db().collection('rateLimits').doc(`ai_${uid}`)
  return db().runTransaction(async (tx) => {
    const r = applyRateLimit((await tx.get(ref)).data() as Partial<RateState> | undefined, now, AI_LIMIT)
    tx.set(ref, r.next)
    return r.allowed
  })
}

const MAX_IMAGES = 6

/**
 * Callable, signed-in users only (not table guests):
 *  { kind: 'receipt', image, mimeType }     → { receipt: AiReceipt | null }   (null: not a bill)
 *  { kind: 'statement', images: [{ image, mimeType }], today } → { statement: { currency?, transactions } | null }
 * Amounts are in hundredths. Images are base64, downscaled by the app.
 */
export const parseReceiptAi = onCall(
  { region: REGION, secrets: [GEMINI_API_KEY], enforceAppCheck: false, timeoutSeconds: 90, memory: '512MiB', maxInstances: 10 },
  async (req): Promise<{ receipt?: AiReceipt | null; statement?: { currency?: string; transactions: AiTxn[] } | null }> => {
    if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in to scan bills')
    const d = (req.data ?? {}) as { kind?: unknown; image?: unknown; mimeType?: unknown; images?: unknown; today?: unknown }
    const kind = d.kind === 'statement' ? 'statement' : 'receipt'
    const list = kind === 'statement' ? (Array.isArray(d.images) ? d.images : []) : [{ image: d.image, mimeType: d.mimeType }]
    if (!list.length || list.length > MAX_IMAGES) throw new HttpsError('invalid-argument', `Send 1 to ${MAX_IMAGES} images`)
    const parts = list.map((x) => toPart(x as { image?: unknown; mimeType?: unknown }))
    if (!(await allow(req.auth.uid, Date.now()))) throw new HttpsError('resource-exhausted', 'Too many scans, try again later')
    // The phone's date: the server's clock is UTC and the user may be a day ahead.
    const today = typeof d.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.today) ? d.today : new Date().toISOString().slice(0, 10)
    try {
      if (kind === 'statement') {
        const raw = await generateJson(GEMINI_API_KEY.value(), [...parts, { text: statementPrompt(today) }], STATEMENT_SCHEMA, fetch, 80_000)
        return { statement: normaliseStatement(raw, today) }
      }
      const raw = await generateJson(GEMINI_API_KEY.value(), [...parts, { text: RECEIPT_PROMPT }], RECEIPT_SCHEMA)
      return { receipt: normaliseReceipt(raw) }
    } catch (e) {
      logger.warn('parseReceiptAi failed', kind, (e as Error).message)
      throw new HttpsError('unavailable', 'AI reading is unavailable right now')
    }
  },
)

function toPart(x: { image?: unknown; mimeType?: unknown }): GeminiPart {
  const { image, mimeType } = x ?? {}
  if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 2000))) throw new HttpsError('invalid-argument', 'Send base64 images under 3 MB each')
  const mime = typeof mimeType === 'string' && /^image\/(jpeg|png|webp|heic|heif)$/.test(mimeType) ? mimeType : 'image/jpeg'
  return { inlineData: { mimeType: mime, data: image } }
}

const minorDigits = (c: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2 } catch { return 2 }
}

/** Fallback for SMS the regex parser couldn't read. Never throws; null when unavailable. */
export async function aiReadSms(text: string): Promise<AiSms | null> {
  let key: string
  try { key = GEMINI_API_KEY.value() } catch { return null }
  if (!key) return null
  try {
    return normaliseSms(await generateJson(key, [{ text: `${SMS_PROMPT}\n\nSMS:\n${text.slice(0, 1000)}` }], SMS_SCHEMA, fetch, 12_000), minorDigits)
  } catch (e) {
    logger.warn('aiReadSms failed', (e as Error).message)
    return null
  }
}
