import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { auth, db } from './admin'
import { REGION } from './config'
import {
  appKeyStatus, keyHint, looksLikeGeminiKey, planAi, resolveAppAi, resolveUserAi, usefulModels,
  type AiFeature, type AppAiConfig, type KeyPlan, type UserAiPrefs,
} from '../../shared/ai-config'
import {
  GeminiError, generateJson, listModels, normaliseReceipt, normaliseSms, normaliseStatement, RECEIPT_PROMPT, RECEIPT_SCHEMA,
  SMS_PROMPT, SMS_SCHEMA, STATEMENT_SCHEMA, statementPrompt, type AiReceipt, type AiSms, type AiTxn, type GeminiPart,
} from './lib/gemini'
import { applyRateLimit, type RateState } from './lib/ratelimit'

/*
 * AI reading (Gemini). Every call goes through here: the user's own key first (if saved and
 * allowed by their settings), then the project key if config/ai lets them use it, else nothing
 * (the app falls back to reading on the phone; SMS keep the built-in parser's result).
 * See shared/ai-config.ts for the rules.
 */

/** Project ("shared") key in Secret Manager. Unused while config/ai.mode is 'off'. */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

/** Calls on a user's own key: their bill, but still capped so a loop can't run up function costs. */
const OWN_LIMIT = { perHour: 120, perDay: 600 }
/** base64 of a downscaled JPEG; the app sends ~200-600 KB each */
const MAX_IMAGE_B64 = 4_000_000
const MAX_IMAGES = 6

const userRef = (uid: string) => db().collection('users').doc(uid)
const secretRef = (uid: string) => userRef(uid).collection('secrets').doc('gemini')
const stateRef = (uid: string) => userRef(uid).collection('aiState').doc('status')
const istDay = (now: number) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)

interface Ctx { uid: string; email?: string; user: UserAiPrefs; app: AppAiConfig; ownKey?: string }

async function loadCtx(uid: string, email: string | undefined): Promise<Ctx> {
  const [prefs, cfg, secret] = await Promise.all([
    userRef(uid).collection('settings').doc('notifications').get(),
    db().collection('config').doc('ai').get(),
    secretRef(uid).get(),
  ])
  const key = secret.get('key')
  return { uid, email, user: resolveUserAi(prefs.data()), app: resolveAppAi(cfg.data()), ownKey: typeof key === 'string' && key ? key : undefined }
}

/** A project key an admin set in the app (private/geminiAppKey, no client access); wins over the secret. */
const appKeyRef = () => db().collection('private').doc('geminiAppKey')
let override: { at: number; key?: string; hint?: string } | null = null
async function adminKey(): Promise<{ key?: string; hint?: string }> {
  if (override && Date.now() - override.at < 60_000) return override
  const d = (await appKeyRef().get()).data()
  override = { at: Date.now(), key: typeof d?.key === 'string' && d.key ? d.key : undefined, hint: d?.hint }
  return override
}
const secretKey = (): string | undefined => {
  try { return GEMINI_API_KEY.value() || undefined } catch { return undefined }
}
/** The project key in use: the admin's in-app key if set, else Secret Manager's GEMINI_API_KEY. */
async function appKey(): Promise<{ key?: string; source?: 'admin' | 'secret'; hint?: string }> {
  const a = await adminKey().catch(() => ({} as { key?: string; hint?: string }))
  if (a.key) return { key: a.key, source: 'admin', hint: a.hint }
  const s = secretKey()
  return s ? { key: s, source: 'secret', hint: keyHint(s) } : {}
}

/** Per user and key kind, in rateLimits/ai_{kind}_{uid} (server-only). */
async function allow(uid: string, kind: KeyPlan['key'], limits: { perHour: number; perDay: number }, now: number): Promise<boolean> {
  const ref = db().collection('rateLimits').doc(`ai_${kind}_${uid}`)
  return db().runTransaction(async (tx) => {
    const r = applyRateLimit((await tx.get(ref)).data() as Partial<RateState> | undefined, now, limits)
    tx.set(ref, r.next)
    return r.allowed
  })
}

