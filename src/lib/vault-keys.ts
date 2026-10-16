import type { VaultKey } from './vault-crypto'

/*
 * The open private groups on this device: their keys live only in memory (never in storage, so a
 * reload, a closed app or a stolen backup is locked). A group locks again when the app goes to
 * the background or after `idleMs` without a tap (startAutoLock). Listeners hear every change, so
 * the live queries (hooks/data.ts) re-read their documents with or without the key.
 */

type Listener = (groupId: string | null) => void

const keys = new Map<string, VaultKey>()
const listeners = new Set<Listener>()

let version = 0

function emit(groupId: string | null) {
  version++
  for (const l of listeners) l(groupId)
}

/** Changes whenever any group opens or locks (for useSyncExternalStore). */
export const vaultVersion = (): number => version

export const getVaultKey = (groupId: string): VaultKey | null => keys.get(groupId) ?? null
export const isUnlocked = (groupId: string): boolean => keys.has(groupId)

export function setVaultKey(k: VaultKey) {
  keys.set(k.groupId, k)
  touchVault()
  emit(k.groupId)
}

/** Lock one group, or every group. */
export function lockVault(groupId?: string) {
  if (groupId === undefined) {
    if (!keys.size) return
    keys.clear()
    emit(null)
    return
  }
  if (keys.delete(groupId)) emit(groupId)
}

/** Hear a group open or lock (null: every group locked). */
export function onVaultChange(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---- auto-lock ----------------------------------------------------------------------------

export const DEFAULT_IDLE_MS = 5 * 60_000
let idleMs = DEFAULT_IDLE_MS
let timer: ReturnType<typeof setTimeout> | undefined

/** Activity: restarts the idle timer while a group is open. */
export function touchVault() {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (keys.size) timer = setTimeout(() => lockVault(), idleMs)
}

/**
 * Lock on leaving the app and after `ms` idle. `target` is the document in the app (taps,
 * keys, scrolls count as activity); returns a cleanup.
 */
export function startAutoLock(target: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>, ms = DEFAULT_IDLE_MS): () => void {
  idleMs = ms
  const hidden = () => {
    if (target.visibilityState === 'hidden') lockVault()
  }
  const active = () => {
    if (keys.size) touchVault()
  }
  const events = ['pointerdown', 'keydown', 'scroll'] as const
  target.addEventListener('visibilitychange', hidden)
  for (const e of events) target.addEventListener(e, active, { passive: true, capture: true } as AddEventListenerOptions)
  return () => {
    target.removeEventListener('visibilitychange', hidden)
    for (const e of events) target.removeEventListener(e, active, { capture: true } as EventListenerOptions)
    if (timer) clearTimeout(timer)
    timer = undefined
  }
}
