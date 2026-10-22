/*
 * Where the "Updated to x.y.z · What's new" banner may show. After an update from Profile the app
 * reloads on the screen it was on, so the banner can't wait for Home: it rises on whatever screen
 * the app lands on, as long as that screen has the tab bar (the banner sits in the floating lane
 * just above it, where the New version banner shows). Screens without the tab bar (Add expense,
 * Settle up, chat, Scan, a live table) and the tab-bar screens that are a form with their own
 * button or save bar at the bottom (New group, Edit group, Import, the admin console) make it
 * wait: it shows on the next screen that has room, a second after that screen opens. News is
 * never worth covering what someone came to do.
 */

/** Tab-bar screens that are forms: their main action or save bar sits where the banner would. */
const FORM_SCREENS = [/^\/groups\/new\/?$/, /^\/groups\/import\/?$/, /^\/groups\/[^/]+\/edit\/?$/, /^\/admin(\/|$)/]

export function whatsNewMayShow(o: { pathname: string; hasNav: boolean }): boolean {
  if (!o.hasNav) return false
  return !FORM_SCREENS.some((re) => re.test(o.pathname))
}
