import { describe, expect, it } from 'vitest'
import { SPLASH_MS, splashHoldMs } from './splash'

const base = { elapsed: 0, standalone: true, seen: false, reducedMotion: false }

describe('splashHoldMs', () => {
  it('holds an installed app launch until the animation has played', () => {
    expect(splashHoldMs(base)).toBe(SPLASH_MS)
    expect(splashHoldMs({ ...base, elapsed: 600.4 })).toBe(SPLASH_MS - 600)
  })
  it('fades only after the last tagline line has started (index.html .boot-l2 starts at 1300 ms)', () => {
    expect(SPLASH_MS).toBeGreaterThan(1300)
    expect(SPLASH_MS).toBeLessThan(1800)
  })
  it('does not hold once the animation is over', () => {
    expect(splashHoldMs({ ...base, elapsed: SPLASH_MS + 1 })).toBe(0)
  })
  it('never holds a browser tab, a second launch in the session, or reduced motion', () => {
    expect(splashHoldMs({ ...base, standalone: false })).toBe(0)
    expect(splashHoldMs({ ...base, seen: true })).toBe(0)
    expect(splashHoldMs({ ...base, reducedMotion: true })).toBe(0)
  })
})

// The repo's files, read as accent.test.ts does (the app's tsconfig has no Node types).
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the splash logo follows the accent', () => {
  // index.html paints the splash before any stylesheet, so it keeps its own copy of each accent's logo gradient.
  const html = file('../../index.html')
  const css = file('../index.css')
  const block = (accent: string) => {
    if (accent === 'violet') return css.slice(css.indexOf('@theme static'), css.indexOf(':root {'))
    const start = css.indexOf(`&[data-accent='${accent}'] {`)
    return css.slice(start, css.indexOf('}', start))
  }
  const value = (text: string, name: string) => text.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim()
  const logo: Record<string, [string, string]> = Object.fromEntries(
    [...html.matchAll(/^\s+(\w+): \['([^']+)', '([^']+)'\],$/gm)].map((m) => [m[1], [m[2], m[3]]]),
  )

  it('has every accent, brand-600 → duo-600 as in index.css', () => {
    expect(Object.keys(logo).sort()).toEqual(['berry', 'gold', 'graphite', 'koi', 'neon', 'ocean', 'violet'])
    for (const [accent, [from, to]] of Object.entries(logo)) {
      expect(from, accent).toBe(value(block(accent), 'brand-600'))
      expect(to, accent).toBe(value(block(accent), 'duo-600'))
    }
  })
  it('is drawn inline, not the violet /favicon.svg', () => {
    expect(html).not.toContain('class="boot-logo" src=')
    expect(html).toContain('var(--boot-from')
    expect(file('../App.tsx')).toContain("stopColor: 'var(--boot-from")
  })
})
