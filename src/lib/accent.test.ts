import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCENTS, ACCENT_KEY, DUO_KEY, applyAccent, getAccent, getDuo, setAccent, setDuo, themeColor } from './accent'

// vitest runs in node: a minimal fake <html>, <meta name="theme-color"> and localStorage.
function fakeDom(dark = false) {
  const attrs = new Map<string, string>()
  const classes = new Set<string>(dark ? ['dark'] : [])
  const meta = { content: '#6d28d9', setAttribute(_: string, v: string) { this.content = v } }
  const store = new Map<string, string>()
  const g = globalThis as Record<string, unknown>
  g.document = {
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      classList: { contains: (c: string) => classes.has(c) },
    },
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
  }
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  return { attrs, meta, store }
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>
  delete g.document
  delete g.localStorage
})

describe('accent', () => {
  let dom: ReturnType<typeof fakeDom>
  beforeEach(() => { dom = fakeDom() })

  it('defaults to violet with dual tone on', () => {
    expect(getAccent()).toBe('violet')
    expect(getDuo()).toBe(true)
    applyAccent()
    expect(dom.attrs.get('data-accent')).toBe('violet')
    expect(dom.attrs.has('data-duo')).toBe(false)
    expect(dom.meta.content).toBe('#6d28d9')
  })

  it('applies attributes and the theme colour', () => {
    applyAccent('ocean', false)
    expect(dom.attrs.get('data-accent')).toBe('ocean')
    expect(dom.attrs.get('data-duo')).toBe('off')
    expect(dom.meta.content).toBe('#1447e6')
    applyAccent('ocean', true)
    expect(dom.attrs.has('data-duo')).toBe(false)
  })

  it('persists accent and duo', () => {
    setAccent('saffron')
    setDuo(false)
    expect(dom.store.get(ACCENT_KEY)).toBe('saffron')
    expect(dom.store.get(DUO_KEY)).toBe('off')
    expect(getAccent()).toBe('saffron')
    expect(getDuo()).toBe(false)
    expect(dom.attrs.get('data-accent')).toBe('saffron')
    expect(dom.attrs.get('data-duo')).toBe('off')
    setDuo(true)
    expect(getDuo()).toBe(true)
    expect(dom.attrs.has('data-duo')).toBe(false)
  })

  it('falls back to the default for an invalid stored value', () => {
    dom.store.set(ACCENT_KEY, 'chartreuse')
    expect(getAccent()).toBe('violet')
    applyAccent()
    expect(dom.attrs.get('data-accent')).toBe('violet')
  })

  it('survives localStorage throwing', () => {
    ;(globalThis as Record<string, unknown>).localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(getAccent()).toBe('violet')
    expect(getDuo()).toBe(true)
    expect(() => setAccent('rose')).not.toThrow()
    expect(dom.attrs.get('data-accent')).toBe('rose')
  })

  it('uses ink for the theme colour in dark mode', () => {
    dom = fakeDom(true)
    applyAccent('emerald')
    expect(dom.meta.content).toBe('#0b0a14')
    expect(themeColor('emerald', false)).toBe('#006045')
  })
})

// The app tsconfig has no Node types; load fs untyped (vitest runs in Node). `?raw` won't do:
// vitest stubs CSS imports.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

describe('accent presets stay in sync', () => {

  it('every non-default preset has a CSS block overriding all brand and duo steps', () => {
    for (const a of ACCENTS.filter((p) => p.id !== 'violet')) {
      const block = css.match(new RegExp(`\\[data-accent='${a.id}'\\]\\s*\\{([^}]*)\\}`))?.[1]
      expect(block, a.id).toBeTruthy()
      for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
        expect(block).toContain(`--color-brand-${n}:`)
        expect(block).toContain(`--color-duo-${n}:`)
      }
    }
  })

  it('the pre-paint script in index.html knows every preset and its theme colour', () => {
    for (const a of ACCENTS) expect(html).toContain(`${a.id}: '${a.meta}'`)
  })
})
