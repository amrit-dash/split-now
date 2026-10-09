/**
 * The launch splash (index.html, and <Splash/> in App while sign-in is read): the logo pops in,
 * slides up, and the tagline comes in below it one line after the other. It runs on one clock
 * that starts with the page (window.__bootT0), so when React replaces the HTML copy the
 * animation carries on where it was instead of starting over.
 *
 * Holding the splash after the app is ready costs launch time, so it is only held when
 * opening the installed app (that's the app launch the splash is for), once per session, and
 * never with reduced motion. A browser tab or an invite link opens as soon as it can.
 */

/** ms from page start until the last tagline line has settled. */
export const SPLASH_MS = 1800

export function splashHoldMs({ elapsed, standalone, seen, reducedMotion }: { elapsed: number; standalone: boolean; seen: boolean; reducedMotion: boolean }) {
  if (!standalone || seen || reducedMotion) return 0
  return Math.max(0, Math.ceil(SPLASH_MS - elapsed))
}
