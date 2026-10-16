import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { seal, unseal, type Sealed } from './seal'

/*
 * Private groups (docs/VAULT.md): each group has its own random 256-bit data key (DEK). Phones
 * encrypt the group's words and photos with it; the server never stores it in the clear. It is
 * kept sealed with the VAULT_KEK secret (AES-256-GCM, the same envelope as the AI keys in
 * seal.ts) in vaultKeys/{groupId}, which no client can read, and handed to a member only after
 * a pattern (the person's universal one, or the group's own) and a passkey check pass
 * (functions/src/vault.ts).
 *
 * The pattern is never stored: only an scrypt hash with a per-group salt, peppered with the KEK so
 * a copy of the database alone can't be brute-forced offline. Wrong patterns lock that person out
 * of every private group, longer each time (lockoutAfter). Pure apart from node:crypto.
 */

/**
 * One step: a tap or a long press. A pattern is a string of them, e.g. "TTLTLL". There are two
 * kinds: a person's universal pattern (opens every private group they're in; at least 6 steps,
 * mixed) and a group's own pattern (optional, opens only that group; any length).
 */
export const PATTERN_MIN = 6
export const PATTERN_MAX = 32

/** Taps and long presses only, 1 to 32 of them. */
export function validPattern(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 1 && p.length <= PATTERN_MAX && /^[TL]+$/.test(p)
}

/** Why a universal pattern can't be used (null when it can). All taps or all long presses is too easy to guess. */
export function patternProblem(p: string): string | null {
  if (!validPattern(p) || p.length < PATTERN_MIN) return `Use ${PATTERN_MIN} to ${PATTERN_MAX} taps and long presses.`
  if (!p.includes('T') || !p.includes('L')) return 'Mix taps and long presses.'
  return null
}

/** Why a group's own pattern can't be used: it only has to be taps and long presses. */
export function groupPatternProblem(p: string): string | null {
  return validPattern(p) ? null : `Use 1 to ${PATTERN_MAX} taps and long presses.`
}

/**
 * The form a pattern is hashed in. With the sequence off only the counts matter ("TLTTLL" and
 * "LLTTTL" are the same pattern), so it's sorted first: longs, then taps.
 */
export const canonicalPattern = (p: string, ordered: boolean): string => (ordered ? p : [...p].sort().join(''))

const SCRYPT = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export interface PatternHash {
  salt: string
  hash: string
  /** false: the counts matter, not the order. Missing (7.1 hashes) means in order. */
  ordered?: boolean
}

export function hashPattern(pattern: string, pepper: Buffer, salt = randomBytes(16).toString('base64'), ordered = true): PatternHash {
  const h = scryptSync(canonicalPattern(pattern, ordered), Buffer.concat([Buffer.from(salt, 'base64'), pepper]), 32, SCRYPT)
  return { salt, hash: h.toString('base64'), ...(ordered ? {} : { ordered: false }) }
}

export function patternMatches(pattern: string, stored: PatternHash, pepper: Buffer): boolean {
  if (!validPattern(pattern)) return false
  const got = Buffer.from(hashPattern(pattern, pepper, stored.salt, stored.ordered !== false).hash, 'base64')
  const want = Buffer.from(stored.hash, 'base64')
  return got.length === want.length && timingSafeEqual(got, want)
}

/**
 * Checked with each KEK's pepper, newest first: after a rotation the old hash still opens, and
 * `rehash` says to store it again with the newest key.
 */
export function patternMatchesAny(pattern: string, stored: PatternHash, keks: Buffer[]): { ok: boolean; rehash: boolean } {
  for (const [i, k] of keks.entries()) if (patternMatches(pattern, stored, pepperOf(k))) return { ok: true, rehash: i > 0 }
  return { ok: false, rehash: false }
}

// ---- lockout ------------------------------------------------------------------------------

/** Free tries before the first lockout. */
export const FREE_TRIES = 5
const MINUTE = 60_000
const FIRST_LOCK_MS = 15 * MINUTE
const MAX_LOCK_MS = 24 * 60 * MINUTE

/** One person's wrong tries, on every private group together (users/{uid}/secrets/vault.tries). */
export interface TryState {
  wrong: number
  lockedUntil?: number
}

/** Whether `now` is inside a lockout. */
export const lockedOut = (s: TryState | undefined, now: number): boolean => !!s?.lockedUntil && now < s.lockedUntil

/**
 * The state after a wrong pattern: the 5th wrong try locks for 15 minutes, and every one after
 * that doubles it, up to a day. A right one clears it (the caller deletes the entry).
 */
export function afterWrong(s: TryState | undefined, now: number): TryState {
  const wrong = (s?.wrong ?? 0) + 1
  if (wrong < FREE_TRIES) return { wrong }
  const ms = Math.min(MAX_LOCK_MS, FIRST_LOCK_MS * 2 ** (wrong - FREE_TRIES))
  return { wrong, lockedUntil: now + ms }
}

/** Tries left before the next lockout (0 while locked). */
export const triesLeft = (s: TryState | undefined): number => Math.max(0, FREE_TRIES - (s?.wrong ?? 0))

// ---- the data key -------------------------------------------------------------------------

/** A fresh group data key, base64 (32 bytes). */
export const newDataKey = (): string => randomBytes(32).toString('base64')

export const wrapKey = (dek: string, kek: Buffer): Sealed => seal(dek, kek)

/** The data key, trying each KEK (newest first, as during a rotation); undefined when none opens it. */
export function unwrapKey(wrapped: Sealed, keks: Buffer[]): { dek: string; rewrap: boolean } | undefined {
  for (const [i, k] of keks.entries()) {
    try {
      return { dek: unseal(wrapped, k), rewrap: i > 0 }
    } catch {
      /* the next */
    }
  }
  return undefined
}

// ---- requests -----------------------------------------------------------------------------

/** The pattern hash pepper: derived from the newest KEK so it changes only with it. */
export const pepperOf = (kek: Buffer): Buffer => kek.subarray(0, 16)

/** The relying party of a passkey ceremony: the app's own host, only for a known origin. */
export function rpFor(origin: string | undefined, allowed: readonly string[]): { origin: string; rpID: string } | null {
  if (!origin || !allowed.includes(origin)) return null
  try {
    return { origin, rpID: new URL(origin).hostname }
  } catch {
    return null
  }
}