function record(ctx: Ctx, plan: KeyPlan, feature: AiFeature, now: number, err?: GeminiError) {
  const day = istDay(now)
  // Daily usage for the admin view: calls by key kind and feature, plus failures.
  db().collection('stats').doc(`ai_${day}`).set({
    day, [plan.key]: FieldValue.increment(1), [`${plan.key}_${feature}`]: FieldValue.increment(1), ...(err ? { errors: FieldValue.increment(1) } : {}),
  }, { merge: true }).catch((e) => logger.warn('ai stats', e))
  if (plan.key === 'own') {
    stateRef(ctx.uid).set(err
      ? { lastError: { kind: err.kind, at: now }, updatedAt: now }
      : { lastOkAt: now, lastError: FieldValue.delete(), updatedAt: now }, { merge: true }).catch((e) => logger.warn('ai state', e))
  }
}

/**
 * Run `call` with each planned key in turn. Returns null when no key is allowed or all failed.
 * A key that is over its quota is skipped, not counted as an error.
 */
async function withAi<T>(ctx: Ctx, feature: AiFeature, call: (key: string, models: string[]) => Promise<T>): Promise<{ value: T; via: KeyPlan['key']; model?: string } | null> {
  const plans = planAi({ feature, user: ctx.user, app: ctx.app, hasOwnKey: !!ctx.ownKey, email: ctx.email })
  for (const plan of plans) {
    const key = plan.key === 'own' ? ctx.ownKey : (await appKey()).key
    if (!key) continue
    const now = Date.now()
    const limits = plan.key === 'own' ? OWN_LIMIT : { perHour: ctx.app.perHour, perDay: ctx.app.perDay }
    if (!(await allow(ctx.uid, plan.key, limits, now))) continue
    try {
      const value = await call(key, plan.models)
      record(ctx, plan, feature, now)
      return { value, via: plan.key }
    } catch (e) {
      const err = e instanceof GeminiError ? e : new GeminiError((e as Error).message)
      logger.warn('ai call failed', { feature, key: plan.key, kind: err.kind, message: err.message.slice(0, 200) })
      record(ctx, plan, feature, now, err)
    }
  }
  return null
}

function signedIn(req: CallableRequest): { uid: string; email?: string } {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return { uid: req.auth.uid, email: req.auth.token.email }
}

const isAdmin = async (uid: string) => (await db().collection('admins').doc(uid).get()).exists

const base = { region: REGION, secrets: [GEMINI_API_KEY], enforceAppCheck: false }

/**
 * Callable, signed-in users only (not table guests):
 *  { kind: 'receipt', image, mimeType }                      → { receipt: AiReceipt | null, via }
 *  { kind: 'statement', images: [{ image, mimeType }], today } → { statement: {...} | null, via }
 *  → { unavailable: true } when no key may be used or all failed (the app reads on the phone).
 * `receipt: null` / `statement: null` means the image isn't a bill / has no transactions.
 */
export const parseReceiptAi = onCall(
  { ...base, timeoutSeconds: 120, memory: '512MiB', maxInstances: 10 },
  async (req): Promise<{ receipt?: AiReceipt | null; statement?: { currency?: string; transactions: AiTxn[] } | null; via?: 'own' | 'app'; unavailable?: true }> => {
    const me = signedIn(req)
    const d = (req.data ?? {}) as { kind?: unknown; image?: unknown; mimeType?: unknown; images?: unknown; today?: unknown }
    const kind = d.kind === 'statement' ? 'statement' : 'receipt'
    const list = kind === 'statement' ? (Array.isArray(d.images) ? d.images : []) : [{ image: d.image, mimeType: d.mimeType }]
    if (!list.length || list.length > MAX_IMAGES) throw new HttpsError('invalid-argument', `Send 1 to ${MAX_IMAGES} images`)
    const parts = list.map((x) => toPart(x as { image?: unknown; mimeType?: unknown }))
    // The phone's date: the server's clock is UTC and the user may be a day ahead.
    const today = typeof d.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.today) ? d.today : istDay(Date.now())
    const ctx = await loadCtx(me.uid, me.email)
    if (kind === 'statement') {
      const r = await withAi(ctx, 'images', async (key, models) =>
        normaliseStatement((await generateJson(key, [...parts, { text: statementPrompt(today) }], STATEMENT_SCHEMA, { models, timeoutMs: 100_000 })).json, today))
      return r ? { statement: r.value, via: r.via } : { unavailable: true }
    }
    const r = await withAi(ctx, 'images', async (key, models) =>
      normaliseReceipt((await generateJson(key, [...parts, { text: RECEIPT_PROMPT }], RECEIPT_SCHEMA, { models })).json))
    return r ? { receipt: r.value, via: r.via } : { unavailable: true }
  },
)

