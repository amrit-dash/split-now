/*
 * The on-screen keyboard. The app leaves the browser's own behaviour alone everywhere: the focused
 * field is scrolled just into view above the keyboard, and nothing else moves (an earlier "centre
 * the field" scroll moved the page under sheets and the chat, and could push the field out of view).
 *
 * The full-screen chat is the exception: its header and message box must stay put while only the
 * messages scroll, so it pins itself to the visible area (the visual viewport, which shrinks and
 * moves when the keyboard opens) with chatViewportBox.
 */

export interface ViewportLike {
  height: number
  offsetTop: number
}

/**
 * The chat's box on screen: as tall as what is visible and moved down by however far the browser
 * panned (iOS pans the page instead of resizing it). Without a visual viewport, the full height.
 */
export function chatViewportBox(vv: ViewportLike | null | undefined, innerHeight: number): { height: number; top: number } {
  if (!vv || !(vv.height > 0)) return { height: innerHeight, top: 0 }
  return { height: Math.round(vv.height), top: Math.max(0, Math.round(vv.offsetTop)) }
}
