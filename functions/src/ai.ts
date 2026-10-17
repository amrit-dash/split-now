import { FieldValue } from 'firebase-admin/firestore'
import { CHAT_AI_MAX_NAMES, CHAT_AI_MAX_TEXT, CHAT_AI_TOOLS, type ChatAiIntent, normaliseChatIntent } from '../../shared/chat-ai'
import { logger } from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { auth, db } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import {
  appKeyStatus,
  gemmaModels,
  gemmaPlanModels,
  keyHint,
  looksLikeGeminiKey,
  needsFreeOk,
  planAi,
  resolveAppAi,
  resolveUserAi,
  usefulModels,
  userFeatureOn,
  type AiFeature,
  type AiUnavailableReason,
  type AppAiConfig,
  type KeyPlan,
  type UserAiPrefs,
} from '../../shared/ai-config'
import { minorDigitsOf } from '../../shared/money-core'
import type { PaymentRead } from '../../shared/payment-ok'
import {
  GeminiError,
  generateJson,
  generateImage,
  generateText,
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
  CHAT_SCHEMA,
  chatPrompt,
  normaliseText,
  normalisePayment,
  PAYMENT_SCHEMA,
  paymentPrompt,
  type AiReceipt,
  type AiSms,
  type AiTextExpense,
  type AiTxn,
  type GeminiErrorKind,
  type GeminiPart,
  type GeminiUsage,
} from './lib/gemini'
import { limitPair } from '../../shared/limits'
import type { QuickAiResponse } from '../../shared/quick-ai'
import { cleanQuickRequest, normaliseQuickAi, QUICK_SCHEMA, quickPrompt } from './lib/quick-ai'
import { flagOn, getLimits } from './lib/limits'
import { cleanIconRequest, iconPrompt, parseIconText } from './lib/icon-ai'
import { type IconPictureResponse, type IconSuggestions, PICTURE_MODELS, picturePlan, picturePrompt } from '../../shared/icon-ai'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { parseKekList, readStoredKey, storedKeyFields } from './lib/seal'
import { addDays, istDate } from './lib/time'

/*
 * AI reading (Gemini). Every call goes through here: the user's own key first (if saved and
 * allowed by their settings), then the project key if config/ai lets them use it, else nothing
 * (the app falls back to reading on the phone; SMS keep the built-in parser's result).
 * See shared/ai-config.ts for the rules. With config/ai.engine 'gemma' the project key runs
 * Google's free Gemma models instead (newest by default, for everyone who agreed), slower, so
 * every call below has a longer time budget for it.
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
export function keks(): Buffer[] {
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
  kind: KeyPlan['key'] | 'keycheck' | 'picture',
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
  feature: AiFeature | 'text' | 'chat' | 'icons' | 'pictures',
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
    if (plan.engine === 'gemma') doc.app_gemma = FieldValue.increment(1)
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

/** The config/app flag that switches each AI feature off for everyone. */
const FEATURE_FLAG: Record<AiFeature, string> = { images: 'aiImages', sms: 'aiSms', quickAdd: 'aiQuickAdd', payments: 'aiPayments' }

type AiOutcome<T> = { ok: true; value: T; via: KeyPlan['key']; model?: string } | { ok: false; reason: AiUnavailableReason; kind?: GeminiErrorKind }

const REASON_ORDER: AiUnavailableReason[] = ['quota', 'bad_key', 'server', 'needs_ok', 'not_configured', 'not_listed', 'off']

/**
 * The Gemma models the project key can use, newest first (shared/ai-config.ts gemmaModels), kept
 * for 6 hours per key so "the newest Gemma" follows Google's releases without a deploy. [] when
 * the list can't be fetched (gemmaPlanModels then uses the built-in fallbacks).
 */
let gemmaCache: { at: number; key: string; ids: string[] } | null = null
async function gemmaIds(key: string): Promise<string[]> {
  if (gemmaCache && gemmaCache.key === key && Date.now() - gemmaCache.at < 6 * 3600_000) return gemmaCache.ids
  try {
    const ids = gemmaModels(await listModels(key)).map((m) => m.id)
    gemmaCache = { at: Date.now(), key, ids }
    return ids
  } catch (e) {
    logger.warn('gemma model list', (e as Error).message)
    // Don't ask again on every call while listing fails: retry in 10 minutes.
    gemmaCache = { at: Date.now() - 6 * 3600_000 + 600_000, key, ids: [] }
    return []
  }
}

