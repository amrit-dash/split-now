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
 * keyboard opens, iOS gives the app less screen (innerHeight, the visual viewport, 100dvh) and can
 * keep it that way after the keyboard closes: a strip at the bottom where nothing of the app is
 * drawn, so things pinned to the bottom sit above a dark band (and anything moved into the strip is
 * cut off). iOS gives it back on a finger scroll of the page; nothing the app does reliably does, so
 * the strip is coloured like the bar above it (index.css html[data-nav], html[data-chat]).
 */

/** The tallest height seen at each width (rounded): the app's real height, kept apart per orientation. */
export function tallestHeights(seen: Readonly<Record<number, number>>, width: number, height: number): Record<number, number> {
  const w = Math.round(width)
  return height > (seen[w] ?? 0) ? { ...seen, [w]: height } : (seen as Record<number, number>)
}

/** What we need of the screen: iOS gives it in portrait whatever the orientation. */
export interface SizeLike {
  width: number
  height: number
}

/**
 * How much shorter iOS says the installed app is than the screen it fills, with nothing being typed
 * (0 when it is not). The installed app always fills the whole screen, so the screen's own size says
 * when iOS has kept some of it (the screen measurements show it, useViewportStats). Only when the app is the
 * full screen wide (not an iPad split view or window) and short by a believable amount.
 */
export function missingHeight(inner: SizeLike, screen: SizeLike, typing: boolean): number {
  if (typing) return 0
  const landscape = inner.width > inner.height
  const long = Math.max(screen.width, screen.height)
  const short = Math.min(screen.width, screen.height)
  const fullWidth = landscape ? long : short
  const fullHeight = landscape ? short : long
  if (Math.abs(inner.width - fullWidth) > 1) return 0
  const missing = Math.round(fullHeight - inner.height)
  return missing > 1 && missing <= 120 ? missing : 0
}

/** Five taps within three seconds turn the screen measurements on or off (Profile's version line). */
export function tapsToToggle(taps: readonly number[], now: number): { taps: number[]; toggle: boolean } {
  const recent = [...taps.filter((t) => now - t < 3000), now]
  return recent.length >= 5 ? { taps: [], toggle: true } : { taps: recent, toggle: false }
}
