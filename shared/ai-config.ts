/*
 * AI reading: who may use which Gemini key, for which feature. Shared by the app and Cloud
 * Functions; the server is the one that enforces it.
 *
 *  config/ai                     project settings (admins edit; everyone signed in can read)
 *  users/{uid}/settings/notifications   the user's choices (aiEnabled, aiImages, aiSms, aiSource, aiModel)
 *  users/{uid}/secrets/gemini    the user's own key (server only; the app can never read it back)
 *  users/{uid}/aiState/status    server-written: own key last 4, last error (owner can read)
 */

export type AiFeature = 'images' | 'sms'
export type AiSource = 'auto' | 'own' | 'app'
export type AppAiMode = 'off' | 'everyone' | 'allowlist'

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
/** @deprecated the last entry of FALLBACK_MODELS; kept for older imports */
export const MODEL_ALIAS = 'gemini-flash-lite-latest'
export const MAX_ALLOW_EMAILS = 200
/** Calls on the shared key per IST day, over every user, before it is switched off until tomorrow. */
export const DEFAULT_GLOBAL_PER_DAY = 2000

export interface AppAiConfig {
  /** the shared (project) key: off, for everyone, or only for listed emails */
  mode: AppAiMode
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
}

export const DEFAULT_APP_AI: AppAiConfig = {
  mode: 'off',
  allowEmails: [],
  images: true,
  sms: true,
  model: DEFAULT_MODEL,
  perDay: 100,
  perHour: 30,
  globalPerDay: DEFAULT_GLOBAL_PER_DAY,
}

export interface UserAiPrefs {
  /** master switch: nothing is sent to any AI while off */
  aiEnabled: boolean
  aiImages: boolean
  aiSms: boolean
  aiSource: AiSource
  /** model for the user's own key; '' = recommended */
  aiModel: string
}

export const DEFAULT_USER_AI: UserAiPrefs = { aiEnabled: true, aiImages: true, aiSms: true, aiSource: 'auto', aiModel: '' }

const MODEL_RE = /^[a-z0-9][a-z0-9.-]{2,79}$/
export const validModel = (m: unknown): m is string => typeof m === 'string' && MODEL_RE.test(m)
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d)

export const normaliseEmail = (e: string) => e.trim().toLowerCase()

export function resolveAppAi(raw: unknown): AppAiConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mode: AppAiMode = r.mode === 'everyone' || r.mode === 'allowlist' ? r.mode : 'off'
  const emails = Array.isArray(r.allowEmails) ? r.allowEmails.filter((e): e is string => typeof e === 'string' && e.includes('@')).map(normaliseEmail) : []
  return {
    mode,
    allowEmails: [...new Set(emails)].slice(0, MAX_ALLOW_EMAILS),
    images: r.images !== false,
    sms: r.sms !== false,
    model: validModel(r.model) ? r.model : DEFAULT_MODEL,
    perDay: int(r.perDay, 1, 5000, DEFAULT_APP_AI.perDay),
    perHour: int(r.perHour, 1, 1000, DEFAULT_APP_AI.perHour),
    globalPerDay: int(r.globalPerDay, 1, 100_000, DEFAULT_APP_AI.globalPerDay),
  }
}

export function resolveUserAi(raw: unknown): UserAiPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    aiEnabled: r.aiEnabled !== false,
    aiImages: r.aiImages !== false,
    aiSms: r.aiSms !== false,
    aiSource: r.aiSource === 'own' || r.aiSource === 'app' ? r.aiSource : 'auto',
    aiModel: validModel(r.aiModel) ? r.aiModel : '',
  }
}

/** May this person use the shared key for this feature? */
export function appKeyAllowed(app: AppAiConfig, feature: AiFeature, email: string | undefined): boolean {
  if (app.mode === 'off' || !app[feature]) return false
  if (app.mode === 'everyone') return true
  return !!email && app.allowEmails.includes(normaliseEmail(email))
}

export type AppAiStatus = 'available' | 'off' | 'not_listed' | 'feature_off'

/** For the settings screen: why the shared key is or isn't usable. */
export function appKeyStatus(app: AppAiConfig, feature: AiFeature, email: string | undefined): AppAiStatus {
  if (app.mode === 'off') return 'off'
  if (!app[feature]) return 'feature_off'
  return appKeyAllowed(app, feature, email) ? 'available' : 'not_listed'
}

export interface KeyPlan {
  key: 'own' | 'app'
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
 */
export type AiUnavailableReason = 'off' | 'not_listed' | 'not_configured' | 'quota' | 'bad_key' | 'server'

/** A model list that never ends without the recommended model and its fallbacks. */
export const withFallbacks = (m: string | undefined) => [...new Set([m || DEFAULT_MODEL, DEFAULT_MODEL, ...FALLBACK_MODELS])]

/**
 * Which keys to try, in order, for one request. Empty = don't call AI at all (the app reads bills
 * on the phone; SMS keep the built-in parser's result).
 */
export function planAi(opts: { feature: AiFeature; user: UserAiPrefs; app: AppAiConfig; hasOwnKey: boolean; email?: string }): KeyPlan[] {
  const { feature, user, app, hasOwnKey, email } = opts
  if (!user.aiEnabled || !(feature === 'images' ? user.aiImages : user.aiSms)) return []
  const own: KeyPlan | null = hasOwnKey && user.aiSource !== 'app' ? { key: 'own', models: withFallbacks(user.aiModel) } : null
  const shared: KeyPlan | null = user.aiSource !== 'own' && appKeyAllowed(app, feature, email) ? { key: 'app', models: withFallbacks(app.model) } : null
  return [own, shared].filter((p): p is KeyPlan => !!p)
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
