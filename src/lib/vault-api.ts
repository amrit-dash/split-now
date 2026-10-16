/*
 * The vault callable's steps and answers (functions/src/vault.ts), shared by both repos and the
 * unlock screen. Pure types and the error reading; no Firebase.
 */

export type VaultRequest =
  | { op: 'status'; groupId: string }
  | { op: 'passkeyOptions'; purpose: 'register' | 'auth' }
  | { op: 'passkeyRegister'; response: unknown }
  | { op: 'setup'; groupId: string; pattern: string; auth?: unknown }
  | { op: 'unlock'; groupId: string; pattern: string; auth?: unknown }
  | { op: 'changePattern'; groupId: string; pattern: string; next: string; auth?: unknown }

export interface VaultStatus {
  setUp: boolean
  hasPasskey: boolean
  triesLeft: number
  lockedUntil?: number
}

export interface PasskeyOptions {
  /** WebAuthn options JSON, passed to @simplewebauthn/browser as is */
  options: unknown
  hasPasskey: boolean
}

/** What a refused unlock carries (HttpsError details). */
export interface VaultRefusal {
  triesLeft?: number
  lockedUntil?: number
}

export const vaultRefusal = (e: unknown): VaultRefusal => {
  const d = (e as { details?: unknown })?.details
  if (!d || typeof d !== 'object') return {}
  const { triesLeft, lockedUntil } = d as Record<string, unknown>
  return {
    ...(typeof triesLeft === 'number' ? { triesLeft } : {}),
    ...(typeof lockedUntil === 'number' ? { lockedUntil } : {}),
  }
}

/** The pattern as the server takes it: T for a tap, L for a long press. */
export type Step = 'T' | 'L'
export const PATTERN_MIN = 6
export const PATTERN_MAX = 32

/** Why a pattern can't be used yet (null when it can); the same rule as functions/src/lib/vault-core.ts. */
export function patternProblem(p: string): string | null {
  if (p.length < PATTERN_MIN) return `Use at least ${PATTERN_MIN} taps and long presses.`
  if (p.length > PATTERN_MAX) return `Use at most ${PATTERN_MAX}.`
  if (!/^[TL]+$/.test(p)) return 'Only taps and long presses.'
  if (!p.includes('T') || !p.includes('L')) return 'Mix taps and long presses.'
  return null
}

/** How long a press must last to count as a long press. */
export const LONG_PRESS_MS = 450

/** A press of `ms` as a step. */
export const stepOf = (ms: number): Step => (ms >= LONG_PRESS_MS ? 'L' : 'T')

/** What the lock screen shows for a group (status from the vault callable). */
export type LockMode = 'loading' | 'setup' | 'unlock' | 'lockedOut' | 'unavailable'

export function lockMode(status: VaultStatus | null | undefined, now: number, error?: boolean): LockMode {
  if (error) return 'unavailable'
  if (!status) return 'loading'
  if (status.lockedUntil && now < status.lockedUntil) return 'lockedOut'
  return status.setUp ? 'unlock' : 'setup'
}

/** "in 12 minutes" / "in 2 hours" for a lockout's end. */
export function untilWords(until: number, now: number): string {
  const min = Math.max(1, Math.ceil((until - now) / 60_000))
  if (min < 60) return `in ${min} minute${min === 1 ? '' : 's'}`
  const h = Math.ceil(min / 60)
  return `in ${h} hour${h === 1 ? '' : 's'}`
}
