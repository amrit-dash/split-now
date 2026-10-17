/*
 * AI reading: who may use which Gemini key, for which feature. Shared by the app and Cloud
 * Functions; the server is the one that enforces it.
 *
 *  config/ai                     project settings (admins edit; everyone signed in can read)
 *  users/{uid}/settings/notifications   the user's choices (aiEnabled, aiImages, aiSms, aiQuickAdd, aiPayments, aiIcons, aiIconAuto, aiSource, aiModel, aiFreeOk)
 *  users/{uid}/secrets/gemini    the user's own key (server only; the app can never read it back)
 *  users/{uid}/aiState/status    server-written: own key last 4, last error (owner can read)
 */

export type AiFeature = 'images' | 'sms' | 'quickAdd' | 'payments'

/**
 * The config/ai switch (and allowance) a feature's use of the shared key follows. Quick add with
 * AI is a short text call, and checking a payment screenshot is one small image, so both ride on
 * the bills allowance ("images") rather than adding more switches to the admin's shared-key settings.
 */
export const appFeatureOf = (f: AiFeature): 'images' | 'sms' => (f === 'sms' ? 'sms' : 'images')
export type AiSource = 'auto' | 'own' | 'app'
export type AppAiMode = 'off' | 'everyone' | 'allowlist'
/**
 * What Split Now's shared AI runs on: Gemini on the project key (paid, fast, admin's choice of who)
 * or Gemma, Google's open model, which the Gemini API serves free of charge on the same key but
 * under Google's unpaid-service terms (Google may use what is sent to improve its products). Gemma
 * is for everyone (no allow-list) and each person agrees to it in their AI settings (aiFreeOk).
 */
export type AppAiEngine = 'gemini' | 'gemma'

/**
 * Recommended model, and the fallbacks tried when a chosen model is unknown to a key (404 /
 * "not supported"). Checked against ai.google.dev/gemini-api/docs/models on 2026-10-08:
 * gemini-3.5-flash-lite is GA with no shutdown date; gemini-3.1-flash-lite is stable until
 * 2027-05-07; gemini-2.5-flash-lite still serves keys that used it before (new keys get a 404);
 * gemini-flash-lite-latest is an alias Google doesn't document but third parties list, so it is
 * last. Lite models think minimally, so a bill costs a fraction of a cent.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
export const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'] as const
/**
 * Used when the key's model list can't be fetched. Gemma 4 on the Gemini API (checked
 * 2026-10-11 against ai.google.dev/gemma/docs/core/gemma_on_gemini_api): 26B A4B is a
 * mixture-of-experts with 4B active, much quicker than the dense 31B, so it goes first.
 */
export const GEMMA_FALLBACK_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'] as const
export const MAX_ALLOW_EMAILS = 200
/** Calls on the shared key per IST day, over every user, before it is switched off until tomorrow. */
export const DEFAULT_GLOBAL_PER_DAY = 2000

export interface AppAiConfig {
  /** the shared (project) key: off, for everyone, or only for listed emails (Gemma: off or everyone) */
  mode: AppAiMode
  engine: AppAiEngine
  /** Gemma model for the shared key; '' = the newest the key can use (latestGemma) */
  gemmaModel: string
  allowEmails: string[]
  /** which features the shared key may be used for */
  images: boolean
  sms: boolean
  /** model used with the shared key */
  model: string
  /** shared-key calls per user */
  perDay: number
  perHour: number
  /** shared-key calls per day over every user (stats/ai_{day}.app); the admin's hard budget */
  globalPerDay: number
  /**
   * "Draw a picture" in the icon sheet on the shared key (Gemini engine only: image models have no
   * free tier, so each picture is billed to the project, about US$0.03). Off unless the admin turns it on.
   */
  pictures: boolean
  /** shared-key pictures per user per day (each is paid for) */
  picturesPerDay: number
}

export const DEFAULT_APP_AI: AppAiConfig = {
  mode: 'off',
  engine: 'gemini',
  gemmaModel: '',
  allowEmails: [],
  images: true,
  sms: true,
  model: DEFAULT_MODEL,
  perDay: 100,
  perHour: 30,
  globalPerDay: DEFAULT_GLOBAL_PER_DAY,
  pictures: false,
  picturesPerDay: 5,
}

