/*
 * "Suggest with AI" in the icon sheet: what the app sends (iconsAi callable, functions/src/lib/icon-ai.ts)
 * and what comes back. Pure, shared by the app and the functions.
 */

export const ICON_TITLE_MAX = 80
export const ICON_EMOJI = 3
export const ICON_SVGS = 3

export interface IconRequest {
  title: string
  /** what the icon is for, which shapes the prompt: an expense or a group */
  kind: 'expense' | 'group'
  /** an expense's category label ("Transport"), as a hint */
  category?: string
}

/** Emoji first (the dependable choice), then drawn icons, each cleaned (shared/svg-icon.ts). */
export interface IconSuggestions {
  emoji: string[]
  svgs: string[]
}

export type IconAiResponse = IconSuggestions | { unavailable: true; reason: string }

// ---- Draw a picture ---------------------------------------------------------------

/**
 * Gemini's image models Draw a picture knows, with what one picture costs at the size Google
 * returns by default (1K; checked 2026-10-17 at ai.google.dev/gemini-api/docs/pricing) and how
 * quick it was in a live test on a paid key (2026-10-17). None has a free tier, and Gemma can't
 * draw pictures at all: a picture is always paid for. Nano Banana (gemini-2.5-flash-image) is
 * deprecated by Google, so it is never offered.
 */
export const PICTURE_MODEL_INFO: Record<string, { name: string; usd: number; speed: string }> = {
  'gemini-3.1-flash-lite-image': { name: 'Nano Banana 2 Lite', usd: 0.0336, speed: 'about 3 s' },
  'gemini-nano-banana-2.1': { name: 'Nano Banana 2.1', usd: 0.0336, speed: 'about 13 s' },
  'gemini-3.1-flash-image': { name: 'Nano Banana 2', usd: 0.067, speed: 'about 8 s' },
  'gemini-3-pro-image': { name: 'Nano Banana Pro', usd: 0.134, speed: 'about 14 s' },
}

/** The recommended order: the cheapest and quickest first. A chosen model goes in front (picturePlanModels). */
export const PICTURE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image'] as const

/** Models Google is retiring: left out of the pickers even when a key still lists them. */
const RETIRED_PICTURE_MODELS = /^gemini-2\.[05]-flash(-preview)?-image|^gemini-2\.0/

/** The cost line for the recommended model, as the sheet says it when nothing else is known. */
export const PICTURE_COST = 'about US$0.03'

/** What a picture costs on a model, for the sheet and the pickers: "about US$0.03", or the range when the model is unknown. */
export function pictureCost(model?: string): string {
  const info = model ? PICTURE_MODEL_INFO[model] : undefined
  if (!model) return PICTURE_COST
  return info ? `about US$${info.usd.toFixed(2)}` : 'US$0.03 to US$0.13'
}

/** The models to try for a picture: the one chosen (if any), then the recommended ones; three at most. */
export const picturePlanModels = (picked?: string): string[] => [...new Set([...(picked ? [picked] : []), ...PICTURE_MODELS])].slice(0, 3)

/**
 * The image models a key can draw with, for the pickers: what Google lists for it that outputs
 * images, without retired ones and without a "-preview" twin of a model that is listed for good.
 * Known models first, cheapest first; then the rest by name; one entry per model name.
 */
