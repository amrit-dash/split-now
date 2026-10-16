/*
 * The vault callable's steps and answers (functions/src/vault.ts), shared by both repos, Settings →
 * Encrypted groups and the unlock sheet. Pure types, the pattern rules and the error reading; no Firebase.
 */

export type VaultRequest =
  | { op: 'status'; groupId?: string }
  | { op: 'passkeyOptions'; purpose: 'register' | 'auth' }
  | { op: 'passkeyRegister'; response: unknown }
  | { op: 'setUniversal'; pattern: string; ordered: boolean; auth?: unknown }
  | { op: 'unlockStart'; pattern: string; groupId?: string }
  | { op: 'unlockFinish'; auth?: unknown; register?: unknown }
  | { op: 'groupPattern'; groupId: string; pattern: string | null; ordered: boolean; auth?: unknown }
  | { op: 'create'; groupId: string }

export interface VaultStatus {
  /** the server can make and open keys (VAULT_KEK is set) */
  serverReady: boolean
  hasPasskey: boolean
  /** a universal pattern is set */
  universal: boolean
  /** it follows its sequence (false: only the counts matter) */
  ordered?: boolean
  triesLeft: number
  lockedUntil?: number
  group?: { keyReady: boolean; hasPattern: boolean; ordered?: boolean }
}

export interface PasskeyOptions {
  /** WebAuthn options JSON, passed to @simplewebauthn/browser as is */
  options: unknown
  hasPasskey: boolean
}

/** A right pattern: the passkey step's options (register: this site has no passkey for the person yet). Demo mode answers with the keys. */
export interface UnlockStarted {
  options?: unknown
  register?: boolean
  keys?: Record<string, string>
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

/** Why a universal pattern can't be used yet (null when it can); the same rule as functions/src/lib/vault-core.ts. */
export function patternProblem(p: string): string | null {
  if (p.length < PATTERN_MIN) return `Use at least ${PATTERN_MIN} taps and long presses.`
  if (p.length > PATTERN_MAX) return `Use at most ${PATTERN_MAX}.`
  if (!/^[TL]+$/.test(p)) return 'Only taps and long presses.'
  if (!p.includes('T') || !p.includes('L')) return 'Mix taps and long presses.'
  return null
}

/** A group's own pattern: any length up to 32. */
export function groupPatternProblem(p: string): string | null {
  if (!p.length) return 'Tap or long-press at least once.'
  if (p.length > PATTERN_MAX) return `Use at most ${PATTERN_MAX}.`
  return /^[TL]+$/.test(p) ? null : 'Only taps and long presses.'
}

/** How long a press must last to count as a long press. */
export const LONG_PRESS_MS = 450

/** A press of `ms` as a step. */
export const stepOf = (ms: number): Step => (ms >= LONG_PRESS_MS ? 'L' : 'T')

/** The blind pad sends the pattern after this long without a press. */
export const PATTERN_PAUSE_MS = 1500

/** A buzz per press on the blind pad, so it can be felt rather than seen: short for a tap, longer for a long press. */
export const buzzFor = (s: Step): number => (s === 'L' ? 40 : 12)

/** "in 12 minutes" / "in 2 hours" for a lockout's end. */
export function untilWords(until: number, now: number): string {
  const min = Math.max(1, Math.ceil((until - now) / 60_000))
  if (min < 60) return `in ${min} minute${min === 1 ? '' : 's'}`
  const h = Math.ceil(min / 60)
  return `in ${h} hour${h === 1 ? '' : 's'}`
}

/** What the unlock sheet says after a refused pattern. */
export function refusalWords(r: VaultRefusal, now: number, fallback: string): string {
  if (r.lockedUntil && r.lockedUntil > now) return `Too many wrong patterns. Try again ${untilWords(r.lockedUntil, now)}.`
  if (r.triesLeft !== undefined) return `That’s not it. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`
  return fallback
}

/** What the unlock sheet offers, from the status: in a group, its own pattern counts too. */
export type UnlockMode = 'loading' | 'setup' | 'unlock' | 'lockedOut' | 'unavailable'

export function unlockMode(status: VaultStatus | null | undefined, now: number, error?: boolean): UnlockMode {
  if (error) return 'unavailable'
  if (!status) return 'loading'
  if (!status.serverReady) return 'unavailable'
  if (status.lockedUntil && now < status.lockedUntil) return 'lockedOut'
  return status.universal || status.group?.hasPattern ? 'unlock' : 'setup'
}

/** The status card's three lines in Settings → Encrypted groups. */
export function setupLines(s: VaultStatus): { passkey: string; pattern: string; server: string; ready: boolean } {
  return {
    passkey: s.hasPasskey ? 'Passkey added' : 'No passkey on this site yet',
    pattern: s.universal ? `Universal pattern set · ${s.ordered === false ? 'any order' : 'in order'}` : 'No universal pattern yet',
    server: s.serverReady ? 'Server key ready' : 'The server isn’t set up for private groups yet',
    ready: s.hasPasskey && s.universal && s.serverReady,
  }
}

/**
 * The Groups screen's lock button: none without private groups; "unlock" while any is locked
 * (the universal pattern opens them all); "lock" once all are open (locks them all at once).
 */
export function lockButton(privateIds: readonly string[], isOpen: (id: string) => boolean): 'none' | 'unlock' | 'lock' {
  if (!privateIds.length) return 'none'
  return privateIds.every(isOpen) ? 'lock' : 'unlock'
}
