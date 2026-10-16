/*
 * The vault callable's steps and answers (functions/src/vault.ts), shared by both repos, Settings →
 * Encrypted groups and the unlock sheet. Pure types, the pattern rules and the error reading; no Firebase.
 */

export type VaultRequest =
  | { op: 'status'; groupId?: string }
  | { op: 'passkeyOptions'; purpose: 'register' | 'auth' }
  | { op: 'passkeyRegister'; response: unknown }
  | { op: 'setUniversal'; pattern: string; ordered: boolean; current?: string; auth?: unknown }
  | { op: 'unlockStart'; pattern: string; groupId?: string }
  | { op: 'unlockFinish'; auth?: unknown; register?: unknown }
  | { op: 'groupPattern'; groupId: string; pattern: string | null; ordered: boolean; current: string; auth?: unknown }
  | { op: 'create'; groupId: string }
  | { op: 'convert'; groupId: string; on: boolean; auth?: unknown }
  | { op: 'joinStatus'; code: string }
  | { op: 'requestJoin'; code: string }
  | { op: 'decideJoin'; groupId: string; uid: string; approve: boolean; memberId?: string; auth?: unknown }
  | { op: 'addContact'; groupId: string; uid: string; auth?: unknown }

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

/** Groups to offer in a picker: a private group only while it's open here (a locked one can't take a write, and its name stays out of sight). */
export function withoutLocked<G extends { id: string; vault?: boolean }>(groups: readonly G[], isOpen: (id: string) => boolean): G[] {
  return groups.filter((g) => !g.vault || isOpen(g.id))
}

/**
 * Whether the lock button sends what was pressed (src/features/vault/PatternLock.tsx). Fewer than
 * a universal pattern's 6 presses are only a stray tap and never reach the server (so they can't
 * count towards a lockout), unless this group has its own pattern, which can be shorter.
 */
export function shouldSend(pattern: string, opts: { groupHasOwn?: boolean }): boolean {
  if (!pattern || pattern.length > PATTERN_MAX) return false
  return pattern.length >= PATTERN_MIN || !!opts.groupHasOwn
}

/**
 * What a refused try on the lock button means. Nothing of it shows on screen: 'wrong' and
 * 'locked' do nothing; 'setup' (no pattern set up yet) opens the setup prompt; 'cancelled' (the
 * passkey prompt closed) and 'other' (offline, the server) are a quiet toast.
 */
export function refusalKind(e: unknown): 'wrong' | 'locked' | 'setup' | 'cancelled' | 'other' {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled'
  const r = vaultRefusal(e)
  if (r.lockedUntil) return 'locked'
  if (r.triesLeft !== undefined) return 'wrong'
  const code = String((e as { code?: string })?.code ?? '')
  const message = String((e as { message?: string })?.message ?? '')
  // The server's "no pattern yet" refusal (functions/src/vault.ts checkPattern), and the demo's.
  if ((code === '' || code.includes('failed-precondition')) && /Set up encrypted groups/.test(message)) return 'setup'
  return 'other'
}

/** Whether a group's ⋯ menu offers "Private group": a private one to everyone in it, any other shared group to its creator while private groups are on. */
export function privateMenuShown(g: { vault?: boolean; type?: string }, isCreator: boolean, flagOn: boolean): boolean {
  if (g.vault) return true
  return flagOn && isCreator && g.type !== 'personal'
}

/**
 * The Scan tab, for someone with private groups (docs/VAULT.md): the photo is read on the phone
 * first, since nobody knows yet which group it's for; the AI reads it only once a group that isn't
 * private is picked (and only where the AI is on for them).
 */
export const scanOnDeviceFirst = (o: { vaultsOn: boolean; hasPrivate: boolean }): boolean => o.vaultsOn && o.hasPrivate

export const aiAfterPick = (o: { readOnDevice: boolean; pickedPrivate: boolean; aiOn: boolean }): boolean => o.readOnDevice && !o.pickedPrivate && o.aiOn

/** Where someone stands with a private group's invite (vault ops joinStatus / requestJoin). */
export type JoinState = { status: 'none' } | { status: 'pending' } | { status: 'declined'; retryAt: number } | { status: 'member'; groupId: string }

/** "tomorrow at 9:40" style words for when someone may ask again, from now. */
export function askAgainWords(retryAt: number, now: number): string {
  const h = Math.max(1, Math.ceil((retryAt - now) / 3_600_000))
  return h <= 1 ? 'in about an hour' : `in about ${h} hours`
}

/**
 * Adding someone to a group from the Members screen: in a private group only its creator adds
 * people, and someone picked from their other groups (with an account) joins at once through the
 * server (vault op addContact); a name or an email is a placeholder, as in any group.
 */
export function addPlan(g: { vault?: boolean }, isCreator: boolean, accountUid?: string): 'forbidden' | 'contact' | 'placeholder' {
  if (!g.vault) return 'placeholder'
  if (!isCreator) return 'forbidden'
  return accountUid ? 'contact' : 'placeholder'
}

/** Where the pattern sheet is (src/features/vault/SetPatternSheet.tsx): a pattern that opens it now, the new one, the new one again. */
export type PatternPhase = 'current' | 'new' | 'again'

/**
 * The pattern sheet's first step. Changing a pattern takes one that already opens it (the server
 * checks it, functions/src/vault.ts): the current universal pattern to change it, and for a
 * group's own, the universal pattern or the group's own. Setting a first universal pattern starts
 * with the new one. Removing a group's own pattern is only the current step.
 */
export function firstPhase(o: { kind: 'universal' | 'group'; hasCurrent: boolean }): PatternPhase {
  return o.kind === 'group' || o.hasCurrent ? 'current' : 'new'
}

/** The sheet's heading for each step. */
export function phasePrompt(phase: PatternPhase, kind: 'universal' | 'group'): string {
  if (phase === 'current') return kind === 'universal' ? 'Enter your current pattern' : 'Enter a pattern that opens this group'
  return phase === 'new' ? 'Enter the new pattern' : 'Once more to be sure'
}