function toPart(x: { image?: unknown; mimeType?: unknown }): GeminiPart {
  const { image, mimeType } = x ?? {}
  if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 2000))) throw new HttpsError('invalid-argument', 'Send base64 images under 3 MB each')
  const mime = typeof mimeType === 'string' && /^image\/(jpeg|png|webp|heic|heif)$/.test(mimeType) ? mimeType : 'image/jpeg'
  return { inlineData: { mimeType: mime, data: image } }
}

/**
 * Callable: the user's own Gemini key.
 *  { action: 'set', key }  check it with Google (lists models), then store it server-side
 *  { action: 'test' }      re-check the stored key
 *  { action: 'remove' }
 * → { hint, models } (hint is the last 4 characters; the key itself is never returned).
 */
export const aiKey = onCall({ ...base, timeoutSeconds: 30, maxInstances: 5 }, async (req) => {
  const me = signedIn(req)
  const d = (req.data ?? {}) as { action?: unknown; key?: unknown; which?: unknown }
  const now = Date.now()
  if (d.which === 'app') return projectKey(me.uid, d, now)
  if (d.action === 'remove') {
    await Promise.all([secretRef(me.uid).delete(), stateRef(me.uid).delete()])
    return { hint: null, models: [] }
  }
  if (!(await allow(me.uid, 'own', { perHour: 20, perDay: 60 }, now))) throw new HttpsError('resource-exhausted', 'Too many tries, wait a bit')
  let key: string
  if (d.action === 'set') {
    key = typeof d.key === 'string' ? cleanKey(d.key) : ''
    if (!looksLikeGeminiKey(key)) throw new HttpsError('invalid-argument', 'That doesn’t look like a Gemini API key')
  } else if (d.action === 'test') {
    const k = (await secretRef(me.uid).get()).get('key')
    if (typeof k !== 'string') throw new HttpsError('failed-precondition', 'No key saved')
    key = k
  } else throw new HttpsError('invalid-argument', 'Unknown action')
  let models
  try {
    models = usefulModels(await listModels(key))
  } catch (e) {
    const err = e instanceof GeminiError ? e : new GeminiError((e as Error).message)
    if (d.action === 'test') await stateRef(me.uid).set({ lastError: { kind: err.kind, at: now }, updatedAt: now }, { merge: true })
    throw keyError(err)
  }
  const hint = keyHint(key)
  if (d.action === 'set') await secretRef(me.uid).set({ key, hint, savedAt: now })
  await stateRef(me.uid).set({ hint, lastOkAt: now, lastError: FieldValue.delete(), updatedAt: now }, { merge: true })
  return { hint, models }
})

const keyError = (err: GeminiError) => new HttpsError(err.kind === 'bad_key' ? 'invalid-argument' : 'unavailable',
  err.kind === 'bad_key' ? 'Google rejected that key' : err.kind === 'quota' ? 'That key is over its quota right now' : 'Couldn’t reach Gemini, try again')

