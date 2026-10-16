import { openDeep } from './vault-crypto'
import { getVaultKey, onVaultChange } from './vault-keys'

/*
 * Reading a private group (docs/VAULT.md): every live query of a group passes through
 * openedWatch, which opens the tokens in its documents with the group's key, or shows them as
 * locked, and reads them again whenever the group opens or locks. Documents without a token pass
 * straight through, so ordinary groups cost one string scan per snapshot. Opened text is cached
 * per group only while it is open; locking forgets it.
 */

export const LOCKED_TEXT = '🔒'

type Watch<T, M> = (cb: (v: T, m?: M) => void) => () => void

const caches = new Map<string, Map<string, string>>()
onVaultChange((g) => {
  if (g === null) caches.clear()
  else if (!getVaultKey(g)) caches.delete(g)
})

function cacheFor(groupId: string): Map<string, string> {
  let c = caches.get(groupId)
  if (!c) caches.set(groupId, (c = new Map()))
  return c
}

/** Whether anything in `v` looks like a token (a cheap scan before the real work). */
export const mayHaveTokens = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  try {
    return JSON.stringify(v).includes('v1:')
  } catch {
    return false
  }
}

/** One value opened now: for reads that aren't live (older chat, older activity). */
export async function openOnce<T>(groupId: string, v: T): Promise<T> {
  if (!mayHaveTokens(v)) return v
  const k = getVaultKey(groupId)
  return openDeep(v, k, LOCKED_TEXT, k ? cacheFor(groupId) : undefined)
}

/** A live query of `groupId` with its tokens opened (or locked), re-read when the group opens or locks. */
export function openedWatch<T, M>(groupId: string, watch: Watch<T, M>): Watch<T, M> {
  return (cb) => {
    let last: { v: T; m?: M } | null = null
    let seq = 0
    const emit = () => {
      if (!last) return
      const { v, m } = last
      const mine = ++seq
      if (!mayHaveTokens(v)) {
        cb(v, m)
        return
      }
      void openOnce(groupId, v).then((o) => {
        if (mine === seq) cb(o, m)
      })
    }
    const unsub = watch((v, m) => {
      last = { v, m }
      emit()
    })
    const off = onVaultChange((g) => {
      if (g === null || g === groupId) emit()
    })
    return () => {
      seq++
      unsub()
      off()
    }
  }
}
