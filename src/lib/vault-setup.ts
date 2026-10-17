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
import type { VaultStatus } from './vault-api'

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
        ? { id: 'passkey', title: 'Passkey', detail: 'Face ID, fingerprint or screen lock. One for all your groups', state: 'ready', actions: [] }
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
  if (r.state === 'info') return 'Demo'
  if (r.state === 'ready') return r.id === 'passkey' ? 'Added' : 'Ready'
  return r.id === 'server' ? 'Not ready' : 'Needed'
}
