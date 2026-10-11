/*
 * The detail level ("look") an admin picks for everyone in Admin → App: how much explaining the
 * app does under its titles and how many optional sections it shows.
 *   full     every subtext as written, every section
 *   needed   "When needed": the one-line version of each subtext; the ones only worth reading
 *            the first time are dropped
 *   minimal  titles only; a subtext stays (in its shortest form) only where leaving it out could
 *            lead someone into a mistake, and optional sections are hidden
 *   tooltip  every subtext as written, folded into a small (i) beside its title (a key one also
 *            keeps its short line, see hintView)
 * Pure: the components that read it are src/components/Hint.tsx.
 */

export const LOOKS = ['full', 'needed', 'minimal', 'tooltip'] as const
export type Look = (typeof LOOKS)[number]

/** Full keeps the app exactly as it was until an admin chooses otherwise. */
export const DEFAULT_LOOK: Look = 'full'

/** What the admin console shows for each choice. */
export const LOOK_INFO: Record<Look, { label: string; hint: string }> = {
  full: { label: 'Full', hint: 'Every explanation, every section.' },
  needed: { label: 'When needed', hint: 'One short line where it helps.' },
  minimal: { label: 'Minimal', hint: 'Titles only; a few must-read lines stay.' },
  tooltip: { label: 'Tooltip', hint: 'Every explanation behind an (i) beside its title.' },
}

export const isLook = (v: unknown): v is Look => typeof v === 'string' && (LOOKS as readonly string[]).includes(v)

/** Anything stored that isn't a known look reads as the default. */
export const resolveLook = (v: unknown): Look => (isLook(v) ? v : DEFAULT_LOOK)

/**
 * How important a subtext is:
 *   key    prevents a mistake (money moves, something is deleted or shared, a choice that is hard to
 *          undo): kept in every look, its shortest form in Minimal
 *   help   explains what a control does: short in When needed, gone in Minimal (the default)
 *   extra  background worth reading once: Full and Tooltip only
 */
export type HintTier = 'key' | 'help' | 'extra'

export interface HintSpec<T> {
  /** The complete text (Full, and the tooltip). */
  full: T
  /** One phrase or one line for When needed; omitted means the full text is already short enough. */
  short?: T
  /** The shortest form for Minimal (key hints only); omitted means `short`. */
  min?: T
  tier?: HintTier
}

/**
 * What to draw for a subtext: `text` under the title, `tip` inside the (i) beside it. Only a key
 * hint in the Tooltip look sets both: a line that stops a mistake must not hide behind a tap, so
 * its short form stays under the title and the full text is in the (i).
 */
export function hintView<T>(look: Look, h: HintSpec<T>): { text: T | null; tip: T | null } {
  const tier = h.tier ?? 'help'
  const short = h.short ?? h.full
  switch (look) {
    case 'full':
      return { text: h.full, tip: null }
    case 'tooltip':
      return { text: tier === 'key' ? (h.min ?? short) : null, tip: h.full }
    case 'needed':
      return { text: tier === 'extra' ? null : short, tip: null }
    case 'minimal':
      return { text: tier === 'key' ? (h.min ?? short) : null, tip: null }
  }
}

/**
 * How much optional UI a look shows: 3 everything (Full, Tooltip), 2 When needed, 1 Minimal.
 * A section marked with `minDetail` 2 is hidden in Minimal; 3 is shown only in Full and Tooltip.
 */
export function lookDetail(look: Look): 1 | 2 | 3 {
  return look === 'minimal' ? 1 : look === 'needed' ? 2 : 3
}

export const showsAt = (look: Look, minDetail: 1 | 2 | 3): boolean => lookDetail(look) >= minDetail
