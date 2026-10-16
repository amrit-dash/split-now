/*
 * Press and hold: what counts as one. A hold is a press that stays down LONG_PRESS_MS without
 * moving more than MOVE_SLOP pixels (more is a scroll, not a hold). The click that a browser
 * sends when a hold ends is swallowed, so a hold never also does what a tap does. The context
 * menu (a right click, the keyboard's menu key, Android's own long press) counts as a hold too:
 * that is how a mouse or a keyboard reaches it. src/hooks/useLongPress.ts wires it to a control.
 */

export const LONG_PRESS_MS = 500
export const MOVE_SLOP = 10

export interface PressStart {
  x: number
  y: number
}

/** The finger moved far enough from where it went down that this is a scroll or a drag. */
export const movedTooFar = (from: PressStart, to: PressStart): boolean => Math.hypot(to.x - from.x, to.y - from.y) > MOVE_SLOP

/** Whether the click after this press is a tap (do the tap's thing) or the end of a hold (ignore it). */
export const isTap = (held: boolean): boolean => !held
