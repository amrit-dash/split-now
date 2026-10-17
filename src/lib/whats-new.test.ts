import { describe, expect, it } from 'vitest'
import { SECTIONS } from './help-content'
import { compareVersions, majorOf, RELEASES, releasesFor, unseenReleases, updateBanner } from './whats-new'

// The app's tsconfig has no Node types; load fs the way the other file-reading tests do.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
/** "## 8.3.3 — October 2026" headings of the app's current major. */
const logged = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — (.+)$/gm)]
  .map((m) => ({ version: m[1], date: m[2].trim() }))
  .filter((r) => majorOf(r.version) === majorOf(pkg.version))

describe('What’s new matches CHANGELOG.md', () => {
  it('every release of this major in the CHANGELOG has an entry here, with the same date, and nothing extra', () => {
    expect(logged.length).toBeGreaterThan(0)
    const here = RELEASES.filter((r) => majorOf(r.version) === majorOf(pkg.version))
    expect(here.map((r) => r.version).sort(compareVersions)).toEqual(logged.map((r) => r.version).sort(compareVersions))
    for (const r of logged) expect(here.find((x) => x.version === r.version)?.date, r.version).toBe(r.date)
  })
  it('the app’s own version is listed (the release PR adds both)', () => {
    expect(RELEASES.some((r) => r.version === pkg.version)).toBe(true)
  })
  it('every release says something, every line links to a section that exists, and copy has no exclamation marks', () => {
    for (const r of RELEASES) {
      expect(r.items.length, r.version).toBeGreaterThan(0)
      for (const it of r.items) {
        expect(
          SECTIONS.some((s) => s.id === it.section),
          `${r.version}: ${it.section}`,
        ).toBe(true)
        expect(it.text).not.toMatch(/!/)
      }
    }
  })
  it('is newest first', () => {
    const v = RELEASES.map((r) => r.version)
    expect(v).toEqual([...v].sort((a, b) => compareVersions(b, a)))
  })
})

describe('which releases show, and the update banner', () => {
  const all = [
    { version: '9.0.0', date: 'x', items: [{ text: 'a', section: 'insights' }] },
    { version: '8.3.4', date: 'x', items: [{ text: 'b', section: 'insights' }] },
    { version: '8.3.3', date: 'x', items: [{ text: 'c', section: 'insights' }] },
    { version: '7.9.0', date: 'x', items: [{ text: 'd', section: 'insights' }] },
  ]
  it('compares versions by number, not text', () => {
    expect(compareVersions('8.10.0', '8.9.9')).toBe(1)
    expect(compareVersions('8.3.3', '8.3.3')).toBe(0)
    expect(compareVersions('8.3.3+abc', '8.3.4')).toBe(-1)
    expect(majorOf('8.3.4')).toBe(8)
    expect(majorOf('x')).toBeNaN()
  })
  it('lists the current major only, nothing newer than the app; a new major starts over', () => {
    expect(releasesFor('8.3.4', all).map((r) => r.version)).toEqual(['8.3.4', '8.3.3'])
    expect(releasesFor('8.3.3', all).map((r) => r.version)).toEqual(['8.3.3'])
    expect(releasesFor('9.0.0', all).map((r) => r.version)).toEqual(['9.0.0'])
  })
  it('marks what came since this device last looked; a first visit marks nothing', () => {
    expect(unseenReleases({ current: '8.3.4', lastSeen: '8.3.3' }, all).map((r) => r.version)).toEqual(['8.3.4'])
    expect(unseenReleases({ current: '8.3.4', lastSeen: '8.3.4' }, all)).toEqual([])
    expect(unseenReleases({ current: '8.3.4', lastSeen: null }, all)).toEqual([])
    expect(unseenReleases({ current: '9.0.0', lastSeen: '8.3.4' }, all).map((r) => r.version)).toEqual(['9.0.0'])
  })
  it('the banner: once after an update, behind the admin’s switch, never on a first visit', () => {
    expect(updateBanner({ current: '8.3.4', lastSeen: '8.3.3', flag: true }, all)).toEqual({ version: '8.3.4' })
    expect(updateBanner({ current: '8.3.4', lastSeen: '8.3.3', flag: false }, all)).toBeNull()
    expect(updateBanner({ current: '8.3.4', lastSeen: null, flag: true }, all)).toBeNull()
    expect(updateBanner({ current: '8.3.4', lastSeen: '8.3.4', flag: true }, all)).toBeNull()
    // a downgrade or a version with nothing listed shows nothing
    expect(updateBanner({ current: '8.3.3', lastSeen: '8.3.4', flag: true }, all)).toBeNull()
    expect(updateBanner({ current: '8.3.5', lastSeen: '8.3.4', flag: true }, all)).toBeNull()
  })
})
