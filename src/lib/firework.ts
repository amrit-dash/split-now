/**
 * Colours for the Home card's fireworks (CardFirework), chosen against the fill under them.
 *
 * On a deep fill (white text) the sparks are washed-out light colours added on top ('lighter'
 * blending), so they glow. On a bright fill (dark ink: Neon, or any accent with "Text on accent"
 * set to Black) adding light to a near-white surface shows nothing, so the sparks are drawn
 * normally in rich deep hues instead (violet, indigo, magenta, blue, teal, the accent's own 800 shade),
 * larger and more of them, so the burst still reads as a celebration rather than specks of dirt.
 * The fill's own on-fill colour decides which, so it always matches the text on the card.
 */

export interface FireworkTheme {
  /** --color-on-fill: the text colour on the card. */
  onFill: string
  brand200: string
  brand300: string
  duo300: string
  brand700: string
  brand800: string
  duo700: string
}

export interface FireworkLook {
  /** Canvas compositing: additive glow on deep fills, plain paint on bright ones. */
  blend: 'lighter' | 'source-over'
  /** Burst colours to pick a shell's main colour from (repeats weight the pick). */
  main: string[]
  /** Second colours for a shell, used for one particle in four. */
  accents: string[]
  /** The rising shell's head, its trail and the embers it sheds. */
  head: string
  trail: string
  ember: string
  /** The burst flash, as "r,g,b" for an rgba() gradient. */
  flash: string
  /** Multiplier on particle opacity: ink on a light fill reads a little stronger than light on dark. */
  alpha: number
  /** Opacity of the soft halo round each particle (a dark halo on a light fill looks like smudges, so it stays faint). */
  halo: number
  /** Size multiplier for sparks, the shell's head and its trail. */
  spark: number
  /** Multiplier on the number of sparks per burst. */
  count: number
  /** How long the rising shell's trail lingers, in ms. */
  trailMs: number
  /** Whether a shell mixes three colours (festive) rather than one main colour and a hint of another. */
  mixed: boolean
}

/** Saturated deep hues that stand out on any bright fill (each well under 0.2 luminance). */
export const FESTIVE_DEEP = ['#6d28d9', '#4338ca', '#c026d3', '#1d4ed8', '#0f766e'] as const

const WHITE = '#fffaf2'
const GOLD = '#f6dc9a'

/** sRGB channels of a #rgb / #rrggbb / rgb() colour, or null when it is something else. */
export function parseRgb(c: string): [number, number, number] | null {
  const v = c.trim().toLowerCase()
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (short) return [short[1], short[2], short[3]].map((x) => parseInt(x + x, 16)) as [number, number, number]
  const long = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/)
  if (long) return [long[1], long[2], long[3]].map((x) => parseInt(x, 16)) as [number, number, number]
  const fn = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/)
  if (fn) return [+fn[1], +fn[2], +fn[3]].map((x) => Math.round(x)) as [number, number, number]
  return null
}

/** Whether a colour is dark (relative luminance under 0.2); unknown formats count as light. */
export function isDark(c: string): boolean {
  const rgb = parseRgb(c)
  if (!rgb) return false
  const [r, g, b] = rgb.map((x) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2
}

export function fireworkLook(t: FireworkTheme): FireworkLook {
  if (isDark(t.onFill)) {
    // Bright fill: rich deep hues, painted rather than added, bigger and more of them.
    const ink = t.onFill
    return {
      blend: 'source-over',
      main: [...FESTIVE_DEEP, t.brand800],
      accents: [...FESTIVE_DEEP, t.brand800, t.duo700],
      head: ink,
      trail: t.brand800,
      ember: t.brand800,
      // A white flash lifts the bright fill a little at the burst; an ink one read as a smudge.
      flash: '255,255,255',
      alpha: 1.6,
      halo: 0.035,
      spark: 1.8,
      count: 1.5,
      trailMs: 380,
      mixed: true,
    }
  }
  return {
    blend: 'lighter',
    main: [t.brand200, t.brand300, t.duo300, WHITE, GOLD, t.brand200, t.duo300],
    accents: [WHITE, GOLD, t.brand200, t.duo300],
    head: '#fff8e8',
    trail: '#fff1d0',
    ember: '#fff3d6',
    flash: '255,246,222',
    alpha: 1,
    halo: 0.13,
    spark: 1,
    count: 1,
    trailMs: 260,
    mixed: false,
  }
}
