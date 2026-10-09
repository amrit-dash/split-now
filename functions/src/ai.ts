import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { auth, db } from './admin'
import { REGION } from './config'
import {
  appKeyStatus,
  keyHint,
  looksLikeGeminiKey,
  planAi,
  resolveAppAi,
  resolveUserAi,
  usefulModels,
  type AiFeature,
  type AiUnavailableReason,
  type AppAiConfig,
  type KeyPlan,
  type UserAiPrefs,
} from '../../shared/ai-config'
import { minorDigitsOf } from '../../shared/money-core'
import {
  GeminiError,
  generateJson,
  listModels,
  normaliseReceipt,
  normaliseSms,
  normaliseStatement,
  RECEIPT_PROMPT,
  RECEIPT_SCHEMA,
  SMS_PROMPT,
  SMS_SCHEMA,
  STATEMENT_SCHEMA,
  statementPrompt,
  TEXT_SCHEMA,
  textPrompt,
  normaliseText,
  type AiReceipt,
  type AiSms,
  type AiTextExpense,
  type AiTxn,
  type GeminiErrorKind,
  type GeminiPart,
  type GeminiUsage,
} from './lib/gemini'
import { limitPair } from '../../shared/limits'
import { flagOn, getLimits } from './lib/limits'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { parseKekList, readStoredKey, storedKeyFields } from './lib/seal'
import { addDays, istDate } from './lib/time'

/*
 * AI reading (Gemini). Every call goes through here: the user's own key first (if saved and
 * allowed by their settings), then the project key if config/ai lets them use it, else nothing
 * (the app falls back to reading on the phone; SMS keep the built-in parser's result).
 * See shared/ai-config.ts for the rules.
 *
 * Keys at rest (users/{uid}/secrets/gemini and private/geminiAppKey) are sealed with AES-256-GCM
 * under AI_KEY_KEK (lib/seal.ts). Documents written before that hold a plaintext `key`; they are
 * read as before and re-sealed the next time they are used.
 */

/** Project ("shared") key in Secret Manager. Unused while config/ai.mode is 'off'. */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
/** Key-encryption key for stored Gemini keys: 32 random bytes, base64 ("<new>,<old>" while rotating). */
export const AI_KEY_KEK = defineSecret('AI_KEY_KEK')
/** Every secret an AI-calling function needs bound (the capture webhook calls aiReadSms too). */
export const AI_SECRETS = [GEMINI_API_KEY, AI_KEY_KEK]

// Calls on a user's own key are their bill, but still capped (config/limits aiOwnPerHour /
// aiOwnPerDay, 120 and 600 by default) so a loop can't run up function costs.
/** Saving / testing a key: separate from the scan counters, so 20 scans never block "Save key". */
const KEYCHECK_LIMIT = { perHour: 20, perDay: 60 }
/** base64 of a downscaled JPEG; the app sends ~200-600 KB each */
const MAX_IMAGE_B64 = 4_000_000
const MAX_IMAGES = 6
const MAX_RECEIPT_IMAGES = 3

const userRef = (uid: string) => db().collection('users').doc(uid)
const secretRef = (uid: string) => userRef(uid).collection('secrets').doc('gemini')
const stateRef = (uid: string) => userRef(uid).collection('aiState').doc('status')
const statsRef = (day: string) => db().collection('stats').doc(`ai_${day}`)
const istDay = (now: number) => istDate(new Date(now))

let kekWarned = false
/** The configured KEK(s), newest first; [] when the secret isn't set (keys are then stored as before, with a warning). */
function keks(): Buffer[] {
  let raw: string | undefined
  try {
    raw = AI_KEY_KEK.value() || undefined
  } catch {
    raw = undefined
  }
  const list = parseKekList(raw)
  if (!list.length && !kekWarned) {
    kekWarned = true
    logger.warn('AI_KEY_KEK is not set: Gemini keys are stored unencrypted (docs/FIREBASE_SETUP.md §5d)')
  }
  return list
}

