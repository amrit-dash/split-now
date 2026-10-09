import { useCallback, useRef, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { peekShared, subscribeShared } from '@/data/store'
import type { SnapMeta, Unsub } from '@/data/repo'
import { EMPTY_MEMORY, type MerchantMemory } from '@/lib/merchants'
import { useMe } from './auth'

/**
 * The signed-in user's merchant → category memory (src/lib/merchants.ts), one shared listener
 * for the whole session. Empty until the document has loaded or when there is none, so callers
 * never wait on it: the keyword guess covers the first paint.
 */
export function useMerchantMemory(): MerchantMemory {
  const { user } = useMe()
  const key = `merchants/${user.uid}`
  const startRef = useRef((cb: (v: MerchantMemory | null, m?: SnapMeta) => void): Unsub => repo.watchMerchants(user.uid, cb))
  startRef.current = (cb) => repo.watchMerchants(user.uid, cb)
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeShared<MerchantMemory | null>(
        key,
        (cb) => startRef.current(cb),
        () => onChange(),
      ),
    [key],
  )
  const read = useCallback(() => peekShared<MerchantMemory | null>(key) ?? null, [key])
  return useSyncExternalStore(subscribe, read, read) ?? EMPTY_MEMORY
}
