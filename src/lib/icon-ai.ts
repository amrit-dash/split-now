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
 * The face to draw for something with an icon: an AI-drawn one (cleaned again here: the stored
 * markup could have been written by anyone in the group) as an image, else the emoji. A private
 * group never shows a drawn one, even if one is stored.
 */
export function iconFace(o: { iconSvg?: unknown; emoji: string; vault?: boolean }): { src: string } | { emoji: string } {
  const svg = !o.vault && typeof o.iconSvg === 'string' ? cleanSvg(o.iconSvg) : null
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
