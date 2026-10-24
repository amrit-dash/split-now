/*
 * A diagnostic for the owner's Android phone (24 Oct 2026): after a full-screen page (a Live table),
 * the tab bar sometimes sat higher, slid down and back, and Home scrolled sideways. Emulation never
 * shows it, so the phone reports what it measured to Admin → Logs (kind 'layout'): only when
 * something is off, a few times a session. Measurements only, never anything on the screen. Pure.
 */

export interface LayoutSample {
  /** the page now, and the one before it */
  route: string
  from?: string
  /** when it was measured: ms after the page changed, or 'resize' (Chrome resized the visible area) */
  when: string
  innerW: number
  innerH: number
  clientW: number
  scrollW: number
  /** the visible area (pinch zoom, the keyboard): size, zoom and where it sits on the page */
  vvW: number
  vvH: number
  vvScale: number
  vvLeft: number
  vvTop: number
  scrollX: number
  scrollY: number
  /** the tab bar's bottom edge and height, when the page has one */
  navBottom?: number
  navHeight?: number
  /** env(safe-area-inset-bottom) in px: Android's navigation bar as Chrome reports it */
  insetBottom: number
  /** the first element sticking out past the right edge (tag.class) */
  wide?: string
}

const r = (n: number) => Math.round(n * 10) / 10

/** What's off, as one line for Logs; null when the layout is as it should be. */
export function layoutProblem(s: LayoutSample): string | null {
  const off: string[] = []
  if (s.scrollW > s.clientW + 1) off.push('wide')
  // Chrome on Android widened the layout viewport to fit stray overflow (innerWidth past the page's
  // width): the zoom-out behind the owner's glitch, even where the overflow itself is clipped.
  if (s.innerW > s.clientW + 1) off.push('widened')
  if (Math.abs(s.vvScale - 1) > 0.02) off.push('zoomed')
  if (s.vvLeft > 1 || s.scrollX > 1) off.push('shifted')
  if (s.navBottom !== undefined && Math.abs(s.navBottom - s.innerH) > 2) off.push('nav-off-bottom')
  if (!off.length) return null
  const nav = s.navBottom !== undefined ? ` nav=${r(s.navBottom)}/${r(s.navHeight ?? 0)}` : ''
  return (
    `layout ${off.join('+')}: ${s.from ? `${s.from} → ` : ''}${s.route} @${s.when}` +
    ` | win=${s.innerW}x${s.innerH} client=${s.clientW} scroll=${s.scrollW}` +
    ` vv=${r(s.vvW)}x${r(s.vvH)}@${Math.round(s.vvScale * 100) / 100}+${r(s.vvLeft)},${r(s.vvTop)} at=${r(s.scrollX)},${r(s.scrollY)}` +
    `${nav} inset=${r(s.insetBottom)}${s.wide ? ` wide=${s.wide}` : ''}`
  ).slice(0, 500)
}
