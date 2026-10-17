import { cleanIconImage, PICTURE_MODEL_INFO, PICTURE_MODELS, pictureCost } from '../../shared/icon-ai'
import { cleanSvg, svgDataUrl } from '../../shared/svg-icon'

/*
 * "Suggest with AI" in the icon sheet: whether it is offered, and how a drawn icon is shown. The
 * server decides in the end (functions/src/ai.ts iconsAi); this only keeps the button away where it
 * can't work, and always away from a private group, whose titles must not leave the phone.
 */

export function iconAiOffered(o: {
  mode: 'firebase' | 'demo'
  /** the admin's switch (config/app flags.aiIcons) */
  flag: boolean
  online: boolean
  /** a private group: never */
  vault: boolean
  prefs: { aiEnabled: boolean; aiIcons: boolean; aiSource: string; aiFreeOk?: boolean } | null | undefined
  /** the aiStatus answer (undefined while loading, null when it can't be checked) */
  status: { app: { images: string; engine?: string } } | null | undefined
  hasOwnKey: boolean
}): boolean {
  if (!o.flag || o.vault) return false
  // The demo answers on the phone (src/lib/icon-ai-demo.ts).
  if (o.mode === 'demo') return true
  if (!o.online || !o.prefs?.aiEnabled || !o.prefs.aiIcons) return false
  // Split Now's free AI (Gemma) serves only people who agreed to it; it rides on the bills allowance.
  const shared = o.prefs.aiSource !== 'own' && o.status?.app.images === 'available' && (o.status.app.engine !== 'gemma' || o.prefs.aiFreeOk === true)
  const own = o.prefs.aiSource !== 'app' && o.hasOwnKey
  return shared || own
}

/**
 * The automatic icon's AI fallback (src/lib/icon-pick.ts): offered on the same keys as "Suggest
 * with AI", under its own admin switch (flags.aiIconAuto) and the person's own (aiIconAuto).
 */
type Offer = Parameters<typeof iconAiOffered>[0]
export function autoPickOffered(o: Omit<Offer, 'prefs'> & { prefs: (NonNullable<Offer['prefs']> & { aiIconAuto: boolean }) | null | undefined }): boolean {
  return iconAiOffered({ ...o, prefs: o.prefs ? { ...o.prefs, aiIcons: o.prefs.aiIconAuto } : o.prefs })
}

/**
 * "Draw a picture" next to the drawn icons: whose key would pay, or null when it isn't offered.
 * The person's own key whenever they added one (the sheet says it's billed to it, even while
 * Split Now's free AI is what they use), else the shared key when the admin allows pictures on it.
 * Never in a private group. The demo draws its stand-in.
 */
export function pictureOffer(
  o: Parameters<typeof iconAiOffered>[0] & { status: { app: { images: string; engine?: string; pictures?: string } } | null | undefined },
): 'own' | 'app' | null {
  if (!o.flag || o.vault) return null
  if (o.mode === 'demo') return 'app'
  if (!o.online || !o.prefs?.aiEnabled || !o.prefs.aiIcons) return null
  if (o.hasOwnKey && o.prefs.aiSource !== 'app') return 'own'
  if (o.prefs.aiSource !== 'own' && o.status?.app.pictures === 'available') return 'app'
  return null
}

/**
 * The face to draw for something with an icon: a picture (Draw a picture), else an AI-drawn icon
 * (cleaned again here: the stored markup could have been written by anyone in the group), both
 * as images, else the emoji. A private group never shows either, even if one is stored.
 */
export function iconFace(o: { iconImage?: unknown; iconSvg?: unknown; emoji: string; vault?: boolean }): { src: string } | { emoji: string } {
  if (o.vault) return { emoji: o.emoji }
  const picture = cleanIconImage(o.iconImage)
  if (picture) return { src: picture }
  const svg = typeof o.iconSvg === 'string' ? cleanSvg(o.iconSvg) : null
  return svg ? { src: svgDataUrl(svg) } : { emoji: o.emoji }
}

