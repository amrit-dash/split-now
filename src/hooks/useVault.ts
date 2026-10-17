import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { repo } from '@/data'
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

/**
 * What an <img> shows for a stored photo (repo.photoUrl): its URL, or for a private group's the
 * photo opened on the phone; null while it loads or can't be shown. Reads again when the group
 * opens or locks.
 */
export function usePhotoUrl(groupId: string | undefined, photo: { path?: string; url?: string } | undefined): string | null {
  const v = useVaultVersion()
  const [url, setUrl] = useState<string | null>(null)
  const path = photo?.path
  const plain = photo?.url
  // biome-ignore lint/correctness/useExhaustiveDependencies: v stands for which groups are open.
  useEffect(() => {
    if (!groupId || (!path && !plain)) return setUrl(null)
    let live = true
    repo
      .photoUrl(groupId, { path, url: plain })
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null))
    return () => {
      live = false
    }
  }, [groupId, path, plain, v])
  return url
}

/** Several stored photos at once (an expense's receipt and attached photos), each as usePhotoUrl opens it; null while one opens. */
export function usePhotoUrls(groupId: string | undefined, photos: Array<{ path?: string; url?: string }>): Array<string | null> {
  const v = useVaultVersion()
  const key = photos.map((p) => p.path ?? p.url ?? '').join('|')
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the photos, v for which groups are open.
  useEffect(() => {
    if (!groupId || !photos.length) return setUrls({})
    let live = true
    void Promise.all(
      photos.map((p) =>
        repo
          .photoUrl(groupId, { path: p.path, url: p.url })
          .then((u) => [p.path ?? p.url ?? '', u] as const)
          .catch(() => [p.path ?? p.url ?? '', null] as const),
      ),
    ).then((pairs) => live && setUrls(Object.fromEntries(pairs)))
    return () => {
      live = false
    }
  }, [groupId, key, v])
  return photos.map((p) => urls[p.path ?? p.url ?? ''] ?? null)
}
