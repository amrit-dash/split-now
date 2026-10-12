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

/** What we need of the focused element to tell whether it brings up the keyboard. */
export interface FocusedLike {
  tagName: string
  type?: string
  isContentEditable?: boolean
  readOnly?: boolean
}

/** Inputs that never bring up a text keyboard. */
const NO_KEYBOARD = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

/** Whether focus on this element means the on-screen keyboard can be up. */
export function opensKeyboard(el: FocusedLike | null | undefined): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA') return !el.readOnly
  if (tag === 'INPUT') return !el.readOnly && !NO_KEYBOARD.has((el.type ?? 'text').toLowerCase())
  return false
}

/**
 * The chat's box on screen while the keyboard may be up: as tall as what is visible and moved down
 * by however far the browser panned (iOS pans the page instead of resizing it). null means fill the
 * screen (pinned top and bottom with CSS), which is what it does whenever nothing is being typed:
 * iOS can keep reporting the keyboard-sized viewport after the keyboard closes (most often in the
 * installed app), and a box sized from that left the message box floating mid-screen.
 */
export function chatViewportBox(vv: ViewportLike | null | undefined, innerHeight: number, typing: boolean): { height: number; top: number } | null {
  if (!typing || !vv || !(vv.height > 0)) return null
  const height = Math.round(vv.height)
  const top = Math.max(0, Math.round(vv.offsetTop))
  // Nothing taken from the screen (a hardware keyboard, desktop): fill it like when not typing.
  if (height >= innerHeight - 1 && top === 0) return null
  return { height, top }
}

/*
 * The installed app on iPhone (WebKit bug 297779 and its standalone cousin): the first time the
 * keyboard opens, iOS shrinks the app's height (innerHeight, the visual viewport, 100dvh) and does
 * not give it back after the keyboard closes. Everything pinned to the bottom then sits higher and
 * the page's background shows as a dead band under it, on every screen, until the app is
 * force-quit. Hiding and re-showing the page makes WebKit measure the screen again
 * (useViewportHeal); these decide when.
 */

/** The tallest height seen at each width (rounded): the app's real height, kept apart per orientation. */
export function tallestHeights(seen: Readonly<Record<number, number>>, width: number, height: number): Record<number, number> {
  const w = Math.round(width)
  return height > (seen[w] ?? 0) ? { ...seen, [w]: height } : (seen as Record<number, number>)
}

/**
 * Whether the app has lost height it should have back: nothing being typed (the keyboard has gone)
 * and more than a few pixels short of the tallest it has been at this width. tried is the height a
 * re-measure was already tried at, so a re-measure that does not help is not repeated on every focus.
 */
export function needsHeal(height: number, tallest: number | undefined, typing: boolean, tried?: number): boolean {
  if (typing || tallest === undefined || height === tried) return false
  return tallest - height > 4
}