export function pictureModelsFrom(
  list: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>,
): Array<{ id: string; label: string; usd?: number; speed?: string }> {
  const ids = list
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), displayName: m.displayName }))
    .filter((m) => /^[a-z0-9][a-z0-9.-]{2,79}$/.test(m.id) && /image|banana/.test(m.id) && !/imagen|edit|tts|audio|embed/.test(m.id))
    .filter((m) => !RETIRED_PICTURE_MODELS.test(m.id))
  const have = new Set(ids.map((m) => m.id))
  const out = ids
    .filter((m) => !(m.id.endsWith('-preview') && have.has(m.id.replace(/-preview$/, ''))))
    .map((m) => {
      const info = PICTURE_MODEL_INFO[m.id]
      return { id: m.id, label: info?.name ?? m.displayName ?? m.id, ...(info ? { usd: info.usd, speed: info.speed } : {}) }
    })
  out.sort(
    (a, b) => (a.usd ?? 9) - (b.usd ?? 9) || PICTURE_MODELS.indexOf(a.id as never) - PICTURE_MODELS.indexOf(b.id as never) || a.label.localeCompare(b.label),
  )
  // Google lists some models twice under other ids ("nano-banana-pro-preview"): one per name, the known id first.
  const named = new Set<string>()
  return out.filter((m) => !named.has(m.label) && named.add(m.label))
}

/**
 * Whose key draws a picture: the person's own whenever they added one (even while Split Now's free AI
 * is what they use day to day: the sheet says it is billed to their key), else the shared key when
 * it runs Gemini and the admin turned pictures on. Never on Gemma (it can't), never without consent.
 */
export function picturePlan(o: {
  user: { aiEnabled: boolean; aiIcons: boolean; aiSource: string }
  hasOwnKey: boolean
  /** the shared key: on Gemini, pictures allowed, and this account may use it for bills */
  appPictures: boolean
}): 'own' | 'app' | null {
  if (!o.user.aiEnabled || !o.user.aiIcons) return null
  if (o.hasOwnKey && o.user.aiSource !== 'app') return 'own'
  if (o.appPictures && o.user.aiSource !== 'own') return 'app'
  return null
}

/** The picture prompt: one icon-like picture, square, flat, no words. The title goes in as data. */
export const picturePrompt = (r: IconRequest) =>
  `Draw one app icon for ${r.kind === 'group' ? 'a group named' : `an expense${r.category ? ` (${r.category})` : ''} called`} "${r.title}".
Style: a single bold, friendly object or symbol that shows what it is about, centred, filling most of a square canvas, flat colours with soft shading, like a modern emoji. Plain white background. No text, letters or numbers. No people's faces. No border or frame. It must read clearly at 40 pixels.`

/** A stored picture icon: a small data: URL the app made (src/lib/icon-picture.ts), else nothing. */
export const ICON_IMAGE_MAX = 24_000
export function cleanIconImage(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > ICON_IMAGE_MAX) return null
  return /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : null
}

export type IconPictureResponse = { image: string; mimeType: string; via: 'own' | 'app'; model?: string } | { unavailable: true; reason: string }

/**
 * Test pictures (Settings → AI features for one's own key, Admin → AI for Split Now's): one picture
 * drawn with exactly the model asked for, no fallback, so a failure is that model's own. `ms` is
 * how long Google took; `detail` is Google's own sentence when it refused.
 */
export type PictureTestResult =
  | { ok: true; image: string; mimeType: string; model: string; ms: number }
  | { ok: false; model: string; reason: string; detail?: string }

/** What Test pictures draws: a plain subject every image model handles, so a refusal is about the key. */
export const PICTURE_TEST_PROMPT = { title: 'Ferry ride', kind: 'expense' as const, category: 'travel' }

// ---- The automatic pick -------------------------------------------------------------

/**
 * When the app's own rules find no icon for a title (src/lib/icons.ts), the automatic icon asks
 * the AI to choose one from the app's own list (and, for an expense, a category; for a group, a
 * type): one short answer, on the free AI too. The answer must be one of the choices sent.
 */
export const PICK_CHOICES_MAX = 300

export interface IconPickRequest {
  title: string
  kind: 'expense' | 'group'
  /** the emoji it may pick from */
  choices: string[]
  /** an expense's categories (ids) it may pick from, when the category is still to choose */
  categories?: string[]
  /** a group's types it may pick from, when the type is still to choose */
  types?: string[]
}

export type IconPickResponse = { emoji: string | null; category?: string; type?: string } | { unavailable: true; reason: string }
