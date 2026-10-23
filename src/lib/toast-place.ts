/*
 * Where toasts sit while a sheet is open (owner, 24 Oct 2026): a sheet that takes half the screen
 * or less leaves room above it, so toasts float just over its top edge instead of covering its
 * buttons; a taller sheet leaves no such room, so they stay in their usual lane at the bottom.
 * Pure: src/components/Sheet.tsx measures, the .toast-stack rule in index.css moves them.
 */

/** Space between the sheet's top edge and the toast's bottom edge. */
export const TOAST_GAP = 12

/**
 * The toast lane's distance from the bottom of the screen, or null for the usual lane. `top` and
 * `height` are the sheet's laid-out box (not mid-slide), `viewport` the screen's height, in px.
 */
export function toastLift(sheet: { top: number; height: number }, viewport: number, gap = TOAST_GAP): number | null {
  if (!(viewport > 0) || !(sheet.height > 0) || sheet.height > viewport / 2) return null
  return Math.round(Math.max(0, viewport - sheet.top) + gap)
}

/** With sheets stacked (a confirm over a form), the one on top decides. */
export function topLift(lifts: ReadonlyArray<number | null>): number | null {
  return lifts.length ? lifts[lifts.length - 1] : null
}
