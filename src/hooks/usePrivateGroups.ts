import { useEffect, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useFlag } from '@/hooks/useAppConfig'
import { type KnownStatus, privateOffered, privateOn, statusCheckWanted, type VaultStatus } from '@/lib/vault-api'

/*
 * Whether private groups are on for the signed-in person (docs/VAULT.md). They start off and are
 * turned on in Settings → Encrypted groups; the profile's privateGroupsOn / privateGroupsOff,
 * written by the server, say which. Someone from before that has no privateGroupsOn yet, so this
 * device asks the server once (vault op `status`, which marks them on when they have a universal
 * pattern or made a private group): its answer counts at once, and the profile follows.
 */

const CHECKED = 'sn-vault-checked'
let known: { uid: string; s: KnownStatus } | null = null
const listeners = new Set<() => void>()
const asked = new Set<string>()

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const setKnown = (v: typeof known) => {
  known = v
  for (const l of listeners) l()
}

function checkedHere(uid: string): boolean {
  if (asked.has(uid)) return true
  try {
    return localStorage.getItem(`${CHECKED}:${uid}`) === '1'
  } catch {
    return false
  }
}

function markChecked(uid: string) {
  asked.add(uid)
  try {
    localStorage.setItem(`${CHECKED}:${uid}`, '1')
  } catch {
    /* private window: asked again next time, which is harmless */
  }
}

/** After Settings turns private groups on or off: the profile says so from then on. */
export const forgetPrivateStatus = () => setKnown(null)

export function usePrivateGroups(): { on: boolean; offered: boolean; stopped: boolean; flagOn: boolean } {
  const flagOn = useFlag('vaults')
  const { user, profile } = useMe()
  const k = useSyncExternalStore(
    subscribe,
    () => known,
    () => null,
  )
  const mine = k?.uid === user.uid ? k.s : null
  const wanted = statusCheckWanted(flagOn, profile, checkedHere(user.uid))
  useEffect(() => {
    if (!wanted) return
    // Marked first, so several screens mounting together ask once.
    asked.add(user.uid)
    repo
      .vault<VaultStatus>({ op: 'status' })
      .then((s) => {
        markChecked(user.uid)
        setKnown({ uid: user.uid, s: { on: s.on, off: s.off, universal: s.universal } })
      })
      // Offline or the server: asked again on the next open.
      .catch(() => asked.delete(user.uid))
  }, [wanted, user.uid])
  return {
    flagOn,
    on: privateOn(profile, mine),
    offered: privateOffered(flagOn, profile, mine),
    stopped: !!profile.privateGroupsOff,
  }
}
