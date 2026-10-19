import { useEffect, useState } from 'react'
import { repo } from '@/data'
import type { Group } from '@/types'
import type { VaultStatus } from '@/lib/vault-api'

/*
 * Who in an open private group can't open it yet (docs/VAULT.md "Someone with no way in"): the
 * server's `status` for the group, asked once per group and set of people while the app runs, and
 * again when someone joins or leaves however they came in (added, let in, linked by email, there
 * from the start, or there when it was made private). The Private group sheet clears it after a
 * pattern change.
 */

type Answer = { hasPattern: boolean; noUniversal: string[] }
const known = new Map<string, Answer>()
const listeners = new Set<() => void>()

/** After its own pattern is set or removed: ask again. */
export function forgetWaiting(groupId: string) {
  for (const k of [...known.keys()]) if (k.startsWith(`${groupId}|`)) known.delete(k)
  for (const l of listeners) l()
}

export function useVaultWaiting(group: Pick<Group, 'id' | 'vault' | 'memberUids'>, open: boolean): Answer | null {
  const key = `${group.id}|${[...(group.memberUids ?? [])].sort().join(',')}`
  // bumped by forgetWaiting (ask again) and when an answer arrives (show it)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const l = () => setVersion((v) => v + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  // Alone in it: nobody to wait for.
  const others = (group.memberUids ?? []).length > 1
  // biome-ignore lint/correctness/useExhaustiveDependencies: version asks again after forgetWaiting.
  useEffect(() => {
    if (!group.vault || !open || !others || known.has(key)) return
    let live = true
    repo
      .vault<VaultStatus>({ op: 'status', groupId: group.id })
      .then((s) => {
        known.set(key, { hasPattern: !!s.group?.hasPattern, noUniversal: s.group?.noUniversal ?? [] })
        if (live) setVersion((v) => v + 1)
      })
      // Offline or refused: no card, asked again next time.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key, group.vault, group.id, open, others, version])
  return known.get(key) ?? null
}