export interface UserAiPrefs {
  /** master switch: nothing is sent to any AI while off */
  aiEnabled: boolean
  aiImages: boolean
  aiSms: boolean
  /** Quick add lines too complex for the built-in reader go to Gemini (quickAddAi); opt-in */
  aiQuickAdd: boolean
  /** payment screenshots attached in Settle up are checked by AI and clear payments to you that need your OK */
  aiPayments: boolean
  /** "Suggest with AI" in the icon sheet (iconsAi): asked only when the person taps it; on unless turned off */
  aiIcons: boolean
  /** the automatic icon asks AI when the app's own rules find none for a title (iconPickAi); on unless turned off */
  aiIconAuto: boolean
  aiSource: AiSource
  /** model for the user's own key; '' = recommended */
  aiModel: string
  /** agreed to Split Now's free AI (Gemma, Google's unpaid terms); nothing goes to it until then */
  aiFreeOk: boolean
}

// Bank SMS reading by AI is opt-in (owner decision, Oct 2026): off until the person turns it on.
// Quick add with AI is opt-in the same way.
export const DEFAULT_USER_AI: UserAiPrefs = {
  aiEnabled: true,
  aiImages: true,
  aiSms: false,
  aiQuickAdd: false,
  aiPayments: true,
  aiIcons: true,
  aiIconAuto: true,
  aiSource: 'auto',
  aiModel: '',
  aiFreeOk: false,
}

const MODEL_RE = /^[a-z0-9][a-z0-9.-]{2,79}$/
export const validModel = (m: unknown): m is string => typeof m === 'string' && MODEL_RE.test(m)
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d)

export const normaliseEmail = (e: string) => e.trim().toLowerCase()

export function resolveAppAi(raw: unknown): AppAiConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const engine: AppAiEngine = r.engine === 'gemma' ? 'gemma' : 'gemini'
  const picked: AppAiMode = r.mode === 'everyone' || r.mode === 'allowlist' ? r.mode : 'off'
  // Gemma is for everyone: an allow-list saved for Gemini is kept but doesn't narrow it.
  const mode: AppAiMode = engine === 'gemma' && picked === 'allowlist' ? 'everyone' : picked
  const emails = Array.isArray(r.allowEmails) ? r.allowEmails.filter((e): e is string => typeof e === 'string' && e.includes('@')).map(normaliseEmail) : []
  return {
    mode,
    engine,
    gemmaModel: isGemma(r.gemmaModel) && validModel(r.gemmaModel) ? r.gemmaModel : '',
    allowEmails: [...new Set(emails)].slice(0, MAX_ALLOW_EMAILS),
    images: r.images !== false,
    sms: r.sms !== false,
    model: validModel(r.model) ? r.model : DEFAULT_MODEL,
    perDay: int(r.perDay, 1, 5000, DEFAULT_APP_AI.perDay),
    perHour: int(r.perHour, 1, 1000, DEFAULT_APP_AI.perHour),
    globalPerDay: int(r.globalPerDay, 1, 100_000, DEFAULT_APP_AI.globalPerDay),
    pictures: r.pictures === true,
    picturesPerDay: int(r.picturesPerDay, 1, 100, DEFAULT_APP_AI.picturesPerDay),
  }
}

export function resolveUserAi(raw: unknown): UserAiPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    aiEnabled: r.aiEnabled !== false,
    aiImages: r.aiImages !== false,
    aiSms: r.aiSms === true,
    aiQuickAdd: r.aiQuickAdd === true,
    aiPayments: r.aiPayments !== false,
    aiIcons: r.aiIcons !== false,
    aiIconAuto: r.aiIconAuto !== false,
    aiSource: r.aiSource === 'own' || r.aiSource === 'app' ? r.aiSource : 'auto',
    aiModel: validModel(r.aiModel) ? r.aiModel : '',
    aiFreeOk: r.aiFreeOk === true,
  }
}

