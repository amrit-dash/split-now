import { describe, expect, it } from 'vitest'
import type { VaultStatus } from './vault-api'
import { addedPrompt, defaultOpensWith, privateBlocker, removeWarning, setupRows, stateLabel, waitingNote } from './vault-setup'

const base: VaultStatus = { serverReady: true, hasPasskey: true, universal: true, ordered: true, triesLeft: 5 }
const ids = (rows: ReturnType<typeof setupRows>) => rows.map((r) => `${r.id}:${r.state}:${r.actions.join('+')}`)

describe('what opens a private group: the setup card', () => {
  it('opens with its own pattern when it has one; else the universal one, if the person has it', () => {
    expect(defaultOpensWith(base, { set: true })).toBe('own')
    expect(defaultOpensWith(base, { set: false })).toBe('universal')
    expect(defaultOpensWith({ universal: false }, { set: false })).toBe('own')
  })
  it('all groups: passkey, universal pattern, server; each missing one has its button', () => {
    expect(ids(setupRows(base, { scope: 'all' }))).toEqual(['passkey:ready:add', 'universal:ready:change', 'server:ready:'])
    expect(ids(setupRows({ ...base, hasPasskey: false, universal: false }, { scope: 'all' }))).toEqual([
      'passkey:missing:add',
      'universal:missing:set',
      'server:ready:',
    ])
    expect(setupRows({ ...base, ordered: false }, { scope: 'all' })[1].detail).toMatch(/any order/)
  })
  it('a group: the pattern row follows what it opens with, and the key row whether it is made', () => {
    expect(ids(setupRows(base, { scope: 'group', opensWith: 'universal' }))).toEqual(['passkey:ready:add', 'universal:ready:change', 'server:ready:'])
    expect(ids(setupRows(base, { scope: 'group', opensWith: 'own', own: { set: false } }))).toEqual(['passkey:ready:add', 'own:missing:set', 'server:ready:'])
    const set = setupRows(base, { scope: 'group', opensWith: 'own', own: { set: true, ordered: false }, keyReady: true })
    expect(ids(set)).toEqual(['passkey:ready:add', 'own:ready:change+remove', 'server:ready:'])
    expect(set[1].detail).toMatch(/any order/)
    expect(set[2].detail).toMatch(/Ready/)
  })
  it('the demo needs no passkey; a server with no key can’t do anything', () => {
    expect(setupRows({ ...base, hasPasskey: false }, { scope: 'all', demo: true })[0]).toMatchObject({ state: 'info', actions: [] })
    const off = setupRows({ ...base, serverReady: false }, { scope: 'all' })[2]
    expect(off.state).toBe('missing')
    expect(stateLabel(off)).toBe('Not ready')
  })
  it('labels say the state in words', () => {
    const rows = setupRows({ ...base, universal: false }, { scope: 'all' })
    expect(rows.map(stateLabel)).toEqual(['Added', 'Needed', 'Ready'])
  })
  it('a group can be made private only with a way to open it and a passkey', () => {
    const own = { set: false }
    expect(privateBlocker(base, { opensWith: 'universal', own })).toBeNull()
    expect(privateBlocker({ ...base, universal: false }, { opensWith: 'universal', own })).toMatch(/universal pattern/)
    expect(privateBlocker(base, { opensWith: 'own', own })).toMatch(/own pattern/)
    expect(privateBlocker(base, { opensWith: 'own', own: { set: true } })).toBeNull()
    expect(privateBlocker({ ...base, hasPasskey: false }, { opensWith: 'universal', own })).toMatch(/passkey/)
    expect(privateBlocker({ ...base, hasPasskey: false }, { opensWith: 'universal', own, demo: true })).toBeNull()
    expect(privateBlocker({ ...base, serverReady: false }, { opensWith: 'universal', own })).toMatch(/server/)
  })
  it('wrong tries show on the pattern row; a lockout says until when and takes its buttons away', () => {
    expect(setupRows({ ...base, triesLeft: 2 }, { scope: 'all' })[1].detail).toMatch(/2 tries left$/)
    expect(setupRows({ ...base, triesLeft: 5 }, { scope: 'all' })[1].detail).not.toMatch(/left/)
    const locked = setupRows({ ...base, triesLeft: 0, lockedUntil: Date.UTC(2026, 9, 18, 12, 0) }, { scope: 'group', opensWith: 'own', own: { set: true } })[1]
    expect(locked).toMatchObject({ id: 'own', state: 'missing', actions: [], locked: true })
    expect(locked.detail).toMatch(/Too many wrong tries. Try again after/)
    expect(stateLabel(locked)).toBe('Locked')
  })
})

describe('people who can’t open a private group yet', () => {
  it('the card names them, and is gone when nobody is waiting', () => {
    expect(waitingNote([])).toBeNull()
    expect(waitingNote(['Mira'])).toEqual({
      title: 'Mira can’t open it yet',
      detail: 'They haven’t set up a universal pattern, and this group has no pattern of its own. Give it one and tell them in person.',
    })
    expect(waitingNote(['Mira', 'Dev'])?.title).toBe('Mira and Dev can’t open it yet')
    expect(waitingNote(['Mira', 'Dev', 'Ana'])?.title).toBe('Mira, Dev and Ana can’t open it yet')
    expect(waitingNote(['Mira', 'Dev', 'Ana', 'Raj'])?.title).toBe('Mira, Dev and 2 others can’t open it yet')
    expect(waitingNote(['Mira', 'Dev'])?.detail).toMatch(/^None of them has/)
  })
  it('removing its own pattern says who it locks out', () => {
    expect(removeWarning([])).toBe('People in it open it with their universal pattern instead.')
    expect(removeWarning(['Mira'])).toMatch(/Mira has none, so they won’t be able to open it\.$/)
    expect(removeWarning(['Mira', 'Dev'])).toMatch(/Mira and Dev have none/)
  })
  it('after letting someone in, its creator is offered to give it a pattern', () => {
    expect(addedPrompt('Mira')).toEqual({
      title: 'Mira can’t open it yet',
      message: 'Mira hasn’t set up private groups, and this group has no pattern of its own. Give it one now and tell it to Mira in person?',
      confirmLabel: 'Give it a pattern',
    })
  })
})
