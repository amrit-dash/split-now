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
 * Gemini's image models, cheapest first (checked 2026-10-16 against ai.google.dev pricing:
 * Nano Banana 2 Lite and Nano Banana 2.1 about US$0.034 a 1K square; Nano Banana 2 US$0.045 at 512px).
 * None has a free tier, and Gemma can't draw pictures at all: a picture is always paid for.
 */
export const PICTURE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image'] as const

/** What a picture costs, as the sheet says it (rounded up; the person's or the project's bill). */
export const PICTURE_COST = 'about US$0.03'

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

export type IconPictureResponse = { image: string; mimeType: string; via: 'own' | 'app' } | { unavailable: true; reason: string }
