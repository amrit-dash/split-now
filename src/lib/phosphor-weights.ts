/*
 * Every Phosphor icon ships all six of its weights in one file (thin, light, regular, bold, fill,
 * duotone), so an icon costs six drawings while the app draws three (src/lib/icon-style.ts).
 * The build (vite.config.ts) passes each icon's weights file through dropWeights, which removes
 * the drawings the app never asks for. That halves what each icon adds to the bundle. Pure: a
 * string in, a string out.
 */

/** The weights the app draws: Outline (regular), the tinted big pictures (duotone), Filled (fill). */
export const KEPT_WEIGHTS = ['regular', 'duotone', 'fill'] as const

/** Phosphor's weights files: node_modules/@phosphor-icons/react/dist/defs/<Icon>.es.js */
export const isWeightsFile = (id: string): boolean => /@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][^\\/]+\.es\.js$/.test(id)

/**
 * The end of the array that opens at `start` (a '['), skipping brackets inside strings. -1 when
 * it never closes (the file isn't the shape we expect).
 */
function closing(src: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i
  }
  return -1
}

/**
 * The weights file without the entries for weights outside `keep`. Anything that doesn't look
 * like a weights file (no Map entries found, or brackets that don't close) comes back unchanged,
 * so a new Phosphor version can only cost bytes, never break an icon.
 */
export function dropWeights(src: string, keep: readonly string[] = KEPT_WEIGHTS): string {
  const entry = /\[\s*"(thin|light|regular|bold|fill|duotone)",/g
  const cuts: Array<[number, number]> = []
  for (let m = entry.exec(src); m; m = entry.exec(src)) {
    const end = closing(src, m.index)
    if (end < 0) return src
    if (!keep.includes(m[1])) {
      // Take the comma (and the line break) after the entry with it.
      const after = /^\s*,/.exec(src.slice(end + 1))
      cuts.push([m.index, end + 1 + (after ? after[0].length : 0)])
    }
    entry.lastIndex = end + 1
  }
  if (!cuts.length) return src
  let out = ''
  let at = 0
  for (const [a, b] of cuts) {
    out += src.slice(at, a)
    at = b
  }
  return out + src.slice(at)
}
