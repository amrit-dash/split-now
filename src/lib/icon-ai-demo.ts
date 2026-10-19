import { ICON_EMOJI, type IconPickRequest, type IconPickResponse, type IconRequest, type IconSuggestions, PICK_ALTS } from '../../shared/icon-ai'
import { cleanSvg } from '../../shared/svg-icon'
import { bestIcon, ICONS, searchIcons } from './icons'

/*
 * Demo mode's "Suggest with AI" (localRepo.iconsAi): no model on the phone, so the emoji come from
 * the icon catalogue (the best match, then matches for each word) and the drawings are two simple
 * built-in shapes in a colour picked from the title. Enough to try the sheet end to end.
 */

const COLOURS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#14b8a6']

const colourOf = (title: string) => COLOURS[[...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLOURS.length]

const drawings = (c: string) => [
  // a tag
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" fill="${c}"/><circle cx="8" cy="8" r="2" fill="#ffffff"/></svg>`,
  // a star on a disc
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${c}"/><polygon points="12,6 13.8,10 18,10.3 14.8,13 15.8,17.2 12,15 8.2,17.2 9.2,13 6,10.3 10.2,10" fill="#ffffff"/></svg>`,
]

export function demoIcons(r: IconRequest): IconSuggestions {
  const first = bestIcon(r.title)?.emoji
  const words = r.title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2)
  const more = words.flatMap((w) => searchIcons(w).slice(0, 2))
  const emoji = [...new Set([first, ...more, '✨', '🧾', '📌'].filter((e): e is string => !!e))].slice(0, ICON_EMOJI)
  const svgs = drawings(colourOf(r.title))
    .map(cleanSvg)
    .filter((s): s is string => !!s)
  return { emoji, svgs }
}

/**
 * A few things the catalogue has no icon for, so the demo's stand-in shows the pick going beyond
 * the app's own list as the real AI does ("Sri Lanka bees": 🐝, also 🇱🇰).
 */
const DEMO_WORLD: Record<string, string> = { bee: '🐝', bees: '🐝', honey: '🍯', lanka: '🇱🇰', srilanka: '🇱🇰', japan: '🇯🇵', kyoto: '🇯🇵', bali: '🇮🇩' }

/**
 * Demo mode's automatic icon with AI (localRepo.iconPickAi): for each of the title's words, a
 * catalogue entry whose words start like it ("Gondola" finds 🚡), else a few emoji from beyond
 * the catalogue; the first found is the pick and the next (up to three) the ones offered beside it, with
 * the first's category or group type when those were asked for. A stand-in for the model.
 */
export function demoIconPick(r: IconPickRequest): IconPickResponse {
  const words = r.title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2)
  const found = [...new Set(words.map((w) => DEMO_WORLD[w] ?? searchIcons(w)[0]).filter((e): e is string => !!e))]
  const [emoji, ...rest] = found
  if (!emoji) return { emoji: null }
  const alts = rest.slice(0, PICK_ALTS)
  const alt = alts[0]
  const entry = ICONS.find((e) => e.emoji === emoji)
  const category = entry?.categories.find((c) => r.categories?.includes(c))
  const type = entry?.group && r.types?.includes(entry.group) ? entry.group : undefined
  return { emoji, ...(alt ? { alt, alts } : {}), ...(category ? { category } : {}), ...(type ? { type } : {}) }
}
