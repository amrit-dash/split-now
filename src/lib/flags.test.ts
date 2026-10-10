import { describe, expect, it } from 'vitest'
import {
  adminGateNote,
  announcementActive,
  announcementKey,
  buildLabel,
  compareSemver,
  DEFAULT_APP_CONFIG,
  FLAG_INFO,
  FLAG_NAMES,
  lastBlocked,
  MAINTENANCE_FALLBACK,
  maintenanceText,
  rememberBlocked,
  resolveAppConfig,
  resolveBlockInfo,
  semverOf,
  signupsClosedText,
  signupsOpen,
  toAppConfigDoc,
  updateRequired,
  writesOpen,
} from './flags'

// The rules whitelist the same flag names (firestore.rules validFlags); read the file so the two can't drift.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

describe('resolveAppConfig', () => {
  it('a missing document means everything on and nothing blocking', () => {
    expect(resolveAppConfig(undefined)).toEqual(DEFAULT_APP_CONFIG)
    expect(resolveAppConfig({})).toEqual(DEFAULT_APP_CONFIG)
    for (const f of FLAG_NAMES) expect(DEFAULT_APP_CONFIG.flags[f]).toBe(true)
  })
  it('only an explicit false turns a flag off; unknown flags are ignored', () => {
    const c = resolveAppConfig({ flags: { nudges: false, quickAdd: 'off', teleport: false } })
    expect(c.flags.nudges).toBe(false)
    expect(c.flags.quickAdd).toBe(true)
    expect('teleport' in c.flags).toBe(false)
  })
  it('reads the switches and drops malformed values', () => {
    const c = resolveAppConfig({
      maintenance: true,
      maintenanceMessage: 'Back at 10',
      minVersion: '1.2.3',
      announcement: { text: '  Hello  ', level: 'warn', until: 5 },
      signups: 'invite',
      updatedAt: 7,
      updatedBy: 'boss',
    })
    expect(c).toMatchObject({ maintenance: true, maintenanceMessage: 'Back at 10', minVersion: '1.2.3', signups: 'invite', updatedAt: 7, updatedBy: 'boss' })
    expect(c.announcement).toEqual({ text: 'Hello', level: 'warn', until: 5 })
    const bad = resolveAppConfig({ maintenance: 'yes', minVersion: 'v1', announcement: { text: '   ' }, signups: 'closed' })
    expect(bad).toMatchObject({ maintenance: false, minVersion: '0.0.0', announcement: null, signups: 'open' })
    expect(resolveAppConfig({ announcement: { text: 'x', level: 'loud' } }).announcement).toEqual({ text: 'x', level: 'info' })
  })
  it('round-trips through the document the console writes', () => {
    const cfg = {
      ...DEFAULT_APP_CONFIG,
      maintenance: true,
      maintenanceMessage: ' soon ',
      announcement: { text: 'Hi', level: 'info' as const },
      flags: { ...DEFAULT_APP_CONFIG.flags, nudges: false },
    }
    const doc = toAppConfigDoc(cfg, 'boss', 99)
    expect(doc).toMatchObject({
      maintenance: true,
      maintenanceMessage: 'soon',
      announcement: { text: 'Hi', level: 'info' },
      signups: 'open',
      updatedAt: 99,
      updatedBy: 'boss',
    })
    expect('until' in (doc.announcement as object)).toBe(false)
    expect(resolveAppConfig(doc)).toEqual({ ...cfg, maintenanceMessage: 'soon', updatedAt: 99, updatedBy: 'boss' })
    const empty = toAppConfigDoc({ ...DEFAULT_APP_CONFIG, announcement: { text: '  ', level: 'info' } }, 'boss', 1)
    expect(empty.announcement).toBeNull()
    expect('maintenanceMessage' in empty).toBe(false)
  })
  it('names every flag the rules accept, and nothing else, with copy for the console', () => {
    const m = rules.match(/function validFlags[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/)
    expect(m).not.toBeNull()
    const inRules = [...m![1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1]).sort()
    expect([...FLAG_NAMES].sort()).toEqual(inRules)
    for (const f of FLAG_NAMES) expect(FLAG_INFO[f].label.length).toBeGreaterThan(0)
  })
})

describe('versions', () => {
  it('reads the semver part of the build version', () => {
    expect(semverOf('0.1.0+2d165f0')).toBe('0.1.0')
    expect(semverOf('v1.2.3')).toBe('1.2.3')
    expect(semverOf('dev')).toBe('0.0.0')
  })
  it('compares numerically, not as text', () => {
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1)
    expect(compareSemver('1.0.0+abc', '1.0.0+def')).toBe(0)
    expect(compareSemver('0.1.0', '0.1.1')).toBe(-1)
  })
  it('asks for an update only when the build is older than the minimum', () => {
    expect(updateRequired({ minVersion: '0.2.0' }, '0.1.0+abc')).toBe(true)
    expect(updateRequired({ minVersion: '0.1.0' }, '0.1.0+abc')).toBe(false)
    expect(updateRequired({ minVersion: '0.0.0' }, 'dev')).toBe(false)
    // a dev build (no version) is asked to update by any minimum above 0.0.0: deliberate, so a stale preview can't skip it
    expect(updateRequired({ minVersion: '0.0.1' }, 'dev')).toBe(true)
  })
})

