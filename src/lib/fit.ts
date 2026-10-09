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

/**
 * A one-line hint wider than its field drifts sideways so it can be read in full (Quick add's
 * empty field). Null when it fits. `shift` is how far it travels (px, with `gap` of breathing
 * room at the end); `seconds` is one full cycle at about `speed` px a second, held still at
 * both ends for a while (see the `hint-marquee` keyframes), never shorter than 6 s.
 */
export function marqueeFor(content: number, box: number, speed = 40, gap = 12): { shift: number; seconds: number } | null {
  if (box <= 0 || !overflows(content, box)) return null
  const shift = Math.ceil(content - box + gap)
  // The keyframes spend 35% of the cycle moving each way and 30% holding at the two ends.
  return { shift, seconds: Math.max(6, Math.round(((shift / speed) * 2) / 0.7)) }
}
