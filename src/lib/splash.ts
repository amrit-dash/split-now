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

/**
 * ms from page start until the splash starts to fade (300 ms, App.tsx): the last tagline line
 * starts at 1300 ms and is nearly in place by 1400 ms, so it settles during the fade. It was
 * 1800 (fully settled, then the fade): measured on a mid phone profile, the app is ready about
 * 1 s in, so every installed launch waited another 1.4 s behind the splash; this takes 0.4 s off.
 */
export const SPLASH_MS = 1400

export function splashHoldMs({ elapsed, standalone, seen, reducedMotion }: { elapsed: number; standalone: boolean; seen: boolean; reducedMotion: boolean }) {
  if (!standalone || seen || reducedMotion) return 0
  return Math.max(0, Math.ceil(SPLASH_MS - elapsed))
}
