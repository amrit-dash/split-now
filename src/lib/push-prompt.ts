/*
 * "Turn on notifications": the card that asks for notifications once someone is using the app
 * (in a group) in the installed app, never on first launch and never in a browser tab, where the
 * install offer is the one thing asked (owner's call: not both at once). It shows on Home and at the
 * top of Settings; closing it in one place hides it there only. Allow is one tap; when notifications
 * were blocked it shows how to allow them in the phone's or the browser's own settings (no web app
 * can open those screens for you, nor ask again once blocked).
 */

/** What the card asks for on this device; null hides it. */
export type PushPromptStep = 'allow' | 'blocked'

export function pushPromptStep(s: {
  /** this build sends notifications at all (Firebase and a VAPID key; never the demo) */
  available: boolean
  /** running as the installed app (Home Screen, dock, app list) */
  standalone: boolean
  /** this browser can receive web push */
  supported: boolean
  perm: NotificationPermission | 'unsupported'
  /** in at least one group: the card waits until the app is in use */
  inGroup: boolean
}): PushPromptStep | null {
  if (!s.available || !s.inGroup || !s.standalone || !s.supported) return null
  return s.perm === 'default' ? 'allow' : s.perm === 'denied' ? 'blocked' : null
}

/** Which device's steps to show for unblocking: they live in different places. */
export type PushDevice = 'iphone' | 'android' | 'mac-safari' | 'firefox' | 'desktop'

export function pushDevice(ua: string, ios: boolean): PushDevice {
  if (ios) return 'iphone'
  if (/Android/i.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/(Chrome|Chromium|Edg|OPR)\//.test(ua)) return 'mac-safari'
  return 'desktop'
}

/** Where the card is; each place is closed on its own. */
export type PushPromptPlace = 'home' | 'settings'

/** The places closed on this device, from storage; anything unreadable counts as none. */
export function closedPlaces(raw: string | null): PushPromptPlace[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    return Array.isArray(v) ? v.filter((p): p is PushPromptPlace => p === 'home' || p === 'settings') : []
  } catch {
    return []
  }
}
