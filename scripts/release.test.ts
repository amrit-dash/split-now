import { describe, expect, it } from 'vitest'
import { releaseNotes } from './release.ts'

const log = `# Changelog

## Unreleased

- Something not out yet.

## 3.2.0 — October 2026

The second release.

- **Koi**: a new accent.

## 3.1.1 — October 2026

- First.
`

describe('releaseNotes', () => {
  it("returns a version's section, without its heading or the next one", () => {
    expect(releaseNotes(log, '3.2.0')).toBe('The second release.\n\n- **Koi**: a new accent.')
    expect(releaseNotes(log, '3.1.1')).toBe('- First.')
  })

  it('does not match a version that only starts the same way', () => {
    expect(() => releaseNotes('## 3.2.10\n\n- x\n', '3.2.1')).toThrow(/no "## 3.2.1"/)
    expect(releaseNotes('## 3.2.1\n\n- y\n## 3.2.10\n- x\n', '3.2.1')).toBe('- y')
  })

  it('refuses a missing or empty section and a version that is not x.y.z', () => {
    expect(() => releaseNotes(log, '9.9.9')).toThrow(/no "## 9.9.9"/)
    expect(() => releaseNotes('## 4.0.0\n\n## 3.0.0\n- a\n', '4.0.0')).toThrow(/empty/)
    expect(() => releaseNotes(log, 'v3.2.0')).toThrow(/Not a release version/)
  })
})
