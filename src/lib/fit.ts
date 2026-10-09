/**
 * Fitting one line of text to its box without wrapping. Text size isn't the same everywhere:
 * Android's font-size setting and Chrome's text scaling enlarge it, so a headline that fits on
 * one iPhone can break onto two lines on a small Android phone. These take measured widths
 * (px, the line at its full size) and decide what to show.
 */

/**
 * The first of `widths` (longest label first) that fits `box` when shrunk to no less than
 * `min` of its size, and the scale to draw it at (1 when it fits as it is). When none fits even
 * at `min`, the last (shortest) one, shrunk as far as it needs.
 */
export function fitLabel(widths: number[], box: number, min = 0.8): { index: number; scale: number } {
  if (!widths.length || box <= 0) return { index: 0, scale: 1 }
  for (let i = 0; i < widths.length; i++) {
    const scale = Math.min(1, box / Math.max(1, widths[i]))
    if (scale >= min) return { index: i, scale: round(scale) }
  }
  const last = widths.length - 1
  return { index: last, scale: round(Math.min(1, box / Math.max(1, widths[last]))) }
}

/** True when a line of `content` px would not fit `box` px (with a pixel of slack for rounding). */
export const overflows = (content: number, box: number) => content > box + 0.5

// Floors to 3 decimals, so the scaled line never ends up a hair wider than the box.
const round = (n: number) => Math.floor(n * 1000) / 1000
