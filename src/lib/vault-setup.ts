/*
 * What opens a private group, as the setup card shows it (src/features/vault/LockSetup.tsx), in
 * three places with one structure: Settings → Encrypted groups (scope "all": the universal
 * pattern), the new-group form and a group's Private group sheet (scope "group": the universal
 * pattern or the group's own). Pure.
 *
 * A private group always opens with a pattern (the server refuses one with none: functions/src/vault.ts
 * NO_PATTERN_TEXT) plus the person's passkey. The passkey is the account's, one for every group: it
 * proves it's you, while the pattern is what differs from group to group.
 */
import { formatTime } from './locale'
import type { VaultStatus } from './vault-api'

/** Wrong tries before a lockout (functions/src/lib/vault-core.ts FREE_TRIES). */
const FREE_TRIES = 5

/** What a group opens with: everyone's universal pattern, or a pattern of its own (shared in person). */
export type OpensWith = 'universal' | 'own'

export type RowState = 'ready' | 'missing' | 'info'

export interface SetupRow {
  id: 'passkey' | 'universal' | 'own' | 'server'
  title: string
  detail: string
  state: RowState
  /** the row's button(s): add or set when missing, change (and for its own pattern, remove) when ready */
  actions: Array<'add' | 'set' | 'change' | 'remove'>
  /** the pattern row while too many wrong tries keep every pattern out */
  locked?: boolean
}

/** The group's own pattern as the card knows it: set (on the server, or chosen in the form), and in order or not. */
export interface OwnPattern {
  set: boolean
  ordered?: boolean
}

const order = (ordered?: boolean) => (ordered === false ? 'any order' : 'in order')

/** Its own pattern when it has one; else the universal one when the person has it; else its own (no universal to lean on). */
export function defaultOpensWith(s: Pick<VaultStatus, 'universal'>, own: OwnPattern): OpensWith {
  if (own.set) return 'own'
  return s.universal ? 'universal' : 'own'
}

/** The rows, in order: passkey, then the pattern that opens it, then the server's key. */
export function setupRows(
  s: VaultStatus,
  o: { scope: 'all' | 'group'; opensWith?: OpensWith; own?: OwnPattern; demo?: boolean; keyReady?: boolean },
): SetupRow[] {
  const rows: SetupRow[] = []
  rows.push(
    o.demo
      ? { id: 'passkey', title: 'Passkey', detail: 'Not needed in the demo', state: 'info', actions: [] }
      : s.hasPasskey
        ? // ＋ still adds one: a phone the synced passkey doesn't reach needs its own
          {
            id: 'passkey',
            title: 'Passkey',
            detail: 'Face ID, fingerprint or screen lock. One for all your groups; ＋ adds one on this phone',
            state: 'ready',
            actions: ['add'],
          }
        : { id: 'passkey', title: 'Passkey', detail: 'Face ID, fingerprint or screen lock, asked after the pattern', state: 'missing', actions: ['add'] },
  )
  const universal: SetupRow = s.universal
    ? {
        id: 'universal',
        title: 'Universal pattern',
        detail: `Set · ${order(s.ordered)}. Opens every private group you’re in`,
        state: 'ready',
        actions: ['change'],
      }
    : {
        id: 'universal',
        title: 'Universal pattern',
        detail: 'At least 6 taps and long presses. Opens every private group you’re in',
        state: 'missing',
        actions: ['set'],
      }
  if (o.scope === 'all' || o.opensWith !== 'own') rows.push(universal)
  else {
    const own = o.own ?? { set: false }
    rows.push(
      own.set
        ? { id: 'own', title: 'Its own pattern', detail: `Set · ${order(own.ordered)}. Tell people in person`, state: 'ready', actions: ['change', 'remove'] }
        : { id: 'own', title: 'Its own pattern', detail: 'Any taps and long presses. Opens only this group', state: 'missing', actions: ['set'] },
    )
  }
  // Wrong tries count across every private group: say so on the pattern row, and when they lock it, until when.
  const pattern = rows[rows.length - 1]
  if (s.triesLeft === 0 && typeof s.lockedUntil === 'number')
    rows[rows.length - 1] = {
      ...pattern,
      state: 'missing',
      detail: `Too many wrong tries. Try again after ${formatTime(s.lockedUntil)}`,
      actions: [],
      locked: true,
    }
  else if (pattern.state === 'ready' && s.triesLeft > 0 && s.triesLeft < FREE_TRIES)
    rows[rows.length - 1] = { ...pattern, detail: `${pattern.detail} · ${s.triesLeft} ${s.triesLeft === 1 ? 'try' : 'tries'} left` }
  rows.push(
    !s.serverReady
      ? { id: 'server', title: 'Encryption key', detail: 'The server isn’t set up for private groups yet', state: 'missing', actions: [] }
      : o.scope === 'group' && o.keyReady
        ? { id: 'server', title: 'Encryption key', detail: 'Ready, sealed on the server', state: 'ready', actions: [] }
        : {
            id: 'server',
            title: 'Encryption key',
            detail: o.scope === 'group' ? 'Made when it turns private' : 'The server is ready',
            state: 'ready',
            actions: [],
          },
  )
  return rows
}

/** Why a group can't be made private yet (null: it can). Passkeys aren't needed in the demo. */
export function privateBlocker(s: VaultStatus, o: { opensWith: OpensWith; own: OwnPattern; demo?: boolean }): string | null {
  if (!s.serverReady) return 'The server isn’t set up for private groups yet.'
  if (o.opensWith === 'universal' && !s.universal) return 'Set your universal pattern, or give it its own pattern.'
  if (o.opensWith === 'own' && !o.own.set) return 'Set its own pattern first.'
  if (!o.demo && !s.hasPasskey) return 'Add a passkey first.'
  return null
}

/** The pill on a row: what state it's in, in words (never colour alone). */
export function stateLabel(r: SetupRow): string {
  if (r.locked) return 'Locked'
  if (r.state === 'info') return 'Demo'
  if (r.state === 'ready') return r.id === 'passkey' ? 'Added' : 'Ready'
  return r.id === 'server' ? 'Not ready' : 'Needed'
}

/** "Mira", "Mira and Dev", "Mira, Dev and 2 others". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'Someone'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : `${names[0]}, ${names[1]} and ${names.length - 2} others`
}

/**
 * The card in a private group's sheet when people in it can't open it yet: with no pattern of its
 * own it opens only with universal patterns, and they haven't set one (private groups off, or
 * stopped). Null: everyone can, or it has its own pattern.
 */
export function waitingNote(names: string[]): { title: string; detail: string } | null {
  if (!names.length) return null
  const one = names.length === 1
  return {
    title: `${nameList(names)} can’t open it yet`,
    detail: `${one ? 'They haven’t' : 'None of them has'} set up a universal pattern, and this group has no pattern of its own. Give it one and tell them in person.`,
  }
}

/** Removing a group's own pattern while some people open it only with that: say who gets locked out. */
export function removeWarning(names: string[]): string {
  if (!names.length) return 'People in it open it with their universal pattern instead.'
  return `People in it open it with their universal pattern instead. ${nameList(names)} ${names.length === 1 ? 'has' : 'have'} none, so they won’t be able to open it.`
}

/** After letting someone into a private group they have no way to open yet: what to offer its creator. */
export function addedPrompt(name: string): { title: string; message: string; confirmLabel: string } {
  return {
    title: `${name} can’t open it yet`,
    message: `${name} hasn’t set up private groups, and this group has no pattern of its own. Give it one now and tell it to ${name} in person?`,
    confirmLabel: 'Give it a pattern',
  }
}