interface Ctx {
  uid: string
  email?: string
  user: UserAiPrefs
  app: AppAiConfig
  ownKey?: string
}

/** The user's own key, re-sealed in place when it was stored in plaintext or under an older KEK. */
async function ownKeyOf(uid: string): Promise<string | undefined> {
  const snap = await secretRef(uid).get()
  const { key, reseal } = readStoredKey(snap.data(), keks())
  if (key && reseal) {
    await secretRef(uid)
      .set({ ...storedKeyFields(key, keks()), key: FieldValue.delete(), resealedAt: Date.now() }, { merge: true })
      .catch((e) => logger.warn('re-seal own key', e))
  }
  return key
}

async function loadCtx(uid: string, email: string | undefined): Promise<Ctx> {
  const [prefs, cfg, ownKey] = await Promise.all([
    userRef(uid).collection('settings').doc('notifications').get(),
    db().collection('config').doc('ai').get(),
    ownKeyOf(uid),
  ])
  return { uid, email, user: resolveUserAi(prefs.data()), app: resolveAppAi(cfg.data()), ownKey }
}

/** A project key an admin set in the app (private/geminiAppKey, no client access); wins over the secret. */
const appKeyRef = () => db().collection('private').doc('geminiAppKey')
let override: { at: number; key?: string; hint?: string } | null = null
async function adminKey(): Promise<{ key?: string; hint?: string }> {
  if (override && Date.now() - override.at < 60_000) return override
  const d = (await appKeyRef().get()).data()
  const { key, reseal } = readStoredKey(d, keks())
  if (key && reseal) {
    await appKeyRef()
      .set({ ...storedKeyFields(key, keks()), key: FieldValue.delete(), resealedAt: Date.now() }, { merge: true })
      .catch((e) => logger.warn('re-seal project key', e))
  }
  override = { at: Date.now(), key, hint: typeof d?.hint === 'string' ? d.hint : key ? keyHint(key) : undefined }
  return override
}
const secretKey = (): string | undefined => {
  try {
    return GEMINI_API_KEY.value() || undefined
  } catch {
    return undefined
  }
}
/** The project key in use: the admin's in-app key if set, else Secret Manager's GEMINI_API_KEY. */
async function appKey(): Promise<{ key?: string; source?: 'admin' | 'secret'; hint?: string }> {
  const a = await adminKey().catch(() => ({}) as { key?: string; hint?: string })
  if (a.key) return { key: a.key, source: 'admin', hint: a.hint }
  const s = secretKey()
  return s ? { key: s, source: 'secret', hint: keyHint(s) } : {}
}

type Limited = { allowed: true } | { allowed: false; why: 'user' | 'global' }

/**
 * Per user and key kind, in rateLimits/ai_{kind}_{uid} (server-only). The shared key also has a
 * project-wide daily budget (config/ai.globalPerDay, counted in stats/ai_{day}.app). Denials
 * cost no write unless the window rolled over.
 */
async function allow(
  uid: string,
  kind: KeyPlan['key'] | 'keycheck',
  limits: { perHour: number; perDay: number },
  now: number,
  global?: { max: number },
): Promise<Limited> {
  const ref = db().collection('rateLimits').doc(`ai_${kind}_${uid}`)
  return db().runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data() as Partial<RateState> | undefined
    if (global) {
      const used = (await tx.get(statsRef(istDay(now)))).get('app')
      if (typeof used === 'number' && used >= global.max) return { allowed: false, why: 'global' }
    }
    const r = applyRateLimit(prev, now, limits)
    if (r.allowed || r.next.hourStart !== prev?.hourStart || r.next.dayStart !== prev?.dayStart) tx.set(ref, r.next)
    return r.allowed ? { allowed: true } : { allowed: false, why: 'user' }
  })
}

