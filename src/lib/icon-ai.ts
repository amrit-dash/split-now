import { cleanIconImage, PICTURE_MODEL_INFO, PICTURE_MODELS, pictureCost, priceText } from '../../shared/icon-ai'
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
 * Why "Suggest with AI", "Draw a picture" and the automatic icon's AI pick aren't offered, in
 * the person's words, so the icon sheet can say so (with a way to fix it) instead of quietly
 * leaving them out. Null when they are offered, while the AI status is still loading, in a
 * private group (which never uses AI, and says so elsewhere), and in the demo.
 */
export function iconAiWhy(o: Offer): string | null {
  if (o.vault || o.mode === 'demo') return null
  if (!o.flag) return 'AI icons are switched off for everyone right now.'
  if (!o.online) return 'AI icons need the internet.'
  if (!o.prefs) return null
  if (!o.prefs.aiEnabled) return 'AI is off for you. Turn on Use AI in AI features.'
  if (!o.prefs.aiIcons) return 'AI icons are off in AI features.'
  if (iconAiOffered(o)) return null
  if (o.prefs.aiSource === 'own' && !o.hasOwnKey) return 'You chose your own Gemini key, but none is added yet. Add it in AI features.'
  if (o.status === undefined) return null
  if (o.status === null) return 'Couldn’t check AI right now. Try again in a moment.'
  const app = o.status.app
  if (o.prefs.aiSource !== 'own' && app.images === 'available' && app.engine === 'gemma' && o.prefs.aiFreeOk !== true)
    return 'Agree to Split Now’s free AI in AI features to get AI icons, or add your own Gemini key.'
  if (app.images === 'not_listed') return 'Split Now’s AI isn’t open to your account yet. Add your own Gemini key in AI features.'
  return 'Split Now’s AI isn’t on for icons right now. Add your own Gemini key in AI features.'
}

/**
 * Why "Draw a picture" isn't offered where "Suggest with AI" is: a picture needs a key with
 * billing, which is the person's own Gemini key, or Split Now's once an admin turns pictures on
 * for it (Admin → AI; off until then). Null when it is offered, or when AI icons aren't at all
 * (iconAiWhy says that).
 */
export function pictureWhy(o: Parameters<typeof pictureOffer>[0] & { admin?: boolean }): string | null {
  if (o.mode === 'demo' || !iconAiOffered(o) || pictureOffer(o)) return null
  if (o.prefs?.aiSource === 'app' && o.hasOwnKey) return 'Draw a picture uses your own key, and you chose Only Split Now’s key in AI features.'
  if (o.admin) return 'Draw a picture: add your own Gemini key in AI features, or turn on pictures for Split Now’s key in Admin → AI.'
  return 'Draw a picture needs a key with billing: add your own Gemini key in AI features.'
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

/**
 * Google's refusals of a picture (functions/src/lib/gemini.ts pictureRefusal), each with its own
 * fix. On Split Now's key the person can't fix the key, so they hear only that it can't draw now.
 */
export function pictureRefusalText(reason: string, via: 'own' | 'app'): string | null {
  if (via === 'app' && (reason === 'picture_credit' || reason === 'picture_billing')) return 'Split Now’s AI can’t draw pictures right now. Try again later.'
  if (reason === 'picture_credit') return 'The key’s prepaid Google credit has run out. Top it up in Google AI Studio → Billing, then try again.'
  if (reason === 'picture_billing')
    return 'Google gave this key no allowance for pictures. Image models have no free tier: turn on billing for the key in Google AI Studio, then try again.'
  if (reason === 'picture_busy') return 'Google is limiting how many pictures this key can draw just now. Wait a minute and try again.'
  if (reason === 'blocked') return 'AI wouldn’t draw that one. Try other words in the title.'
  if (reason === 'bad_key') return 'Google rejected the Gemini key. Check it in Settings → AI features.'
  if (reason === 'model') return 'This key can’t use that model. Choose another one.'
  return null
}

/** Why no picture came back (null: there is one). */
export function pictureProblem(
  r: { unavailable: true; reason: string } | { image: string } | null,
  shrunk: boolean,
  via: 'own' | 'app' = 'own',
): string | null {
  const refused = r && 'unavailable' in r ? pictureRefusalText(r.reason, via) : null
  if (refused) return refused
  if (!r || 'unavailable' in r) return iconAiProblem(r as Parameters<typeof iconAiProblem>[0])
  return shrunk ? null : 'Couldn’t use that picture. Try again.'
}

/** Above Test pictures: it is a real picture, billed to the key, with the model chosen. */
export const pictureTestNote = (model: string, whose: 'your' | 'Split Now’s'): string =>
  `Draws one picture with the chosen model and nothing else, so you see whether it works and how fast. It is billed to ${whose} key: ${pictureCost(model || PICTURE_MODELS[0])}.`

/** Under a test: what drew it, how long it took and what it cost, or why Google refused (its own words follow separately). */
export function pictureTestLine(r: { ok: true; model: string; ms: number } | { ok: false; model: string; reason: string }): string {
  const id = r.model.replace(/^models\//, '')
  const name = PICTURE_MODEL_INFO[id]?.name ?? id
  if (r.ok) return `${name} drew this in ${(r.ms / 1000).toFixed(1)} s · ${pictureCost(id)}`
  return `${name}: ${pictureRefusalText(r.reason, 'own') ?? 'Google couldn’t draw it. Try again in a moment.'}`
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
    [m.usd !== undefined ? `about ${priceText(m.usd)} a picture` : null, m.speed, dear(m) ? 'costs more, no difference at icon size' : null]
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
