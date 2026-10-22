/*
 * When private groups lock again on this device (Settings → Encrypted groups, and a group's own
 * Private group sheet). Kept in this browser only: a phone and a laptop want different times, and
 * nothing here is secret. The admin's `tuning.vaultLockMinutes` is the default; a person's choice
 * for all groups replaces it, and a group's own choice replaces both for that group.
 */

/**
 * The idle times offered, in minutes. NEVER: no idle lock; the group still locks when the app is
 * closed, reloaded or restarted (keys live only in memory), and on leaving it if that's on. Shown as
 * "Only when the app closes", never as "Never", which would read as open even after a restart.
 */
export const NEVER = 0
export const LOCK_CHOICES = [1, 2, 5, 10, 15, 30, 60, NEVER] as const

export interface LockPrefs {
  /** minutes idle before every private group locks (unset: the admin's default) */
  minutes?: number
  /** a group's own minutes, by group id */
  groups?: Record<string, number>
  /** lock as soon as the app goes to the background (default on) */
  onLeave?: boolean
}

const KEY = 'sn-vault-lock'
const valid = (m: unknown): m is number => typeof m === 'number' && (LOCK_CHOICES as readonly number[]).includes(m)

/** What was stored, with anything unknown dropped (an old or hand-edited value never sets a strange time). */
export function parseLockPrefs(raw: string | null | undefined): LockPrefs {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, unknown>
    const groups = v.groups && typeof v.groups === 'object' ? Object.entries(v.groups as Record<string, unknown>).filter(([, m]) => valid(m)) : []
    return {
      ...(valid(v.minutes) ? { minutes: v.minutes } : {}),
      ...(groups.length ? { groups: Object.fromEntries(groups) as Record<string, number> } : {}),
      ...(v.onLeave === false ? { onLeave: false } : {}),
    }
  } catch {
    return {}
  }
}

export function readLockPrefs(store: Pick<Storage, 'getItem'> | undefined): LockPrefs {
  try {
    return parseLockPrefs(store?.getItem(KEY))
  } catch {
    return {}
  }
}

export function writeLockPrefs(store: Pick<Storage, 'setItem'> | undefined, p: LockPrefs): void {
  try {
    store?.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage off or full: the choice lasts until a reload */
  }
}

/** Minutes idle before this group locks (or, without a group, every group without its own choice); NEVER for none. */
export function lockMinutesFor(p: LockPrefs, groupId: string | undefined, adminDefault: number): number {
  const own = groupId ? p.groups?.[groupId] : undefined
  return own ?? p.minutes ?? adminDefault
}

/** A group's own choice set (minutes) or cleared (undefined), keeping the rest. */
export function withGroupMinutes(p: LockPrefs, groupId: string, minutes: number | undefined): LockPrefs {
  const { [groupId]: _old, ...rest } = p.groups ?? {}
  const groups = minutes === undefined ? rest : { ...rest, [groupId]: minutes }
  const { groups: _g, ...base } = p
  return Object.keys(groups).length ? { ...base, groups } : base
}

export const lockOnLeave = (p: LockPrefs): boolean => p.onLeave !== false

/** "5 min", "1 hour": the idle time in words. */
export const minutesWords = (m: number): string => (m === NEVER ? 'Only when the app closes' : m === 60 ? '1 hour' : `${m} min`)

/** The idle time in ms for the auto-lock: Infinity for NEVER. */
export const lockMs = (minutes: number): number => (minutes === NEVER ? Number.POSITIVE_INFINITY : minutes * 60_000)

/**
 * Which open groups are due to lock, and how long until the next one is: each locks once it has
 * been idle for its own time. Activity anywhere in the app counts for every group.
 */
export function dueToLock(
  open: readonly string[],
  lastActive: number,
  now: number,
  idleMs: (groupId: string) => number,
): { lock: string[]; nextIn: number | null } {
  const lock: string[] = []
  let nextIn: number | null = null
  for (const id of open) {
    const idle = idleMs(id)
    // Never: no idle lock for this group (closing the app, or leaving it if that's on, still locks it)
    if (!Number.isFinite(idle)) continue
    const left = lastActive + idle - now
    if (left <= 0) lock.push(id)
    else nextIn = nextIn === null ? left : Math.min(nextIn, left)
  }
  return { lock, nextIn }
}

/** A subtext in the app's three lengths (src/lib/look.ts HintSpec): full, one line, and how much it matters. */
interface LockHint {
  full: string
  short: string
  tier: 'key' | 'help'
}

/**
 * The lines under Auto-lock and Lock when I leave the app, for the person's current choices. They
 * follow the detail level like every subtext: help lines shorten in When needed and go in Minimal;
 * leaving the app with it off keeps groups open in front of anyone, so that line is a key one.
 */
export function lockHints(p: LockPrefs): { autoLock: LockHint; onLeave: LockHint; group: LockHint } {
  const never = p.minutes === NEVER
  return {
    autoLock: never
      ? {
          full: 'Idle time never locks private groups here. Closing, reloading or restarting the app does.',
          short: 'A restart always locks them.',
          tier: 'help',
        }
      : {
          full: 'How long private groups stay open here with no tap or scroll. Closing the app always locks them.',
          short: 'Without a tap, on this device.',
          tier: 'help',
        },
    onLeave: lockOnLeave(p)
      ? { full: 'Switching to another app, tab or window locks them at once. Best on for a phone.', short: 'Switching apps locks them.', tier: 'help' }
      : {
          full: 'Switching apps keeps them open, so anyone at this device can see them. Closing or reloading still locks them.',
          short: 'Switching apps keeps them open.',
          tier: 'key',
        },
    group: {
      full: 'How long this group stays open here when idle. Same as all follows Settings → Encrypted groups.',
      short: 'This group, on this device.',
      tier: 'help',
    },
  }
}