/** Daily usage for the admin view: calls by key kind and feature, tokens, failures and denials. Awaited, so gen-2 never drops it. */
async function record(
  ctx: Ctx,
  plan: KeyPlan | 'denied',
  feature: AiFeature | 'text',
  now: number,
  extra: { err?: GeminiError; usage?: GeminiUsage; model?: string; denied?: 'user' | 'global'; key?: KeyPlan['key'] } = {},
) {
  const day = istDay(now)
  const key = plan === 'denied' ? extra.key! : plan.key
  const doc: Record<string, unknown> = { day }
  if (plan === 'denied') doc[`denied_${key}${extra.denied === 'global' ? '_global' : ''}`] = FieldValue.increment(1)
  else {
    doc[key] = FieldValue.increment(1)
    doc[`${key}_${feature}`] = FieldValue.increment(1)
    if (extra.err) doc.errors = FieldValue.increment(1)
    if (extra.usage) {
      doc.tokensIn = FieldValue.increment(extra.usage.promptTokens)
      doc.tokensOut = FieldValue.increment(extra.usage.outputTokens + extra.usage.thoughtTokens)
    }
    if (extra.model) doc.lastModel = extra.model
  }
  const writes: Array<Promise<unknown>> = [
    statsRef(day)
      .set(doc, { merge: true })
      .catch((e) => logger.warn('ai stats', e)),
  ]
  if (plan !== 'denied' && plan.key === 'own') {
    writes.push(
      stateRef(ctx.uid)
        .set(extra.err ? { lastError: { kind: extra.err.kind, at: now }, updatedAt: now } : { lastOkAt: now, lastError: FieldValue.delete(), updatedAt: now }, {
          merge: true,
        })
        .catch((e) => logger.warn('ai state', e)),
    )
  }
  await Promise.allSettled(writes)
}

type AiOutcome<T> = { ok: true; value: T; via: KeyPlan['key']; model?: string } | { ok: false; reason: AiUnavailableReason; kind?: GeminiErrorKind }

const REASON_ORDER: AiUnavailableReason[] = ['quota', 'bad_key', 'server', 'not_configured', 'not_listed', 'off']
const reasonOf = (kind: GeminiErrorKind): AiUnavailableReason => (kind === 'bad_key' || kind === 'billing' ? 'bad_key' : kind === 'quota' ? 'quota' : 'server')

/**
 * Run `call` with each planned key in turn. When no key may be used or every key failed, says
 * why (the most actionable reason wins: quota over a bad key over an outage over "not set up").
 * A key over its quota is skipped and counted as denied, not as an error. A refusal by Gemini
 * ('blocked') stops the chain: the next key would refuse the same content.
 */
async function withAi<T>(
  ctx: Ctx,
  feature: AiFeature,
  call: (key: string, models: string[]) => Promise<{ value: T; usage?: GeminiUsage; model?: string }>,
  /** how the call is counted in stats/ai_{day} when it isn't the feature it is gated by (Quick add text uses the images allowance) */
  statAs: AiFeature | 'text' = feature,
): Promise<AiOutcome<T>> {
  // The admin's kill switch (config/app flags.aiImages / aiSms) stops the feature for everyone, own keys included.
  if (!(await flagOn(feature === 'images' ? 'aiImages' : 'aiSms'))) return { ok: false, reason: 'off' }
  const plans = planAi({ feature, user: ctx.user, app: ctx.app, hasOwnKey: !!ctx.ownKey, email: ctx.email })
  const reasons: AiUnavailableReason[] = []
  let lastKind: GeminiErrorKind | undefined
  if (!plans.length) {
    const featureOn = ctx.user.aiEnabled && (feature === 'images' ? ctx.user.aiImages : ctx.user.aiSms)
    if (!featureOn || ctx.user.aiSource === 'own') reasons.push('off')
    else reasons.push(appKeyStatus(ctx.app, feature, ctx.email) === 'not_listed' ? 'not_listed' : 'off')
  }
  for (const plan of plans) {
    const key = plan.key === 'own' ? ctx.ownKey : (await appKey()).key
    if (!key) {
      reasons.push('not_configured')
      continue
    }
    const now = Date.now()
    const limits = plan.key === 'own' ? limitPair(await getLimits(now), 'aiOwnPerHour', 'aiOwnPerDay') : { perHour: ctx.app.perHour, perDay: ctx.app.perDay }
    const gate = await allow(ctx.uid, plan.key, limits, now, plan.key === 'app' ? { max: ctx.app.globalPerDay } : undefined)
    if (!gate.allowed) {
      reasons.push('quota')
      await record(ctx, 'denied', statAs, now, { denied: gate.why, key: plan.key })
      continue
    }
    try {
      const r = await call(key, plan.models)
      await record(ctx, plan, statAs, now, { usage: r.usage, model: r.model })
      return { ok: true, value: r.value, via: plan.key, model: r.model }
    } catch (e) {
      const err = e instanceof GeminiError ? e : new GeminiError((e as Error).message)
      logger.warn('ai call failed', { feature, key: plan.key, kind: err.kind, message: err.message.slice(0, 200) })
      await record(ctx, plan, statAs, now, { err })
      lastKind = err.kind
      reasons.push(reasonOf(err.kind))
      if (err.kind === 'blocked') break
    }
  }
  return { ok: false, reason: REASON_ORDER.find((r) => reasons.includes(r)) ?? 'server', kind: lastKind }
}