/** Pasted keys often carry spaces, line breaks, quotes or a `GEMINI_API_KEY=` prefix. */
export const cleanKey = (raw: string) => raw.replace(/\s+/g, '').replace(/^[A-Z_]+=/, '').replace(/^["'`]+|["'`]+$/g, '')

/** Admins: set / test / remove the in-app project key (overrides Secret Manager's GEMINI_API_KEY). */
async function projectKey(uid: string, d: { action?: unknown; key?: unknown }, now: number) {
  if (!(await isAdmin(uid))) throw new HttpsError('permission-denied', 'Admins only')
  if (d.action === 'remove') {
    await appKeyRef().delete()
    override = null
    const k = await appKey()
    return { hint: k.hint ?? null, source: k.source ?? null, models: [] }
  }
  let key: string | undefined
  if (d.action === 'set') {
    key = typeof d.key === 'string' ? cleanKey(d.key) : ''
    if (!looksLikeGeminiKey(key)) throw new HttpsError('invalid-argument', 'That doesn’t look like a Gemini API key')
  } else if (d.action === 'test') key = (await appKey()).key
  else throw new HttpsError('invalid-argument', 'Unknown action')
  if (!key) throw new HttpsError('failed-precondition', 'The project key isn’t set up')
  let models
  try { models = usefulModels(await listModels(key)) } catch (e) { throw keyError(e instanceof GeminiError ? e : new GeminiError((e as Error).message)) }
  if (d.action === 'set') {
    await appKeyRef().set({ key, hint: keyHint(key), savedAt: now, by: uid })
    override = null
  }
  const k = await appKey()
  return { hint: k.hint ?? null, source: k.source ?? null, models }
}

/** Callable { which: 'own' | 'app' } → models for the user's key, or the project key (admins). */
export const aiModels = onCall({ ...base, timeoutSeconds: 30, maxInstances: 5 }, async (req) => {
  const me = signedIn(req)
  const which = (req.data as { which?: unknown } | null)?.which === 'app' ? 'app' : 'own'
  let key: string | undefined
  if (which === 'app') {
    if (!(await isAdmin(me.uid))) throw new HttpsError('permission-denied', 'Admins only')
    key = (await appKey()).key
    if (!key) throw new HttpsError('failed-precondition', 'The project key isn’t set up')
  } else {
    const k = (await secretRef(me.uid).get()).get('key')
    key = typeof k === 'string' ? k : undefined
    if (!key) throw new HttpsError('failed-precondition', 'No key saved')
  }
  try {
    return { models: usefulModels(await listModels(key)) }
  } catch (e) {
    throw new HttpsError('unavailable', e instanceof GeminiError && e.kind === 'bad_key' ? 'Google rejected the key' : 'Couldn’t reach Gemini')
  }
})

/**
 * Callable → what the settings screen shows: whether the shared key can be used (per feature),
 * and whether the project key is configured at all (admins only).
 */
export const aiStatus = onCall({ ...base, timeoutSeconds: 15, maxInstances: 5 }, async (req) => {
  const me = signedIn(req)
  const [cfg, admin] = await Promise.all([db().collection('config').doc('ai').get(), isAdmin(me.uid)])
  const app = resolveAppAi(cfg.data())
  const k = await appKey()
  const configured = !!k.key
  return {
    admin,
    app: {
      images: configured ? appKeyStatus(app, 'images', me.email) : 'off',
      sms: configured ? appKeyStatus(app, 'sms', me.email) : 'off',
      model: app.model,
      // Admins see where the key comes from; the hint is the last 4 characters only.
      ...(admin ? { configured, source: k.source ?? null, hint: k.hint ?? null } : {}),
    },
  }
})

const minorDigits = (c: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2 } catch { return 2 }
}

/** Fallback for an SMS the regex parser couldn't read, for this user. Never throws; null when unavailable. */
export async function aiReadSms(uid: string, text: string): Promise<AiSms | null> {
  try {
    const email = (await auth().getUser(uid).catch(() => null))?.email
    const ctx = await loadCtx(uid, email)
    const r = await withAi(ctx, 'sms', async (key, models) =>
      normaliseSms((await generateJson(key, [{ text: `${SMS_PROMPT}\n\nSMS:\n${text.slice(0, 1000)}` }], SMS_SCHEMA, { models, timeoutMs: 12_000 })).json, minorDigits))
    return r?.value ?? null
  } catch (e) {
    logger.warn('aiReadSms failed', (e as Error).message)
    return null
  }
}
