import type { VaultKey } from './vault-crypto'
import { dueToLock } from './vault-lock-prefs'

/*
 * The open private groups on this device: their keys live only in memory (never in storage, so a
 * reload, a closed app or a stolen backup is locked). A group locks again when the app goes to
 * the background (unless the person turned that off) or after its idle time (startAutoLock). Listeners hear every change, so
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

interface AutoLock {
  /** how long this group may sit idle (the person's or the group's own choice, src/lib/vault-lock-prefs.ts) */
  idleMs: (groupId: string) => number
  /** lock everything as soon as the app goes to the background */
  onLeave: () => boolean
}

let rules: AutoLock = { idleMs: () => DEFAULT_IDLE_MS, onLeave: () => true }
let lastActive = Date.now()
let timer: ReturnType<typeof setTimeout> | undefined

/** Locks the groups that have been idle long enough and waits for the next one (dueToLock, tested). */
function check() {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (!keys.size) return
  const { lock, nextIn } = dueToLock([...keys.keys()], lastActive, Date.now(), rules.idleMs)
  for (const id of lock) lockVault(id)
  if (nextIn !== null) timer = setTimeout(check, nextIn)
}

/** Activity: every open group's idle time starts again. */
export function touchVault() {
  lastActive = Date.now()
  check()
}

/** Settings changed (a lock time, Lock when I leave): applied to the groups open now. */
export function refreshAutoLock() {
  check()
}

/** Pointer moves come many times a second: one counts per second. */
const MOVE_EVERY_MS = 1000

/**
 * Lock on leaving the app (unless the person turned that off) and after each group's idle time.
 * `target` is the document: taps, clicks, pointer moves, the wheel, keys, typing and scrolling all
 * count as activity, so reading with a mouse on a laptop doesn't lock a group in front of someone.
 * Coming back to the app checks at once, since timers barely run in the background. Returns a cleanup.
 */
export function startAutoLock(
  target: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>,
  opts: Partial<AutoLock> = {},
): () => void {
  rules = { idleMs: opts.idleMs ?? (() => DEFAULT_IDLE_MS), onLeave: opts.onLeave ?? (() => true) }
  const visibility = () => {
    if (target.visibilityState === 'hidden') {
      if (rules.onLeave()) lockVault()
    } else check()
  }
  const active = () => {
    if (keys.size) touchVault()
  }
  const moved = () => {
    if (keys.size && Date.now() - lastActive >= MOVE_EVERY_MS) touchVault()
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'scroll', 'input', 'touchstart'] as const
  target.addEventListener('visibilitychange', visibility)
  target.addEventListener('pointermove', moved, { passive: true, capture: true } as AddEventListenerOptions)
  for (const e of events) target.addEventListener(e, active, { passive: true, capture: true } as AddEventListenerOptions)
  // the new rules apply to what's open now
  check()
  return () => {
    target.removeEventListener('visibilitychange', visibility)
    target.removeEventListener('pointermove', moved, { capture: true } as EventListenerOptions)
    for (const e of events) target.removeEventListener(e, active, { capture: true } as EventListenerOptions)
    if (timer) clearTimeout(timer)
    timer = undefined
  }
}