/** The caller, with their email only when Google / the user verified it (the allow-list trusts it). */
function signedIn(req: CallableRequest): { uid: string; email?: string } {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  return { uid: req.auth.uid, email: req.auth.token.email_verified ? req.auth.token.email : undefined }
}

const isAdmin = async (uid: string) => (await db().collection('admins').doc(uid).get()).exists

const base = { region: REGION, secrets: AI_SECRETS, enforceAppCheck: false }

export interface ParseResult {
  receipt?: AiReceipt | null
  statement?: { currency?: string; transactions: AiTxn[] } | null
  expense?: AiTextExpense | null
  via?: 'own' | 'app'
  model?: string
  unavailable?: true
  reason?: AiUnavailableReason
}

/**
 * Callable, signed-in users only (not table guests):
 *  { kind: 'receipt', image, mimeType } or { kind: 'receipt', images: [...] (≤3) } → { receipt: AiReceipt | null, via }
 *  { kind: 'statement', images: [{ image, mimeType }] (≤6), today }           → { statement: {...} | null, via }
 *  { kind: 'text', text, members: string[], currency, today }                 → { expense: AiTextExpense | null, via } (Quick add)
 *  → { unavailable: true, reason } when no key may be used or all failed (the app reads on the phone;
 *    `reason` is an AiUnavailableReason from shared/ai-config.ts).
 * `receipt: null` / `statement: null` means the image isn't a bill / has no transactions (or Gemini refused it).
 */
export const parseReceiptAi = onCall({ ...base, timeoutSeconds: 120, memory: '512MiB', maxInstances: 10 }, async (req): Promise<ParseResult> => {
  const me = signedIn(req)
  const d = (req.data ?? {}) as { kind?: unknown; image?: unknown; mimeType?: unknown; images?: unknown; today?: unknown }
  // Quick add: a typed or spoken line, no image. Same switch and allowance as bill reading.
  if (d.kind === 'text') return parseText(me, d as { text?: unknown; members?: unknown; currency?: unknown; today?: unknown })
  const kind = d.kind === 'statement' ? 'statement' : 'receipt'
  const max = kind === 'statement' ? MAX_IMAGES : MAX_RECEIPT_IMAGES
  const list = Array.isArray(d.images) ? d.images : d.image ? [{ image: d.image, mimeType: d.mimeType }] : []
  if (!list.length || list.length > max) throw new HttpsError('invalid-argument', `Send 1 to ${max} images`)
  const parts = list.map((x) => toPart(x as { image?: unknown; mimeType?: unknown }))
  // The phone's date: the server's clock is UTC and the user may be a day ahead (but not a month).
  const serverToday = istDay(Date.now())
  const today =
    typeof d.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.today) && d.today >= addDays(serverToday, -2) && d.today <= addDays(serverToday, 2)
      ? d.today
      : serverToday
  const ctx = await loadCtx(me.uid, me.email)
  if (kind === 'statement') {
    const r = await withAi(ctx, 'images', async (key, models) => {
      const g = await generateJson(key, [...parts, { text: `Today is ${today}.` }], STATEMENT_SCHEMA, {
        models,
        timeoutMs: 100_000,
        systemInstruction: statementPrompt(today),
      })
      return { value: normaliseStatement(g.json, today), usage: g.usage, model: g.modelVersion ?? g.model }
    })
    if (r.ok) return { statement: r.value, via: r.via, model: r.model }
    return r.kind === 'blocked' ? { statement: null } : { unavailable: true, reason: r.reason }
  }
  const r = await withAi(ctx, 'images', async (key, models) => {
    const g = await generateJson(
      key,
      [...parts, { text: `Today is ${today}. Bill language may be Hindi or regional; keep item names as printed, transliterated to Latin letters.` }],
      RECEIPT_SCHEMA,
      { models, systemInstruction: RECEIPT_PROMPT },
    )
    return { value: normaliseReceipt(g.json), usage: g.usage, model: g.modelVersion ?? g.model }
  })
  if (r.ok) return { receipt: r.value, via: r.via, model: r.model }
  return r.kind === 'blocked' ? { receipt: null } : { unavailable: true, reason: r.reason }
})

