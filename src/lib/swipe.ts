/*
 * The decisions behind swipe-to-reveal rows (src/components/SwipeRow.tsx), kept pure so they are
 * tested: which way a drag is going, how far the row follows the finger, and whether it settles
 * open or closed when the finger lifts. Offsets are in px; negative means slid left (actions showing).
 */

/** Movement below this (px, either axis) is still a tap or an undecided drag. */
export const SWIPE_SLOP = 8
/** A horizontal drag must be this many times wider than it is tall, so a slightly slanted scroll stays a scroll. */
export const SWIPE_RATIO = 1.2
/** A flick faster than this (px per ms) opens or closes the row whatever the distance. */
export const SWIPE_FLICK = 0.45
/** How much of the drag past either end still moves the row (a rubber band, not a hard stop). */
const RUBBER = 0.25

export type SwipeAxis = 'x' | 'y'

/**
 * Locks a drag to one axis once it has moved past the slop: 'x' for a mostly horizontal drag (the
 * row takes it), 'y' otherwise (the page scrolls and the row ignores the rest of the gesture).
 * undefined while it is still too small to tell.
 */
export function lockAxis(dx: number, dy: number, slop = SWIPE_SLOP): SwipeAxis | undefined {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < slop && ay < slop) return undefined
  return ax > ay * SWIPE_RATIO ? 'x' : 'y'
}

/**
 * Where the row sits while dragging: `base` (0 closed, -width open) plus the drag, clamped to
 * [-width, 0] with a little rubber band beyond either end.
 */
export function dragOffset(base: number, dx: number, width: number): number {
  const raw = base + dx
  if (raw > 0) return raw * RUBBER
  if (raw < -width) return -width + (raw + width) * RUBBER
  return raw
}

/**
 * Whether the row settles open when the finger lifts. A flick decides on its own (left opens,
 * right closes); otherwise it opens past 40% of the actions' width from closed, and an open row
 * stays open unless dragged back past 40% of the way to closed.
 */
export function settleOpen(offset: number, width: number, velocity: number, wasOpen: boolean): boolean {
  if (width <= 0) return false
  if (velocity <= -SWIPE_FLICK) return true
  if (velocity >= SWIPE_FLICK) return false
  const shown = -offset / width
  return wasOpen ? shown > 0.6 : shown >= 0.4
}

/** A pointer that went down and up without leaving the slop is a tap (a click on the row's content goes through). */
export const isTap = (dx: number, dy: number, slop = SWIPE_SLOP) => Math.abs(dx) < slop && Math.abs(dy) < slop

/** px per ms between two samples; 0 when no time passed. */
export const velocityOf = (x0: number, t0: number, x1: number, t1: number) => (t1 > t0 ? (x1 - x0) / (t1 - t0) : 0)

// --- The action tray, press and hold, and the trackpad ------------------------------------

/** Each action is a round icon button this wide (px), the touch minimum. */
export const ACTION_SIZE = 44
/** Space between the buttons, and inside the tray at both ends. */
export const ACTION_GAP = 8
/**
 * How wide the tray of `n` icon buttons is. It slides in over the row's trailing end (the amount)
 * and the row itself stays put, so the avatar and name on the left are never pushed off screen.
 */
export const trayWidth = (n: number) => (n > 0 ? n * ACTION_SIZE + (n + 1) * ACTION_GAP + ACTION_GAP : 0)

/** How long a finger must rest on a row, without moving past the slop, to open its menu. */
export const LONG_PRESS_MS = 450

/** A press that lasted long enough and stayed inside the slop opens the row's menu. */
export const isLongPress = (ms: number, dx: number, dy: number, slop = SWIPE_SLOP) => ms >= LONG_PRESS_MS && isTap(dx, dy, slop)

/** Horizontal trackpad travel (px of wheel deltaX, summed) that opens or closes a row. */
export const WHEEL_TRIGGER = 40

/**
 * A two-finger horizontal swipe on a trackpad arrives as wheel events. Sums mostly horizontal
 * deltas (a vertical scroll passes through untouched, `handled` false) and decides once the sum
 * passes WHEEL_TRIGGER: fingers moving left (positive deltaX) open, right close. Returns the new
 * sum (reset after a decision) and whether the event belongs to the row.
 */
export function wheelStep(acc: number, dx: number, dy: number): { acc: number; handled: boolean; open?: boolean } {
  if (Math.abs(dx) <= Math.abs(dy) * SWIPE_RATIO) return { acc, handled: false }
  const next = acc + dx
  if (next >= WHEEL_TRIGGER) return { acc: 0, handled: true, open: true }
  if (next <= -WHEEL_TRIGGER) return { acc: 0, handled: true, open: false }
  return { acc: next, handled: true }
}
