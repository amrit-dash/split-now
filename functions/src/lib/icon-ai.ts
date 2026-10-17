import { ICON_EMOJI, ICON_SVGS, ICON_TITLE_MAX, type IconPickRequest, type IconRequest, type IconSuggestions, PICK_CHOICES_MAX } from '../../../shared/icon-ai'
import { cleanSvg } from '../../../shared/svg-icon'

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

/**
 * The instruction. The title goes in the content (<title>…</title>), never here, so a title can't
 * pass for an instruction. The rules are the ones cleanSvg enforces, said plainly, with two worked
 * examples of the size and style wanted.
 */
export const iconPrompt = (r: IconRequest) => `You design tiny app icons for a bill-splitting app. The user gives the title of ${
  r.kind === 'group' ? 'a group (a trip, a flat, a team, an event)' : `an expense${r.category ? ` in the category "${r.category}"` : ''}`
}. Return icons that show what the title is about at a glance, at 40 pixels.

Answer in plain text, in exactly this shape and nothing else (no JSON, no code fences, no explanations):
EMOJI: <${ICON_EMOJI} different single emoji that fit the title, best first, separated by spaces>
<svg ...>...</svg>
<svg ...>...</svg>
<svg ...>...</svg>

The ${ICON_SVGS} SVG icons are for the same title, each a different idea (for "Ferry to Havelock": a ferry; a wave with a sun; an anchor), each on its own line.
One emoji each on the EMOJI line: no text, no flags unless the title names a country.

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

If the title is unclear, draw the most likely everyday object for it. Never refuse; never explain. Start your answer with EMOJI:`

/** One emoji (a grapheme with a pictograph), else nothing. */
function oneEmoji(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.length > 16) return null
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)]
  if (parts.length !== 1) return null
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) ? s : null
}

/**
 * The plain-text answer (iconPrompt's shape) read as suggestions: the emoji on the EMOJI line (or,
 * if the model left the label off, the first line without markup), and every <svg>…</svg> in the
 * text, wherever it sits (code fences and stray words around them don't matter). Each part is
 * kept or dropped on its own, so one broken drawing doesn't spoil the rest.
 */
export function parseIconText(text: string): IconSuggestions {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const line = lines.find((l) => /^\**emoji\**\s*[:：]/i.test(l)) ?? lines.find((l) => l && !l.includes('<') && !l.startsWith('```')) ?? ''
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line.replace(/^\**emoji\**\s*[:：]/i, ''))].map((g) => g.segment)
  const svgs = [...text.matchAll(/<svg[\s\S]*?<\/svg>/gi)].map((m) => m[0])
  return normaliseIcons({ emoji: graphemes.filter((g) => g.trim()), svgs })
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

const word = (v: unknown): v is string => typeof v === 'string' && /^[a-z]{2,20}$/.test(v)

/** The automatic pick's request as the server uses it: a short title, and lists it can trust. */
export function cleanPickRequest(raw: unknown): IconPickRequest | null {
  const base = cleanIconRequest(raw)
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!base) return null
  const choices = [...new Set((Array.isArray(r.choices) ? r.choices : []).map(oneEmoji).filter((e): e is string => !!e))].slice(0, PICK_CHOICES_MAX)
  if (!choices.length) return null
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(word))].slice(0, 30) : [])
  const categories = list(r.categories)
  const types = list(r.types)
  return { title: base.title, kind: base.kind, choices, ...(categories.length ? { categories } : {}), ...(types.length ? { types } : {}) }
}

/** The pick's instruction: one line back, from the lists given. The title goes in the content. */
export const pickPrompt = (
  r: IconPickRequest,
) => `You choose the icon for ${r.kind === 'group' ? 'a group' : 'an expense'} in a bill-splitting app, from its title.
Choose exactly one emoji from this list, copied exactly: ${r.choices.join(' ')}
${r.categories ? `Also choose its category, one of: ${r.categories.join(', ')}.\n` : ''}${r.types ? `Also choose the group's type, one of: ${r.types.join(', ')}.\n` : ''}Answer with one line and nothing else, in this shape:
EMOJI <emoji>${r.categories ? ' CATEGORY <category>' : ''}${r.types ? ' TYPE <type>' : ''}
Pick what the title is most likely about (for "Thalassa" a Greek restaurant: 🍽️ food). If nothing in the list fits at all, answer: EMOJI none`

/** The one-line answer, kept only where it names something from the lists sent. */
export function parsePick(text: string, r: IconPickRequest): { emoji: string | null; category?: string; type?: string } {
  const line = text
    .replace(/```\w*|```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const after = (label: string) => line.match(new RegExp(`${label}\\s*[:：]?\\s*(\\S+)`, 'i'))?.[1]
  const raw = after('EMOJI') ?? ''
  // The emoji may come with a variation selector or without: match the list's own spelling.
  const strip = (e: string) => e.replace(/️/g, '')
  const emoji = r.choices.find((c) => strip(c) === strip(raw)) ?? r.choices.find((c) => line.includes(c)) ?? null
  const category = after('CATEGORY')?.toLowerCase()
  const type = after('TYPE')?.toLowerCase()
  return {
    emoji: raw.toLowerCase() === 'none' ? null : emoji,
    ...(category && r.categories?.includes(category) ? { category } : {}),
    ...(type && r.types?.includes(type) ? { type } : {}),
  }
}
