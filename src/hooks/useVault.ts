import { useSyncExternalStore } from 'react'
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
