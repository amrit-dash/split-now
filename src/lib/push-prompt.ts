/*
 * "Turn on notifications": the card that asks for notifications once someone is using the app
 * (in a group), never on first launch. It shows on Home and at the top of Settings; closing it in
 * one place hides it there only. A tap opens step-by-step help for this device: add to the Home
 * Screen first on an iPhone browser tab, one Allow when the browser can ask, or how to unblock them
 * in the phone's or the browser's own settings when they were blocked (no web app can open those
 * screens for you, nor ask again once blocked).
 */

/** What the card asks for on this device; null hides it. */
export type PushPromptStep = 'install' | 'allow' | 'blocked'

export function pushPromptStep(s: {
  /** this build sends notifications at all (Firebase and a VAPID key; never the demo) */
  available: boolean
  ios: boolean
  standalone: boolean
  /** this browser can receive web push */
  supported: boolean
  perm: NotificationPermission | 'unsupported'
  /** in at least one group: the card waits until the app is in use */
  inGroup: boolean
}): PushPromptStep | null {
  if (!s.available || !s.inGroup) return null
  if (s.ios && !s.standalone) return 'install'
  if (!s.supported) return null
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
