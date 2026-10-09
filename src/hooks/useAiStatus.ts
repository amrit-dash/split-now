import { useSyncExternalStore } from 'react'
import { repo } from '@/data'
import type { AiStatusResult } from '@/data/repo'

/*
 * AI status (admin flag, shared-key availability) fetched once per sign-in and kept for the
 * session, so Profile renders the AI and admin sections straight away. The last answer is also
 * kept in localStorage per user for an instant first paint after a reload; it is re-checked in
 * the background. `refreshAiStatus()` after anything that changes it (admin key or settings).
 */
type State = { uid: string | null; value: AiStatusResult | null | undefined }
let state: State = { uid: null, value: undefined }
let inflight: Promise<void> | null = null
const subs = new Set<() => void>()
const emit = () => {
  for (const f of subs) f()
}
const storeKey = (uid: string) => `splitit-ai-status:${uid}`

function read(uid: string): AiStatusResult | undefined {
  try {
    const v = localStorage.getItem(storeKey(uid))
    return v ? (JSON.parse(v) as AiStatusResult) : undefined
  } catch {
    return undefined
  }
}

export function refreshAiStatus(uid = state.uid): Promise<void> {
  if (!uid || repo.mode !== 'firebase') return Promise.resolve()
  if (inflight && state.uid === uid) return inflight
  inflight = repo
    .aiStatus()
    .then((v) => {
      if (state.uid !== uid) return
      // A failed check (offline) keeps what we had rather than hiding the sections.
      state = { uid, value: v ?? state.value ?? null }
      try {
        if (v) localStorage.setItem(storeKey(uid), JSON.stringify(v))
      } catch {
        /* private mode */
      }
      emit()
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Called on sign-in / sign-out (App). */
export function primeAiStatus(uid: string | null) {
  if (uid === state.uid) return
  state = { uid, value: uid ? read(uid) : undefined }
  inflight = null
  emit()
  if (uid) void refreshAiStatus(uid)
}

/** undefined while the first check runs, null if it can't be checked. */
export function useAiStatus(): AiStatusResult | null | undefined {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state.value,
  )
}
