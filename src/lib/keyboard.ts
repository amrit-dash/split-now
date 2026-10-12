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
