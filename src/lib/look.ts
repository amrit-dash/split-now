/*
 * The detail level ("look"): how much explaining the app does under its titles and how many
 * optional sections it shows. An admin picks the default for everyone in Admin → App; each person
 * may pick their own in Settings → Preferences (LookChoice, effectiveLook).
 *   full     "Explain everything": every subtext as written, every section
 *   needed   "Short tips": the one-line version of each subtext; the ones only worth reading
 *            the first time ('extra') are dropped
 *   minimal  "Titles only": a subtext stays (in its shortest form) only where leaving it out could
 *            lead someone into a mistake ('key'), and optional sections are hidden
 *   tooltip  "Tips behind (i)": every subtext as written, folded into a small (i) beside its title
 *            (a key one also keeps its short line, see hintView)
 * The ids are stored and synced (config/app.look, the person's own choice) and checked by
 * firestore.rules, so only the labels may change.
 * Pure: the components that read it are src/components/Hint.tsx.
 */

export const LOOKS = ['full', 'needed', 'minimal', 'tooltip'] as const
export type Look = (typeof LOOKS)[number]

/** Full keeps the app exactly as it was until an admin chooses otherwise. */
export const DEFAULT_LOOK: Look = 'full'

/** What Settings → Preferences and the admin console show for each choice: the label says what you get. */
export const LOOK_INFO: Record<Look, { label: string; hint: string }> = {
  full: { label: 'Explain everything', hint: 'Every tip and every section.' },
  needed: { label: 'Short tips', hint: 'One short line where it helps.' },
  minimal: { label: 'Titles only', hint: 'Only warnings about money and data stay.' },
  tooltip: { label: 'Tips behind (i)', hint: 'Tap (i) beside a title to read more.' },
}

/**
 * A person's own choice in Settings → Preferences: one of the looks, or 'app' to follow the one
 * the admin picked (the default). It follows the account like the theme (appearance-sync.ts).
 */
export type LookChoice = Look | 'app'
export const LOOK_CHOICES: readonly LookChoice[] = ['app', ...LOOKS]
export const isLookChoice = (v: unknown): v is LookChoice => v === 'app' || isLook(v)
export const resolveLookChoice = (v: unknown): LookChoice => (isLookChoice(v) ? v : 'app')

/** The look to draw: the person's own choice, else the admin's. */
export const effectiveLook = (admin: Look, mine: LookChoice): Look => (mine === 'app' ? admin : mine)

export const isLook = (v: unknown): v is Look => typeof v === 'string' && (LOOKS as readonly string[]).includes(v)

/** Anything stored that isn't a known look reads as the default. */
export const resolveLook = (v: unknown): Look => (isLook(v) ? v : DEFAULT_LOOK)

/**
 * How important a subtext is:
 *   key    prevents a mistake (money moves, something is deleted or shared, a choice that is hard to
 *          undo): kept in every look, its shortest form in Titles only
 *   help   explains what a control does: short in Short tips, gone in Titles only (the default)
 *   extra  background worth reading once, for a control whose title already says enough:
 *          Explain everything and Tips behind (i) only
 */
export type HintTier = 'key' | 'help' | 'extra'

export interface HintSpec<T> {
  /** The complete text (Full, and the tooltip). */
  full: T
  /** One phrase or one line for Short tips; omitted means the full text is already short enough. */
  short?: T
  /** The shortest form for Titles only (key hints only); omitted means `short`. */
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
    case 'tooltip': {
      if (tier !== 'key') return { text: null, tip: h.full }
      const line = h.min ?? short
      // A key hint with no shorter form is already all there is: no (i) repeating it.
      return { text: line, tip: line === h.full ? null : h.full }
    }
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