export const isGemma = (m: unknown): m is string => typeof m === 'string' && /^gemma-/.test(m)

/** Has this person switched AI on for this feature (the master switch and the feature's own)? */
export const userFeatureOn = (user: UserAiPrefs, feature: AiFeature): boolean =>
  user.aiEnabled && { images: user.aiImages, sms: user.aiSms, quickAdd: user.aiQuickAdd, payments: user.aiPayments }[feature]

/** May this person use the shared key for this feature? */
export function appKeyAllowed(app: AppAiConfig, feature: AiFeature, email: string | undefined): boolean {
  if (app.mode === 'off' || !app[appFeatureOf(feature)]) return false
  if (app.mode === 'everyone' || app.engine === 'gemma') return true
  return !!email && app.allowEmails.includes(normaliseEmail(email))
}

export type AppAiStatus = 'available' | 'off' | 'not_listed' | 'feature_off'

/** For the settings screen: why the shared key is or isn't usable. */
export function appKeyStatus(app: AppAiConfig, feature: AiFeature, email: string | undefined): AppAiStatus {
  if (app.mode === 'off') return 'off'
  if (!app[appFeatureOf(feature)]) return 'feature_off'
  return appKeyAllowed(app, feature, email) ? 'available' : 'not_listed'
}

export interface KeyPlan {
  key: 'own' | 'app'
  /** the shared key on Gemma: `models` is [] for "the newest", filled in by the server (gemmaPlanModels) */
  engine?: 'gemma'
  models: string[]
}

/**
 * Why an AI call returned nothing, for the app to show the right line (src/lib/ai.ts):
 *  off             the user (or the project) switched this feature off
 *  not_listed      the shared key is allow-list only and this account isn't on it
 *  not_configured  the project key isn't set up at all
 *  quota           every usable key is over its hourly / daily limit (or the project's daily budget)
 *  bad_key         Google rejected the key (the user's own, or the project's)
 *  server          Gemini didn't answer, timed out, or returned something unusable
 *  needs_ok        Split Now's AI is the free one (Gemma) and this person hasn't agreed to it yet
 */
export type AiUnavailableReason = 'off' | 'not_listed' | 'not_configured' | 'quota' | 'bad_key' | 'server' | 'needs_ok'

/** A model list that never ends without the recommended model and its fallbacks. */
export const withFallbacks = (m: string | undefined) => [...new Set([m || DEFAULT_MODEL, DEFAULT_MODEL, ...FALLBACK_MODELS])]

/**
 * Which keys to try, in order, for one request. Empty = don't call AI at all (the app reads bills
 * on the phone; SMS keep the built-in parser's result). Automatic tries the person's own key first,
 * except when Split Now's AI is the free one (Gemma) and they turned it on: then the free AI goes
 * first and their key is the fallback, so it doesn't spend their own quota (owner decision, Oct 2026).
 */
export function planAi(opts: { feature: AiFeature; user: UserAiPrefs; app: AppAiConfig; hasOwnKey: boolean; email?: string }): KeyPlan[] {
  const { feature, user, app, hasOwnKey, email } = opts
  if (!userFeatureOn(user, feature)) return []
  const own: KeyPlan | null = hasOwnKey && user.aiSource !== 'app' ? { key: 'own', models: withFallbacks(user.aiModel) } : null
  let shared: KeyPlan | null = null
  if (user.aiSource !== 'own' && appKeyAllowed(app, feature, email)) {
    if (app.engine !== 'gemma') shared = { key: 'app', models: withFallbacks(app.model) }
    else if (user.aiFreeOk) shared = { key: 'app', engine: 'gemma', models: app.gemmaModel ? [app.gemmaModel] : [] }
  }
  const freeFirst = shared?.engine === 'gemma' && user.aiSource === 'auto'
  return (freeFirst ? [shared, own] : [own, shared]).filter((p): p is KeyPlan => !!p)
}

/** The hint under "Which key" for Automatic: what it tries first. */
export const autoSourceHint = (freeFirst: boolean) => (freeFirst ? 'Split Now’s free AI first, then your key' : 'Your key first, then Split Now’s')

