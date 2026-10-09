/*
 * The one-line banner text (src/components/Marquee.tsx): whether it scrolls, and how fast. The
 * component measures; this decides, so the decision is tested without a DOM.
 */

/** Scroll speed, px per second: slow enough to read at a glance. */
export const MARQUEE_SPEED = 40
/** Blank space between the end of the text and its next copy, px. */
export const MARQUEE_GAP = 48
/** Never faster than one loop in this many seconds, however short the overflow. */
const MIN_SECONDS = 6

export interface MarqueePlan {
  /** true: render the duplicate and run the loop; false: one static (or, with reduced motion, wrapping) copy */
  scroll: boolean
  /** seconds per loop (text width + gap at MARQUEE_SPEED); 0 when not scrolling */
  seconds: number
}

/**
 * `textWidth` is the text's natural one-line width, `boxWidth` the space it has (both px).
 * It scrolls only when the text is wider than the box (a 1px slack absorbs subpixel rounding)
 * and the person hasn't asked for reduced motion; then the loop takes as long as the text and
 * its gap take to pass at a steady speed, so longer text moves at the same pace, not faster.
 */
export function marqueePlan({ textWidth, boxWidth, reducedMotion }: { textWidth: number; boxWidth: number; reducedMotion: boolean }): MarqueePlan {
  if (reducedMotion || !(boxWidth > 0) || !(textWidth > boxWidth + 1)) return { scroll: false, seconds: 0 }
  const seconds = Math.max(MIN_SECONDS, Math.round(((textWidth + MARQUEE_GAP) / MARQUEE_SPEED) * 10) / 10)
  return { scroll: true, seconds }
}