/** A call's time budget: Gemini answers in seconds, the free Gemma models can take a minute. */
const budget = (gemma: boolean, geminiMs: number, gemmaMs: number) => (gemma ? gemmaMs : geminiMs)
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
  call: (key: string, models: string[], gemma: boolean) => Promise<{ value: T; usage?: GeminiUsage; model?: string }>,
  /** how the call is counted in stats/ai_{day} when it isn't the feature it is gated by (Quick add text uses the images allowance) */
  statAs: AiFeature | 'text' | 'chat' | 'icons' = feature,
): Promise<AiOutcome<T>> {
  // The admin's kill switch (config/app flags.aiImages / aiSms / aiQuickAdd) stops the feature for everyone, own keys included.
  if (!(await flagOn(FEATURE_FLAG[feature]))) return { ok: false, reason: 'off' }
  const plans = planAi({ feature, user: ctx.user, app: ctx.app, hasOwnKey: !!ctx.ownKey, email: ctx.email })
  const reasons: AiUnavailableReason[] = []
  let lastKind: GeminiErrorKind | undefined
  // Split Now's free AI would serve this person once they agree to it in their AI settings.
  if (needsFreeOk({ feature, user: ctx.user, app: ctx.app, email: ctx.email })) reasons.push('needs_ok')
  else if (!plans.length) {
    if (!userFeatureOn(ctx.user, feature) || ctx.user.aiSource === 'own') reasons.push('off')
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
      const gemma = plan.engine === 'gemma'
      const models = gemma ? gemmaPlanModels(plan.models[0] ?? '', await gemmaIds(key)) : plan.models
      const r = await call(key, models, gemma)
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

const base = { region: REGION, secrets: AI_SECRETS, enforceAppCheck: ENFORCE_APP_CHECK }

export interface ParseResult {
  receipt?: AiReceipt | null
  statement?: { currency?: string; transactions: AiTxn[] } | null
  expense?: AiTextExpense | null
  intent?: ChatAiIntent
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
 *  { kind: 'chat', text, names: string[], tools: string[], currency }          → { intent: ChatAiIntent, via } (chat suggestions)
 *  → { unavailable: true, reason } when no key may be used or all failed (the app reads on the phone;
 *    `reason` is an AiUnavailableReason from shared/ai-config.ts).
 * `receipt: null` / `statement: null` means the image isn't a bill / has no transactions (or Gemini refused it).
 */
export const parseReceiptAi = onCall({ ...base, timeoutSeconds: 180, memory: '512MiB', maxInstances: 10 }, async (req): Promise<ParseResult> => {
  const me = signedIn(req)
  const d = (req.data ?? {}) as { kind?: unknown; image?: unknown; mimeType?: unknown; images?: unknown; today?: unknown }
  // Quick add: a typed or spoken line, no image. Same switch and allowance as bill reading.
  if (d.kind === 'text') return parseText(me, d as { text?: unknown; members?: unknown; currency?: unknown; today?: unknown })
  if (d.kind === 'chat') return readChatLine(me, d as { text?: unknown; names?: unknown; tools?: unknown; currency?: unknown })
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
    const r = await withAi(ctx, 'images', async (key, models, gemma) => {
      const g = await generateJson(key, [...parts, { text: `Today is ${today}.` }], STATEMENT_SCHEMA, {
        models,
        timeoutMs: budget(gemma, 100_000, 165_000),
        systemInstruction: statementPrompt(today),
      })
      return { value: normaliseStatement(g.json, today), usage: g.usage, model: g.modelVersion ?? g.model }
    })
    if (r.ok) return { statement: r.value, via: r.via, model: r.model }
    return r.kind === 'blocked' ? { statement: null } : { unavailable: true, reason: r.reason }
  }
  const r = await withAi(ctx, 'images', async (key, models, gemma) => {
    const g = await generateJson(
      key,
      [...parts, { text: `Today is ${today}. Bill language may be Hindi or regional; keep item names as printed, transliterated to Latin letters.` }],
      RECEIPT_SCHEMA,
      { models, systemInstruction: RECEIPT_PROMPT, timeoutMs: budget(gemma, 25_000, 110_000) },
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
    async (key, models, gemma) => {
      const g = await generateJson(key, [{ text: `<note>${text}</note>` }], TEXT_SCHEMA, {
        models,
        timeoutMs: budget(gemma, 15_000, 50_000),
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

/**
 * { kind: 'chat', text, names, tools, currency } → { intent: ChatAiIntent } (shared/chat-ai.ts).
 * The group chat's optional AI suggestions: asked only after the phone's own rules found nothing,
 * by someone who turned "Use AI for suggestions" on. Its own kill switch (config/app chatAi) on top
 * of bill reading's: the same keys, switch and allowance as Quick add's text reader, counted as
 * `{own|app}_chat` in stats/ai_{day}.
 */
async function readChatLine(
  me: { uid: string; email?: string },
  d: { text?: unknown; names?: unknown; tools?: unknown; currency?: unknown },
): Promise<ParseResult> {
  const text =
    typeof d.text === 'string'
      ? d.text
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, CHAT_AI_MAX_TEXT)
      : ''
  if (!text) throw new HttpsError('invalid-argument', 'Nothing to read')
  if (!(await flagOn('chatAi'))) return { unavailable: true, reason: 'off' }
  const names = (Array.isArray(d.names) ? d.names : [])
    .filter((m): m is string => typeof m === 'string')
    .map((m) =>
      m
        .replace(/[^\p{L}\p{N}\s'.-]/gu, '')
        .trim()
        .slice(0, 40),
    )
    .filter(Boolean)
    .slice(0, CHAT_AI_MAX_NAMES)
  const tools = (Array.isArray(d.tools) ? d.tools : []).filter(
    (t): t is string => typeof t === 'string' && (CHAT_AI_TOOLS as readonly string[]).includes(t) && t !== 'none',
  )
  const currency = typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'INR'
  const ctx = await loadCtx(me.uid, me.email)
  const r = await withAi(
    ctx,
    'images',
    async (key, models, gemma) => {
      const g = await generateJson(key, [{ text: `<message>${text}</message>` }], CHAT_SCHEMA, {
        models,
        timeoutMs: budget(gemma, 10_000, 40_000),
        maxOutputTokens: 256,
        systemInstruction: chatPrompt(names, tools, currency),
      })
      return { value: normaliseChatIntent(g.json, names, tools), usage: g.usage, model: g.modelVersion ?? g.model }
    },
    'chat',
  )
  if (r.ok) return { intent: r.value, via: r.via, model: r.model }
  return r.kind === 'blocked' ? { intent: { tool: 'none' } } : { unavailable: true, reason: r.reason }
}

/**
 * Callable, signed-in users only: Quick add with AI, for a line the app's own reader can't
 * handle ("create a group Goa trip with Rahul and Priya and add dinner 2400 paid by me").
 *  { text ≤ 300, today, currency, me, groupId?, groups: [{ id, name, type, members: [{ id, name }] }] (≤ 25 × 30) }
 *  → { result: QuickAiResult, via, model }   (shared/quick-ai.ts; validated by lib/quick-ai.ts)
 *  → { unavailable: true, reason }           when the flag (config/app aiQuickAdd), the person's own
 *                                            switch (aiEnabled + aiQuickAdd) or every key says no
 * Same keys, limits and stats as the other AI reads: the user's own key first (aiOwnPerHour /
 * aiOwnPerDay from config/limits), then the shared key where config/ai lets this account use it for
 * bills (its perHour / perDay and the project's globalPerDay); counted as `{own|app}_quickAdd` in
 * stats/ai_{day}. Nothing is saved here: the app opens the expense form for a check, and a new
 * group is only made after the person confirms it.
 */
export const quickAddAi = onCall({ ...base, timeoutSeconds: 60, maxInstances: 10 }, async (req): Promise<QuickAiResponse> => {
  const me = signedIn(req)
  const serverToday = istDay(Date.now())
  const near = (a: string, b: string) => a >= addDays(b, -2) && a <= addDays(b, 2)
  const input = cleanQuickRequest(req.data, serverToday, near)
  if (!input) throw new HttpsError('invalid-argument', 'Nothing to read')
  const ctx = await loadCtx(me.uid, me.email)
  const r = await withAi(ctx, 'quickAdd', async (key, models, gemma) => {
    const g = await generateJson(key, [{ text: `<line>${input.text}</line>` }], QUICK_SCHEMA, {
      models,
      timeoutMs: budget(gemma, 20_000, 52_000),
      maxOutputTokens: 1024,
      systemInstruction: quickPrompt(input),
    })
    return { value: normaliseQuickAi(g.json, input), usage: g.usage, model: g.modelVersion ?? g.model }
  })
  if (r.ok) return { result: r.value, via: r.via, model: r.model }
  return r.kind === 'blocked' ? { result: { action: 'unknown' } } : { unavailable: true, reason: r.reason }
})

/**
 * Callable, signed-in users only: "Suggest with AI" in the icon sheet.
 *  { title ≤ 80, kind: 'expense' | 'group', category? } → { emoji: string[] (≤3), svgs: string[] (≤3, cleaned) }
 *  → { unavailable: true, reason }   when the flag (config/app aiIcons), bill reading's switches or every key says no
 * Never sent for a private group (the app doesn't offer it there: the title would leave the phone).
 * Same keys and allowance as Quick add's text reader (the "images" one), counted as `{own|app}_icons`
 * in stats/ai_{day}. Every drawing is cleaned (shared/svg-icon.ts); a drawing that isn't plain shapes
 * is dropped. Nothing is saved here: the person picks one, and the app stores it with the expense or group.
 */
export const iconsAi = onCall(
  // Gemma writing three drawings can take most of a minute and a half on the free tier.
  { ...base, timeoutSeconds: 120, maxInstances: 10 },
  async (req): Promise<IconSuggestions | { unavailable: true; reason: AiUnavailableReason }> => {
    const me = signedIn(req)
    const input = cleanIconRequest(req.data)
    if (!input) throw new HttpsError('invalid-argument', 'Nothing to draw')
    if (!(await flagOn('aiIcons'))) return { unavailable: true, reason: 'off' }
    const ctx = await loadCtx(me.uid, me.email)
    // The person's own switch (Settings → AI: AI icons), under the master switch.
    if (!ctx.user.aiEnabled || !ctx.user.aiIcons) return { unavailable: true, reason: 'off' }
    const r = await withAi(
      ctx,
      'images',
      async (key, models, gemma) => {
        // Plain text, not JSON: SVG's double quotes inside a JSON string are where small models slip (lib/icon-ai.ts parseIconText).
        const g = await generateText(key, [{ text: `<title>${input.title}</title>` }], {
          models,
          timeoutMs: budget(gemma, 30_000, 105_000),
          maxOutputTokens: 4096,
          systemInstruction: iconPrompt(input),
        })
        return { value: parseIconText(g.text), usage: g.usage, model: g.modelVersion ?? g.model }
      },
      'icons',
    )
    if (r.ok) return r.value
    return r.kind === 'blocked' ? { emoji: [], svgs: [] } : { unavailable: true, reason: r.reason }
  },
)

/**
 * Callable, signed-in users only: "Draw a picture" in the icon sheet, a paid Gemini image model.
 *  { title ≤ 80, kind, category? } → { image: base64, mimeType, via: 'own' | 'app' }
 *  → { unavailable: true, reason } when the flag (config/app aiIcons), the person's switches or the keys say no
 * The person's own key whenever they added one (even while they use the free AI day to day: the app
 * says it is billed to their key), with its aiOwnPerHour / aiOwnPerDay limits; else the shared key
 * only when it runs Gemini and config/ai `pictures` is on, at most `picturesPerDay` per person and
 * within the project's globalPerDay. Never Gemma (it can't draw). The app shrinks the picture to a
 * small icon before saving it; nothing is saved here. Counted as `{own,app}_pictures`.
 */
export const iconPictureAi = onCall({ ...base, timeoutSeconds: 90, memory: '512MiB', maxInstances: 5 }, async (req): Promise<IconPictureResponse> => {
  const me = signedIn(req)
  const input = cleanIconRequest(req.data)
  if (!input) throw new HttpsError('invalid-argument', 'Nothing to draw')
  if (!(await flagOn('aiIcons'))) return { unavailable: true, reason: 'off' }
  const ctx = await loadCtx(me.uid, me.email)
  const appPictures = ctx.app.engine === 'gemini' && ctx.app.pictures && appKeyStatus(ctx.app, 'images', ctx.email) === 'available'
  const which = picturePlan({ user: ctx.user, hasOwnKey: !!ctx.ownKey, appPictures })
  if (!which) return { unavailable: true, reason: 'off' }
  const key = which === 'own' ? ctx.ownKey : (await appKey()).key
  if (!key) return { unavailable: true, reason: 'not_configured' }
  const plan: KeyPlan = { key: which, models: [...PICTURE_MODELS] }
  const now = Date.now()
  const limits =
    which === 'own' ? limitPair(await getLimits(now), 'aiOwnPerHour', 'aiOwnPerDay') : { perHour: ctx.app.picturesPerDay, perDay: ctx.app.picturesPerDay }
  const gate = await allow(ctx.uid, which === 'own' ? 'own' : 'picture', limits, now, which === 'app' ? { max: ctx.app.globalPerDay } : undefined)
  if (!gate.allowed) {
    await record(ctx, 'denied', 'pictures', now, { denied: gate.why, key: which })
    return { unavailable: true, reason: 'quota' }
  }
  try {
    const g = await generateImage(key, picturePrompt(input), { models: plan.models, timeoutMs: 80_000 })
    await record(ctx, plan, 'pictures', now, { usage: g.usage, model: g.modelVersion ?? g.model })
    return { image: g.data, mimeType: g.mimeType, via: which }
  } catch (e) {
    const err = e instanceof GeminiError ? e : new GeminiError((e as Error).message)
    logger.warn('ai picture failed', { key: which, kind: err.kind, message: err.message.slice(0, 200) })
    await record(ctx, plan, 'pictures', now, { err })
    // Google refusing for quota here is almost always a key with no allowance for image models
    // (they have no free tier: billing must be on), not our daily limit, which was checked above.
    return {
      unavailable: true,
      reason: err.kind === 'blocked' ? 'blocked' : err.kind === 'quota' || err.kind === 'billing' ? 'picture_billing' : reasonOf(err.kind),
    }
  }
})

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

/**
 * Callable { which: 'own' | 'app' | 'gemma' } → models for the user's key, or the project key's
 * Gemini models / Gemma models, newest first (admins).
 */
export const aiModels = onCall({ ...base, timeoutSeconds: 30, maxInstances: 5 }, async (req) => {
  const me = signedIn(req)
  const w = (req.data as { which?: unknown } | null)?.which
  const which = w === 'app' || w === 'gemma' ? w : 'own'
  let key: string | undefined
  if (which !== 'own') {
    if (!(await isAdmin(me.uid))) throw new HttpsError('permission-denied', 'Admins only')
    key = (await appKey()).key
    if (!key) throw new HttpsError('failed-precondition', 'The project key isn’t set up')
  } else {
    key = await ownKeyOf(me.uid)
    if (!key) throw new HttpsError('failed-precondition', 'No key saved')
  }
  try {
    const list = await listModels(key)
    if (which === 'gemma') {
      const models = gemmaModels(list)
      gemmaCache = { at: Date.now(), key, ids: models.map((m) => m.id) }
      return { models }
    }
    return { models: usefulModels(list) }
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
      // "Draw a picture" on the shared key: Gemini only, and only when the admin turned it on
      pictures: configured && app.engine === 'gemini' && app.pictures ? appKeyStatus(app, 'images', me.email) : 'off',
      model: app.model,
      engine: app.engine,
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
    // The capture webhook answers within 30 s, so even Gemma gets 20 s here (SMS are short).
    const r = await withAi(ctx, 'sms', async (key, models, gemma) => {
      const g = await generateJson(key, [{ text: `<sms>${text.slice(0, 1000)}</sms>` }], SMS_SCHEMA, {
        models,
        timeoutMs: budget(gemma, 12_000, 20_000),
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

/**
 * Read a payment screenshot for the payment check (payment-ok.ts), as the payee: the admin's
 * aiPayments flag, their own switches (aiEnabled + aiPayments), their own key or the shared one
 * and its allowance. `read` is null when the image isn't a payment. Never throws.
 */
export async function aiReadPayment(
  payeeUid: string,
  jpeg: Buffer,
  fallbackCurrency: string,
  today: string,
): Promise<{ ok: true; read: PaymentRead | null } | { ok: false; reason: AiUnavailableReason }> {
  try {
    const u = await (await auth()).getUser(payeeUid).catch(() => null)
    const ctx = await loadCtx(payeeUid, u?.emailVerified ? u.email : undefined)
    const r = await withAi(ctx, 'payments', async (key, models, gemma) => {
      const g = await generateJson(key, [{ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }], PAYMENT_SCHEMA, {
        models,
        timeoutMs: budget(gemma, 30_000, 90_000),
        maxOutputTokens: 512,
        systemInstruction: paymentPrompt(today),
      })
      return { value: normalisePayment(g.json, fallbackCurrency, minorDigitsOf), usage: g.usage, model: g.modelVersion ?? g.model }
    })
    return r.ok ? { ok: true, read: r.value } : { ok: false, reason: r.reason }
  } catch (e) {
    logger.warn('aiReadPayment failed', (e as Error).message)
    return { ok: false, reason: 'server' }
  }
}