const MAX_TEXT = 300
const MAX_MEMBERS = 60

/**
 * { kind: 'text', text, members: string[], currency, today } → { expense: AiTextExpense | null }.
 * People come and go as the names the app sent (never uids); the app resolves them to members.
 */
async function parseText(
  me: { uid: string; email?: string },
  d: { text?: unknown; members?: unknown; currency?: unknown; today?: unknown },
): Promise<ParseResult> {
  const text =
    typeof d.text === 'string'
      ? d.text
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, MAX_TEXT)
      : ''
  if (!text) throw new HttpsError('invalid-argument', 'Nothing to read')
  const members = (Array.isArray(d.members) ? d.members : [])
    .filter((m): m is string => typeof m === 'string')
    .map((m) =>
      m
        .replace(/[^\p{L}\p{N}\s'.-]/gu, '')
        .trim()
        .slice(0, 40),
    )
    .filter(Boolean)
    .slice(0, MAX_MEMBERS)
  const currency = typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'INR'
  const serverToday = istDay(Date.now())
  const today =
    typeof d.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.today) && d.today >= addDays(serverToday, -2) && d.today <= addDays(serverToday, 2)
      ? d.today
      : serverToday
  const ctx = await loadCtx(me.uid, me.email)
  const r = await withAi(
    ctx,
    'images',
    async (key, models) => {
      const g = await generateJson(key, [{ text: `<note>${text}</note>` }], TEXT_SCHEMA, {
        models,
        timeoutMs: 15_000,
        maxOutputTokens: 512,
        systemInstruction: textPrompt(members, currency, today),
      })
      return { value: normaliseText(g.json, members), usage: g.usage, model: g.modelVersion ?? g.model }
    },
    'text',
  )
  if (r.ok) return { expense: r.value, via: r.via, model: r.model }
  return r.kind === 'blocked' ? { expense: null } : { unavailable: true, reason: r.reason }
}

function toPart(x: { image?: unknown; mimeType?: unknown }): GeminiPart {
  const { image, mimeType } = x ?? {}
  if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 2000)))
    throw new HttpsError('invalid-argument', 'Send base64 images of 3 MB or less each')
  const mime = typeof mimeType === 'string' && /^image\/(jpeg|png|webp|heic|heif)$/.test(mimeType) ? mimeType : 'image/jpeg'
  return { inlineData: { mimeType: mime, data: image } }
}

