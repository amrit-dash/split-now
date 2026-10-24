import { describe, expect, it } from 'vitest'

/*
 * firebase.json serves the same build on several hosting sites (split-it-prod, split-now, freesplit).
 * Each site carries its own copy of the headers, so a site added by copying an old block can
 * silently lose the security headers and the CSP. This keeps them identical.
 */
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const config = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8')) as {
  hosting: Array<{ target: string; headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>; rewrites: unknown[] }>
}

describe('hosting sites', () => {
  const [first, ...rest] = config.hosting
  it('every site has the same headers and rewrites', () => {
    for (const site of rest) {
      expect(site.headers, site.target).toEqual(first.headers)
      expect(site.rewrites, site.target).toEqual(first.rewrites)
    }
  })
  it('every site sends the security headers and a CSP', () => {
    for (const site of config.hosting) {
      const keys = site.headers.flatMap((h) => h.headers.map((x) => x.key))
      for (const k of ['X-Content-Type-Options', 'Referrer-Policy']) expect(keys, `${site.target} ${k}`).toContain(k)
      expect(
        keys.some((k) => k.startsWith('Content-Security-Policy')),
        site.target,
      ).toBe(true)
    }
  })
  it('the Permissions-Policy lets the app itself use the camera (Scan) and the microphone (voice)', () => {
    // 9.0–9.6.0 sent microphone=(): browsers then refused voice at once and said "denied", whatever the person allowed.
    for (const site of config.hosting) {
      const pp = site.headers.flatMap((h) => h.headers).filter((x) => x.key === 'Permissions-Policy')
      expect(pp.length, site.target).toBeGreaterThan(0)
      for (const h of pp) {
        expect(h.value, site.target).toMatch(/(^|, )microphone=\(self\)/)
        expect(h.value, site.target).toMatch(/(^|, )camera=\(self\)/)
      }
    }
  })
})
