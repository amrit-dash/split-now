/*
 * Swipe to dismiss, for every floating notification (the What's new and New version banners,
 * the install banner, toasts): the card follows the finger sideways and goes once it has moved
 * far enough, or was flicked fast enough; anything less springs back. Pure, so the decisions are
 * tested; src/hooks/useSwipeDismiss.ts wires it to pointer events.
 */

/** How far a finger moves before the gesture counts as sideways or up-and-down (a tap stays a tap). */
export const SWIPE_LOCK_PX = 8
/** Moved this share of the card's width: it goes. */
export const SWIPE_DISMISS_SHARE = 0.35
/** Or flicked at least this fast (px per ms), at least SWIPE_LOCK_PX * 3 far. */
export const SWIPE_FLING = 0.6

/** Which way the gesture is going, once it has moved far enough to tell; null before then. A vertical one is left to the page's scroll. */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

/** At the finger's release: dismiss the card (and which way it leaves), or spring it back. */
export function swipeOutcome(o: { dx: number; dt: number; width: number }): 'left' | 'right' | 'back' {
  const width = Math.max(o.width, 1)
  const speed = Math.abs(o.dx) / Math.max(o.dt, 1)
  const far = Math.abs(o.dx) >= width * SWIPE_DISMISS_SHARE
  const flung = speed >= SWIPE_FLING && Math.abs(o.dx) >= SWIPE_LOCK_PX * 3
  if (!far && !flung) return 'back'
  return o.dx < 0 ? 'left' : 'right'
}

/** How see-through the card is while dragged: fully there at rest, fading as it nears the edge. */
export function swipeOpacity(dx: number, width: number): number {
  const share = Math.min(Math.abs(dx) / Math.max(width, 1), 1)
  return Math.max(0.2, 1 - share * 0.8)
}
