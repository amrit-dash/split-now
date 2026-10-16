import { useMemo, useSyncExternalStore } from 'react'
import type { Group } from '@/types'
import { useGroups } from '@/hooks/data'
import { withoutLocked } from '@/lib/vault-api'
import { isUnlocked, onVaultChange, vaultVersion } from '@/lib/vault-keys'

const subscribe = (cb: () => void) => onVaultChange(() => cb())

/** Whether a private group is open on this device right now (re-renders on unlock and lock). */
export function useVaultOpen(groupId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (groupId ? isUnlocked(groupId) : false),
    () => false,
  )
}

/** Changes whenever any private group opens or locks, for screens that ask about several. */
export function useVaultVersion(): number {
  return useSyncExternalStore(subscribe, vaultVersion, vaultVersion)
}

/** The groups to pick from (Add expense, Scan, captures, a live table): locked private groups left out. */
export function usePickableGroups(): Group[] | null {
  const groups = useGroups()
  const v = useVaultVersion()
  // biome-ignore lint/correctness/useExhaustiveDependencies: v stands for which groups are open, read through isUnlocked.
  return useMemo(() => (groups ? withoutLocked(groups, isUnlocked) : null), [groups, v])
}