/** The line under "Suggest with AI" when nothing usable came back: null (no answer), a refusal reason, or an empty answer. */
export function iconAiProblem(r: { unavailable: true; reason: string } | { emoji: string[]; svgs: string[] } | null): string | null {
  if (r === null) return 'Couldn’t reach AI. Check your connection and try again.'
  if ('unavailable' in r) {
    if (r.reason === 'quota') return 'You’ve used today’s AI limit. Pick an icon below for now.'
    if (r.reason === 'needs_ok') return 'Turn on “Use free AI” in Settings → AI features first.'
    if (r.reason === 'off') return 'AI icons are off right now.'
    return 'AI didn’t answer. Try again in a moment.'
  }
  return r.emoji.length || r.svgs.length ? null : 'No icons this time. Try again.'
}

/** The line under "Draw a picture": what it costs and who pays, before anything is asked. */
export const pictureNote = (via: 'own' | 'app', cost: string): string =>
  via === 'own' ? `Billed to your Gemini key, ${cost} a picture` : 'Uses Split Now’s AI; a few a day'

/** Why no picture came back (null: there is one). */
export function pictureProblem(r: { unavailable: true; reason: string } | { image: string } | null, shrunk: boolean): string | null {
  if (r && 'unavailable' in r && r.reason === 'blocked') return 'AI wouldn’t draw that one. Try other words in the title.'
  if (r && 'unavailable' in r && r.reason === 'bad_key') return 'Google rejected your Gemini key. Check it in Settings → AI features.'
  if (r && 'unavailable' in r && r.reason === 'picture_billing')
    return 'Google gave this key no allowance for pictures. Image models have no free tier: turn on billing for the key in Google AI Studio, then try again.'
  if (!r || 'unavailable' in r) return iconAiProblem(r as Parameters<typeof iconAiProblem>[0])
  return shrunk ? null : 'Couldn’t use that picture. Try again.'
}

/** After this long with words typed and no icon picked, the sheet offers AI for them. */
export const AI_IDLE_MS = 3000

/**
 * Whether the icon sheet shows Suggest with AI (and Draw a picture) for what's typed in its
 * search: only once something is typed, and only when no icon matches it or the person has
 * waited AI_IDLE_MS without picking one. Never with an empty search: AI is asked about the
 * search words, the title has its own automatic pick.
 */
export const aiRowShown = (o: { query: string; results: number; idle: boolean }): boolean => o.query.trim().length >= 2 && (o.results === 0 || o.idle)

/**
 * The picture-model picker (Settings → AI features for one's own key, Admin → AI for Split Now's):
 * Recommended first, then the models the key lists with price and speed, and a chosen one the
 * key no longer lists kept so the choice still shows (the server falls back from it anyway).
 */
export function pictureModelOptions(
  models: Array<{ id: string; label: string; usd?: number; speed?: string }> | null,
  chosen: string,
): Array<{ value: string; label: string; hint?: string }> {
  const rec = PICTURE_MODEL_INFO[PICTURE_MODELS[0]]
  // A model well over the recommended one's price says what that buys at icon size: nothing visible.
  const dear = (m: { usd?: number }) => m.usd !== undefined && m.usd > rec.usd * 2
  const line = (m: { usd?: number; speed?: string }) =>
    [m.usd !== undefined ? `about US$${m.usd.toFixed(2)} a picture` : null, m.speed, dear(m) ? 'costs more, no difference at icon size' : null]
      .filter(Boolean)
      .join(' · ')
  return [
    { value: '', label: `Recommended (${rec.name})`, hint: line(rec) },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.label, hint: line(m) || undefined })),
    ...(chosen && !(models ?? []).some((m) => m.id === chosen) ? [{ value: chosen, label: PICTURE_MODEL_INFO[chosen]?.name ?? chosen }] : []),
  ]
}

/** What a picture costs for this person: the model their key (or Split Now's) draws with. */
export const pictureCostFor = (o: { via: 'own' | 'app' | null; ownModel?: string; appModel?: string }): string =>
  pictureCost((o.via === 'own' ? o.ownModel : o.via === 'app' ? o.appModel : '') || PICTURE_MODELS[0])

/** Under a drawn picture: which model drew it and what it cost ("Nano Banana 2 Lite · about US$0.03"); null when unknown. */
export function drawnByLine(model: string | undefined): string | null {
  const id = model?.replace(/^models\//, '')
  if (!id) return null
  const info = PICTURE_MODEL_INFO[id]
  return info ? `${info.name} · ${pictureCost(id)}` : id
}
