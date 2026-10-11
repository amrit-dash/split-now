import { useCallback, useRef, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { peekShared, subscribeShared } from '@/data/store'
import type { SnapMeta, Unsub } from '@/data/repo'
import { EMPTY_INBOX_STATE, type InboxState } from '@/lib/inbox'
import { useMe } from './auth'

/**
 * What the signed-in person cleared from Inbox → Updates (src/lib/inbox.ts), one shared listener
 * for the session, the same on every device. Nothing cleared until it has loaded.
 */
export function useInboxState(): InboxState {
  const { user } = useMe()
  const key = `inbox/${user.uid}`
  const startRef = useRef((cb: (v: InboxState, m?: SnapMeta) => void): Unsub => repo.watchInboxState(user.uid, cb))
  startRef.current = (cb) => repo.watchInboxState(user.uid, cb)
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeShared<InboxState>(
        key,
        (cb) => startRef.current(cb),
        () => onChange(),
      ),
    [key],
  )
  const read = useCallback(() => peekShared<InboxState>(key) ?? null, [key])
  return useSyncExternalStore(subscribe, read, read) ?? EMPTY_INBOX_STATE
}
