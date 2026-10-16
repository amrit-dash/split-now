import { ICON_EMOJI, type IconRequest, type IconSuggestions } from '../../shared/icon-ai'
import { cleanSvg } from '../../shared/svg-icon'
import { bestIcon, searchIcons } from './icons'

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
