import { useSyncExternalStore } from 'react'
import { isUnlocked, onVaultChange } from '@/lib/vault-keys'

/** Whether a private group is open on this device right now (re-renders on unlock and lock). */
export function useVaultOpen(groupId: string | undefined): boolean {
  return useSyncExternalStore(
    (cb) => onVaultChange(() => cb()),
    () => (groupId ? isUnlocked(groupId) : false),
    () => false,
  )
}