/** The shared key would serve this person if only they agreed to the free AI (for the "needs your OK" reason). */
export const needsFreeOk = (opts: { feature: AiFeature; user: UserAiPrefs; app: AppAiConfig; email?: string }) =>
  opts.app.engine === 'gemma' &&
  !opts.user.aiFreeOk &&
  opts.user.aiSource !== 'own' &&
  userFeatureOn(opts.user, opts.feature) &&
  appKeyAllowed(opts.app, opts.feature, opts.email)

const gemmaVer = (id: string) => Number(id.match(/^gemma-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
const gemmaSize = (id: string) => Number(id.match(/-(\d+)b(?:-|$)/)?.[1] ?? 0)

/**
 * Gemma models worth offering for reading bills and text: the general instruction-tuned ones that
 * generate content. Not the specialised families (embedding, translation, medical, safety), not the
 * on-device E2B/E4B / 3n sizes. Newest generation first; within one, the mixture-of-experts model
 * (fast) before the dense ones, then bigger before smaller.
 */
export function gemmaModels(list: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = []
  for (const m of list) {
    const id = m.name.replace(/^models\//, '')
    if (!isGemma(id) || !validModel(id) || !m.supportedGenerationMethods?.includes('generateContent')) continue
    if (!/^gemma-\d/.test(id) || /embed|translate|med|shield|guard|code|3n|-e\d+b/.test(id)) continue
    out.push({ id, label: m.displayName || id })
  }
  const moe = (id: string) => /-a\d+b/.test(id)
  return out.sort(
    (a, b) => gemmaVer(b.id) - gemmaVer(a.id) || Number(moe(b.id)) - Number(moe(a.id)) || gemmaSize(b.id) - gemmaSize(a.id) || a.id.localeCompare(b.id),
  )
}

/**
 * Models to try for the shared key on Gemma: the admin's pick (or the newest available), then the
 * other current Gemma models, never a paid Gemini model. `available` is gemmaModels' ids, newest first.
 */
export function gemmaPlanModels(picked: string, available: string[]): string[] {
  const list = available.length ? available : [...GEMMA_FALLBACK_MODELS]
  const newest = gemmaVer(list[0])
  return [...new Set([...(picked ? [picked] : []), ...list.filter((m) => gemmaVer(m) === newest), ...list])].slice(0, 3)
}

/**
 * Gemini models worth offering: text+image generation, Flash family, not audio/image-out/
 * embedding/omni/preview-only oddities. `lite` marks the cheap ones (minimal thinking); the
 * full Flash models think by default and cost roughly ten times more per bill.
 */
export function usefulModels(
  list: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>,
): Array<{ id: string; label: string; lite: boolean }> {
  const out: Array<{ id: string; label: string; lite: boolean }> = []
  for (const m of list) {
    const id = m.name.replace(/^models\//, '')
    if (!m.supportedGenerationMethods?.includes('generateContent')) continue
    if (!/flash/.test(id) || /image|tts|audio|live|embedding|native|thinking-exp|robotics|computer|omni|transcribe|translate/.test(id)) continue
    if (!validModel(id)) continue
    out.push({ id, label: m.displayName || id, lite: /-lite/.test(id) })
  }
  // Cheapest first (lite before full), then newest-looking: higher version numbers, shorter ids.
  const ver = (id: string) => Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
  return out.sort((a, b) => Number(b.lite) - Number(a.lite) || ver(b.id) - ver(a.id) || a.id.length - b.id.length || a.id.localeCompare(b.id))
}

/** Shown in settings; never more than the last 4 characters of a key. */
export const keyHint = (key: string) => (key.length >= 8 ? `…${key.slice(-4)}` : '…')

/**
 * A loose shape check (Google decides for real): classic `AIza…` keys and newer formats with dots
 * or other URL-safe characters. Rejects only obvious mistakes like a short word or a URL.
 */
export const looksLikeGeminiKey = (k: string) => /^[A-Za-z0-9_\-.~+/=]{20,256}$/.test(k.trim()) && !/^https?/i.test(k.trim())