describe('announcements', () => {
  it('is active until its deadline, and keyed by its content', () => {
    expect(announcementActive(null)).toBe(false)
    expect(announcementActive({ text: 'Hi', level: 'info' })).toBe(true)
    expect(announcementActive({ text: 'Hi', level: 'info', until: 100 }, 99)).toBe(true)
    expect(announcementActive({ text: 'Hi', level: 'info', until: 100 }, 100)).toBe(false)
    const k = announcementKey({ text: 'Hi', level: 'info' })
    expect(k).toMatch(/^[0-9a-z]+$/)
    expect(announcementKey({ text: 'Hi', level: 'warn' })).not.toBe(k)
    expect(announcementKey({ text: 'Hi', level: 'info', until: 5 })).not.toBe(k)
    expect(announcementKey({ text: 'Hi', level: 'info' })).toBe(k)
  })
})

describe('gates', () => {
  it('invite-only hides sign-up unless the link is an invite', () => {
    expect(signupsOpen({ signups: 'open' }, '/')).toBe(true)
    expect(signupsOpen({ signups: 'invite' }, '/')).toBe(false)
    expect(signupsOpen({ signups: 'invite' }, '/join/ABCD2345')).toBe(true)
    expect(signupsOpen({ signups: 'invite' }, '/joinery')).toBe(false)
  })
  it('writesOpen mirrors the rules', () => {
    expect(writesOpen({ maintenance: false }, false, false)).toBe(true)
    expect(writesOpen({ maintenance: true }, false, false)).toBe(false)
    expect(writesOpen({ maintenance: false }, true, false)).toBe(false)
    expect(writesOpen({ maintenance: true }, true, true)).toBe(true)
  })
  it('reads a block entry defensively', () => {
    expect(resolveBlockInfo(null)).toBeNull()
    expect(resolveBlockInfo({ reason: 'Spam', at: 1, by: 'boss' })).toEqual({ reason: 'Spam', at: 1, by: 'boss' })
    expect(resolveBlockInfo({ reason: 5 })).toEqual({ reason: '', at: 0, by: '' })
  })
})

describe('the version people see', () => {
  it('is the build: version plus commit, or the version alone for a dev build', () => {
    expect(buildLabel('3.2.0+c94f47f')).toBe('3.2.0 (c94f47f)')
    expect(buildLabel('3.2.0+dev')).toBe('3.2.0')
    expect(buildLabel('3.2.0')).toBe('3.2.0')
  })
  it('ignores the retired admin-set config/app.version, and a save clears it from the document', () => {
    const cfg = resolveAppConfig({ version: '3.0.0', maintenance: true })
    expect('version' in cfg).toBe(false)
    expect('version' in toAppConfigDoc(cfg, 'u', 1)).toBe(false)
  })
})

describe('sign-ups during maintenance', () => {
  it('closes them, even on an invite link, and says why', () => {
    expect(signupsOpen({ signups: 'open', maintenance: true }, '/')).toBe(false)
    expect(signupsOpen({ signups: 'invite', maintenance: true }, '/join/ABCD2345')).toBe(false)
    expect(signupsClosedText({ maintenance: true })).toContain('maintenance')
    expect(signupsClosedText({ maintenance: false })).toContain('invite only')
  })
})

describe('maintenance presentation', () => {
  it('shows the admin message, or the fallback when it is blank', () => {
    expect(maintenanceText('Back by 10 pm.')).toBe('Back by 10 pm.')
    expect(maintenanceText('  Moving the database  ')).toBe('Moving the database')
    expect(maintenanceText('')).toBe(MAINTENANCE_FALLBACK)
    expect(maintenanceText('   ')).toBe(MAINTENANCE_FALLBACK)
    expect(maintenanceText(undefined)).toBe(MAINTENANCE_FALLBACK)
  })
  it('gives admins a strip for the gate they are exempt from, maintenance first', () => {
    const base = { maintenance: false, minVersion: '0.0.0' }
    expect(adminGateNote(base, '1.0.0', true)).toBeNull()
    expect(adminGateNote({ ...base, maintenance: true }, '1.0.0', false)).toBeNull()
    expect(adminGateNote({ ...base, maintenance: true }, '1.0.0', true)).toEqual({
      kind: 'maintenance',
      text: 'Maintenance mode is on · only admins can use the app',
    })
    expect(adminGateNote({ maintenance: true, minVersion: '9.0.0' }, '1.0.0', true)?.kind).toBe('maintenance')
    const u = adminGateNote({ ...base, minVersion: '2.0.0' }, '1.4.0+abc', true)
    expect(u?.kind).toBe('update')
    expect(u?.text).toContain('below 2.0.0')
    expect(u?.text).toContain('you are on 1.4.0')
  })
})

describe('last blocked answer on this device', () => {
  const g = globalThis as Record<string, unknown>
  const withStorage = (run: () => void) => {
    const m = new Map<string, string>()
    g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    try {
      run()
    } finally {
      delete g.localStorage
    }
  }

  it('is unknown until an answer was seen, then remembers it per account', () =>
    withStorage(() => {
      expect(lastBlocked('u1')).toBeUndefined()
      rememberBlocked('u1', null)
      expect(lastBlocked('u1')).toBeNull()
      expect(lastBlocked('u2')).toBeUndefined()
      rememberBlocked('u2', { reason: 'spam', at: 5, by: 'admin' })
      expect(lastBlocked('u2')).toEqual({ reason: 'spam', at: 5, by: 'admin' })
      rememberBlocked('u2', null)
      expect(lastBlocked('u2')).toBeNull()
    }))

  it('treats a broken entry or no storage as unknown', () => {
    expect(lastBlocked('u1')).toBeUndefined()
    expect(() => rememberBlocked('u1', null)).not.toThrow()
    withStorage(() => {
      ;(g.localStorage as { setItem: (k: string, v: string) => void }).setItem('splitnow-blocked:u1', '{nope')
      expect(lastBlocked('u1')).toBeUndefined()
    })
  })
})
