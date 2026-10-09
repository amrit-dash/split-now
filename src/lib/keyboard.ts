/*
 * When the on-screen keyboard opens, mobile browsers scroll a focused field just far enough to
 * clear the keyboard, which leaves it pinned at the very bottom of what is still visible. These
 * helpers move it to the middle of the visible area instead (src/main.tsx installs the listener).
 */

export interface FieldBox {
  /** field top and bottom, in the same coordinates as `viewTop` (client px) */
  top: number
  bottom: number
  /** visible area: visualViewport.offsetTop / height, or 0 / innerHeight */
  viewTop: number
  viewHeight: number
}

/**
 * How far to scroll the page (positive = down) so the field sits around the middle of the visible
 * area; 0 when it is already comfortably inside the middle band (no needless jumps).
 */
export function fieldScrollDelta({ top, bottom, viewTop, viewHeight }: FieldBox): number {
  if (!(viewHeight > 0)) return 0
  const height = bottom - top
  const band = viewHeight * 0.2
  const insideBand = top >= viewTop + band && bottom <= viewTop + viewHeight - band
  if (insideBand) return 0
  // A field taller than the view: show its top just under the top edge.
  if (height >= viewHeight * 0.6) return Math.round(top - (viewTop + band / 2))
  const centre = top + height / 2
  return Math.round(centre - (viewTop + viewHeight / 2))
}

/** Text-entry elements the keyboard opens for (not checkboxes, buttons, ranges…). */
export function opensKeyboard(el: { tagName: string; type?: string; readOnly?: boolean; isContentEditable?: boolean } | null): boolean {
  if (!el || el.readOnly) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  return ['', 'text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes((el.type ?? '').toLowerCase())
}
