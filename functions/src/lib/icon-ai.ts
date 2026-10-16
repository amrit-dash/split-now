import { ICON_EMOJI, ICON_SVGS, ICON_TITLE_MAX, type IconRequest, type IconSuggestions } from '../../../shared/icon-ai'
import { cleanSvg } from '../../../shared/svg-icon'
import type { Schema } from './gemini'

/*
 * "Suggest with AI" in the icon sheet (functions/src/ai.ts iconsAi): from an expense's or a
 * group's title, three emoji and up to three small SVG icons. Emoji are the dependable choice;
 * the drawn icons are the creative one, and a small model draws simple shapes far better than
 * scenes, so the prompt asks for a flat, bold, two- or three-colour icon on a 24 × 24 grid and
 * shows what that looks like. Every drawing goes through shared/svg-icon.ts cleanSvg before the
 * app sees it; one that doesn't pass is dropped, never repaired.
 */

/** The request as the server will use it: a short title with no markup, or null. */
export function cleanIconRequest(raw: unknown): IconRequest | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const title =
    typeof r.title === 'string'
      ? r.title
          .replace(/[\p{Cc}<>]+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, ICON_TITLE_MAX)
      : ''
  if (!title) return null
  const kind = r.kind === 'group' ? 'group' : 'expense'
  const category =
    typeof r.category === 'string'
      ? r.category
          .replace(/[^\p{L}\p{N}\s&-]/gu, '')
          .trim()
          .slice(0, 30)
      : ''
  return { title, kind, ...(category && kind === 'expense' ? { category } : {}) }
}

export const ICON_SCHEMA: Schema = {
  type: 'OBJECT',
  properties: {
    emoji: { type: 'ARRAY', items: { type: 'STRING' }, description: `exactly ${ICON_EMOJI} single emoji, best first` },
    svgs: { type: 'ARRAY', items: { type: 'STRING' }, description: `${ICON_SVGS} complete <svg> icons, each a different idea` },
  },
  required: ['emoji', 'svgs'],
  propertyOrdering: ['emoji', 'svgs'],
}

/**
 * The instruction. The title goes in the content (<title>…</title>), never here, so a title can't
 * pass for an instruction. The rules are the ones cleanSvg enforces, said plainly, with two worked
 * examples of the size and style wanted.
 */
export const iconPrompt = (r: IconRequest) => `You design tiny app icons for a bill-splitting app. The user gives the title of ${
  r.kind === 'group' ? 'a group (a trip, a flat, a team, an event)' : `an expense${r.category ? ` in the category "${r.category}"` : ''}`
}. Return icons that show what the title is about at a glance, at 40 pixels.

Return JSON with:
- "emoji": exactly ${ICON_EMOJI} different single emoji that fit the title, the best first. One emoji each: no text, no flags unless the title names a country.
- "svgs": ${ICON_SVGS} different SVG icons for the same title, each a different idea (for "Ferry to Havelock": a ferry; a wave with a sun; an anchor).

Every SVG must follow ALL of these rules, or it is thrown away:
1. Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"> and end with </svg>. Nothing before or after.
2. Draw on the 24 x 24 grid. Keep 2 units of space at every edge: shapes stay between 2 and 22.
3. Use only these elements: path, circle, ellipse, rect, line, polyline, polygon, g.
4. Use only these attributes: d, cx, cy, r, rx, ry, x, y, width, height, x1, y1, x2, y2, points, fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, fill-rule, opacity, transform.
5. Colours are hex only, like #0ea5e9, or none. Use 2 or 3 colours: one strong main colour, one light or dark accent. No gradients, no url(), no CSS, no style attribute.
6. Never use text, letters, numbers, images, links, scripts, filters, masks, clip paths, defs, use, or comments.
7. Keep it simple: 2 to 8 shapes in total. Bold, flat, friendly, like an emoji drawn with a few shapes. One object, no scenery, no background square.
8. Each SVG under 1500 characters. Round numbers to at most 1 decimal place.
9. Lines: stroke-width between 1.5 and 2.5, with stroke-linecap="round" and stroke-linejoin="round".

Example, title "Coffee with Priya":
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="#b45309"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"/><path d="M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3" fill="none" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round"/></svg>

Example, title "Goa trip":
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="17" cy="7" r="3" fill="#f59e0b"/><path d="M3 17c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/><path d="M3 21c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round"/><path d="M8 15V7M8 7c-2 0-4 1-4 3M8 7c2 0 4 1 4 3" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round"/></svg>

If the title is unclear, draw the most likely everyday object for it. Never refuse; never explain.`

/** One emoji (a grapheme with a pictograph), else nothing. */
function oneEmoji(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.length > 16) return null
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)]
  if (parts.length !== 1) return null
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) ? s : null
}

/** What the model answered, kept only where it is what was asked for: each emoji single, each SVG clean, no repeats. */
export function normaliseIcons(raw: unknown): IconSuggestions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const emoji = [...new Set((Array.isArray(r.emoji) ? r.emoji : []).map(oneEmoji).filter((e): e is string => !!e))].slice(0, ICON_EMOJI)
  const svgs = [
    ...new Set(
      (Array.isArray(r.svgs) ? r.svgs : [])
        .slice(0, ICON_SVGS + 2)
        .map(cleanSvg)
        .filter((s): s is string => !!s),
    ),
  ].slice(0, ICON_SVGS)
  return { emoji, svgs }
}
