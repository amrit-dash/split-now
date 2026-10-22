import { useCallback, useRef, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { peekShared, subscribeShared } from '@/data/store'
import type { SnapMeta, Unsub } from '@/data/repo'
import { EMPTY_HELP_PROGRESS, type HelpProgress } from '@/lib/help-progress'
import { useMe } from './auth'

/**
 * The Help sections the signed-in person finished (src/lib/help-progress.ts), one shared listener
 * for the session, the same on every device. Nothing done until it has loaded.
 */
export function useHelpProgressState(): HelpProgress {
  const { user } = useMe()
  const key = `help/${user.uid}`
  const startRef = useRef((cb: (v: HelpProgress, m?: SnapMeta) => void): Unsub => repo.watchHelpProgress(user.uid, cb))
  startRef.current = (cb) => repo.watchHelpProgress(user.uid, cb)
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeShared<HelpProgress>(
        key,
        (cb) => startRef.current(cb),
        () => onChange(),
      ),
    [key],
  )
  const read = useCallback(() => peekShared<HelpProgress>(key) ?? null, [key])
  return useSyncExternalStore(subscribe, read, read) ?? EMPTY_HELP_PROGRESS
}
