import { useSyncExternalStore } from 'react'
import { useFlag } from '@/hooks/useAppConfig'
import { semverOf } from '@/lib/flags'
import { type Release, unseenReleases, updateBanner } from '@/lib/whats-new'

/*
 * What this device last saw of What's new, in localStorage: the version whose What's new was
 * last opened (releases after it are marked New) and the version the update banner was last
 * closed on. A private window or blocked storage just means nothing is marked and no banner
 * shows. The first visit stores this version in both without marking anything: a new phone
 * isn't "updated".
 */

const SEEN = 'splitnow:whats-new-seen'
const BANNER = 'splitnow:whats-new-banner'
export const APP_SEMVER = semverOf(__APP_VERSION__)
const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') for (const k of [SEEN, BANNER]) if (read(k) === null) write(k, APP_SEMVER)

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Releases new since What's new was last opened here, the banner to show, and the two "done" marks. */
export function useWhatsNew(): { unseen: Release[]; banner: { version: string } | null; markSeen: () => void; closeBanner: () => void } {
  const flag = useFlag('whatsNew')
  const seen = useSyncExternalStore(
    subscribe,
    () => read(SEEN),
    () => null,
  )
  const shown = useSyncExternalStore(
    subscribe,
    () => read(BANNER),
    () => null,
  )
  return {
    unseen: unseenReleases({ current: APP_SEMVER, lastSeen: seen }),
    banner: updateBanner({ current: APP_SEMVER, lastSeen: shown, flag }),
    markSeen: () => write(SEEN, APP_SEMVER),
    closeBanner: () => write(BANNER, APP_SEMVER),
  }
}
