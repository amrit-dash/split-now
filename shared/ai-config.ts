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

/** Recommended model; also the fallback when a chosen model is retired (404). */
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
export const MODEL_ALIAS = 'gemini-flash-lite-latest'
export const MAX_ALLOW_EMAILS = 200

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
}

export const DEFAULT_APP_AI: AppAiConfig = { mode: 'off', allowEmails: [], images: true, sms: true, model: DEFAULT_MODEL, perDay: 100, perHour: 30 }

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

const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{2,79}$/
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

export interface KeyPlan { key: 'own' | 'app'; models: string[] }

/** A model list that never ends without the recommended model and its alias. */
export const withFallbacks = (m: string | undefined) => [...new Set([m || DEFAULT_MODEL, DEFAULT_MODEL, MODEL_ALIAS])]

/**
 * Which keys to try, in order, for one request. Empty = don't call AI at all (the app reads bills
 * on the phone; SMS keep the built-in parser's result).
 */
export function planAi(opts: {
  feature: AiFeature
  user: UserAiPrefs
  app: AppAiConfig
  hasOwnKey: boolean
  email?: string
}): KeyPlan[] {
  const { feature, user, app, hasOwnKey, email } = opts
  if (!user.aiEnabled || !(feature === 'images' ? user.aiImages : user.aiSms)) return []
  const own: KeyPlan | null = hasOwnKey && user.aiSource !== 'app' ? { key: 'own', models: withFallbacks(user.aiModel) } : null
  const shared: KeyPlan | null = user.aiSource !== 'own' && appKeyAllowed(app, feature, email) ? { key: 'app', models: withFallbacks(app.model) } : null
  return [own, shared].filter((p): p is KeyPlan => !!p)
}

/** Gemini models worth offering: text+image generation, Flash family, not audio/image-out/embedding/preview-only oddities. */
export function usefulModels(list: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = []
  for (const m of list) {
    const id = m.name.replace(/^models\//, '')
    if (!m.supportedGenerationMethods?.includes('generateContent')) continue
    if (!/flash/.test(id) || /image|tts|audio|live|embedding|native|thinking-exp|robotics|computer/.test(id)) continue
    if (!validModel(id)) continue
    out.push({ id, label: m.displayName || id })
  }
  // Newest-looking first: higher version numbers, then "lite" after the full model.
  const ver = (id: string) => Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
  return out.sort((a, b) => ver(b.id) - ver(a.id) || a.id.length - b.id.length || a.id.localeCompare(b.id))
}

/** Shown in settings; never more than the last 4 characters of a key. */
export const keyHint = (key: string) => (key.length >= 8 ? `…${key.slice(-4)}` : '…')

/**
 * A loose shape check (Google decides for real): classic `AIza…` keys and newer formats with dots
 * or other URL-safe characters. Rejects only obvious mistakes like a short word or a URL.
 */
export const looksLikeGeminiKey = (k: string) => /^[A-Za-z0-9_\-.~+/=]{20,256}$/.test(k.trim()) && !/^https?/i.test(k.trim())