/**
 * Callable: the user's own Gemini key.
 *  { action: 'set', key }  check it with Google (lists models), then store it server-side (sealed)
 *  { action: 'test' }      re-check the stored key
 *  { action: 'remove' }
 *  { which: 'app', ... }   admins: the in-app project key (private/geminiAppKey)
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
  if (!(await allow(me.uid, 'keycheck', KEYCHECK_LIMIT, now)).allowed) throw new HttpsError('resource-exhausted', 'Too many tries, wait a bit')
  let key: string
  if (d.action === 'set') {
    key = typeof d.key === 'string' ? cleanKey(d.key) : ''
    if (!looksLikeGeminiKey(key)) throw new HttpsError('invalid-argument', 'That doesn’t look like a Gemini API key')
  } else if (d.action === 'test') {
    const k = await ownKeyOf(me.uid)
    if (!k) throw new HttpsError('failed-precondition', 'No key saved')
    key = k
  } else throw new HttpsError('invalid-argument', 'Unknown action')
  let models: ReturnType<typeof usefulModels>
  try {
    models = usefulModels(await listModels(key))
  } catch (e) {
    const err = e instanceof GeminiError ? e : new GeminiError((e as Error).message)
    if (d.action === 'test') await stateRef(me.uid).set({ lastError: { kind: err.kind, at: now }, updatedAt: now }, { merge: true })
    throw keyError(err)
  }
  const hint = keyHint(key)
  if (d.action === 'set') await secretRef(me.uid).set({ ...storedKeyFields(key, keks()), hint, savedAt: now })
  await stateRef(me.uid).set({ hint, lastOkAt: now, lastError: FieldValue.delete(), updatedAt: now }, { merge: true })
  return { hint, models }
})

const keyError = (err: GeminiError) =>
  new HttpsError(
    err.kind === 'bad_key' ? 'invalid-argument' : 'unavailable',
    err.kind === 'bad_key'
      ? 'Google rejected that key'
      : err.kind === 'quota'
        ? 'That key is over its quota right now'
        : err.kind === 'billing'
          ? 'That key’s Google project needs billing set up'
          : 'Couldn’t reach Gemini, try again',
  )

/** Pasted keys often carry spaces, line breaks, quotes or a `GEMINI_API_KEY=` prefix. */
export const cleanKey = (raw: string) =>
  raw
    .replace(/\s+/g, '')
    .replace(/^[A-Z_]+=/, '')
    .replace(/^["'`]+|["'`]+$/g, '')

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
  let models: ReturnType<typeof usefulModels>
  try {
    models = usefulModels(await listModels(key))
  } catch (e) {
    throw keyError(e instanceof GeminiError ? e : new GeminiError((e as Error).message))
  }
  if (d.action === 'set') {
    await appKeyRef().set({ ...storedKeyFields(key, keks()), hint: keyHint(key), savedAt: now, by: uid })
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
    key = await ownKeyOf(me.uid)
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
 * its per-user daily allowance (for the "limit reached" line), and for admins whether the
 * project key is configured at all, where it comes from, and whether stored keys are sealed.
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
      perDay: app.perDay,
      // Admins see where the key comes from; the hint is the last 4 characters only.
      ...(admin ? { configured, source: k.source ?? null, hint: k.hint ?? null, sealed: keks().length > 0, globalPerDay: app.globalPerDay } : {}),
    },
  }
})

/**
 * Fallback for an SMS the regex parser couldn't read, for this user. `text` must already be
 * masked (capture.ts passes maskSms output). Never throws; null when unavailable.
 */
export async function aiReadSms(uid: string, text: string): Promise<AiSms | null> {
  try {
    const u = await (await auth()).getUser(uid).catch(() => null)
    const ctx = await loadCtx(uid, u?.emailVerified ? u.email : undefined)
    const r = await withAi(ctx, 'sms', async (key, models) => {
      const g = await generateJson(key, [{ text: `<sms>${text.slice(0, 1000)}</sms>` }], SMS_SCHEMA, {
        models,
        timeoutMs: 12_000,
        systemInstruction: SMS_PROMPT,
      })
      return { value: normaliseSms(g.json, minorDigitsOf), usage: g.usage, model: g.modelVersion ?? g.model }
    })
    return r.ok ? r.value : null
  } catch (e) {
    logger.warn('aiReadSms failed', (e as Error).message)
    return null
  }
}
