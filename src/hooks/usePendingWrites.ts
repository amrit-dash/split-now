import { useEffect, useState } from 'react'
import { repo } from '@/data'

/**
 * Saves the server hasn't confirmed yet, and since when there have been any (0 while in sync), so
 * a screen can tell a quick sync from a slow one (src/lib/sync.ts).
 */
export function usePendingWrites(): { pending: number; since: number } {
  const [state, setState] = useState({ pending: 0, since: 0 })
  useEffect(
    () =>
      repo.watchPendingWrites((pending) =>
        setState((s) => (pending === 0 ? { pending: 0, since: 0 } : { pending, since: s.pending === 0 ? Date.now() : s.since })),
      ),
    [],
  )
  return state
}
