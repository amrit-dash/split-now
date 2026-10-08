import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCENTS, ACCENT_KEY, DUO_KEY, applyAccent, getAccent, getDuo, setAccent, setDuo, themeColor, tintIconSvg } from './accent'

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

  it('falls back to the default for an invalid or retired stored value', () => {
    dom.store.set(ACCENT_KEY, 'chartreuse')
    expect(getAccent()).toBe('violet')
    applyAccent()
    expect(dom.attrs.get('data-accent')).toBe('violet')
    // Emerald, Rose and Amber were retired; a phone that stored one gets the default.
    for (const old of ['emerald', 'rose', 'amber']) {
      dom.store.set(ACCENT_KEY, old)
      expect(getAccent()).toBe('violet')
    }
  })

  it('survives localStorage throwing', () => {
    ;(globalThis as Record<string, unknown>).localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(getAccent()).toBe('violet')
    expect(getDuo()).toBe(true)
    expect(() => setAccent('indigo')).not.toThrow()
    expect(dom.attrs.get('data-accent')).toBe('indigo')
  })

  it('uses ink for the theme colour in dark mode', () => {
    dom = fakeDom(true)
    applyAccent('graphite')
    expect(dom.meta.content).toBe('#0b0a14')
    expect(themeColor('graphite', false)).toBe('#314158')
  })
})

describe('tintIconSvg', () => {
  const svg = '<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color=\'#db2777\' /></linearGradient></defs><rect fill="url(#g)"/><stop stop-color="#000"/></svg>'

  it('swaps the first two gradient stops and leaves the rest alone', () => {
    const out = tintIconSvg(svg, 'oklch(54.6% 0.245 262.881)', '#007595')!
    expect(out).toContain('stop-color="oklch(54.6% 0.245 262.881)"')
    expect(out).toContain("stop-color='#007595'")
    expect(out).toContain('stop-color="#000"')
    expect(out).not.toContain('#7c3aed')
  })

  it('refuses an SVG without two stops', () => {
    expect(tintIconSvg('<svg><rect/></svg>', '#000', '#fff')).toBeNull()
    expect(tintIconSvg('<svg><stop stop-color="#000"/></svg>', '#000', '#fff')).toBeNull()
  })

  it('matches the shipped favicon (two stops, as scripts/generate-icons.mjs assumes)', () => {
    expect(tintIconSvg(favicon, '#111111', '#222222')).toContain('#222222')
  })
})

// The app tsconfig has no Node types; load fs untyped (vitest runs in Node). `?raw` won't do:
// vitest stubs CSS imports.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const favicon = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8')

// --- Colour maths: oklch → sRGB and WCAG contrast, enough to guard the presets -------------

type Rgb = [number, number, number]
function oklchToRgb(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const gam = (x: number) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055 }
  return lin.map((v) => Math.round(gam(v) * 255)) as Rgb
}
function parseColor(v: string): Rgb {
  v = v.trim()
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb
  const m = v.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)$/)
  if (!m) throw new Error(`unparseable colour ${v}`)
  return oklchToRgb(+m[1] / 100, +m[2], m[3] === 'none' ? 0 : +m[3])
}
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
function luminance([r, g, b]: Rgb) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: Rgb, b: Rgb) {
  const l1 = luminance(a), l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
/** The CSS block that defines a preset's scales (the @theme block for the default). */
function presetBlock(id: string): string {
  const block = id === 'violet' ? css.match(/@theme static\s*\{([^}]*)\}/)?.[1] : css.match(new RegExp(`\\[data-accent='${id}'\\]\\s*\\{([^}]*)\\}`))?.[1]
  if (!block) throw new Error(`no CSS block for ${id}`)
  return block
}
const step = (block: string, name: string): Rgb => {
  const m = block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`missing --color-${name}`)
  return parseColor(m[1])
}
const WHITE: Rgb = [255, 255, 255]

describe('accent presets stay in sync', () => {
  it('every non-default preset has a CSS block overriding all brand and duo steps', () => {
    for (const a of ACCENTS.filter((p) => p.id !== 'violet')) {
      const block = presetBlock(a.id)
      for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
        expect(block).toContain(`--color-brand-${n}:`)
        expect(block).toContain(`--color-duo-${n}:`)
      }
    }
  })

  it('retired presets are gone from the CSS and nothing references brand-vivid', () => {
    for (const id of ['emerald', 'rose', 'amber']) expect(css).not.toContain(`[data-accent='${id}']`)
    expect(css).not.toContain('brand-vivid')
  })

  it('the pre-paint script in index.html knows every preset and its theme colour', () => {
    for (const a of ACCENTS) expect(html).toContain(`${a.id}: '${a.meta}'`)
  })

  it('the hex copies in ACCENTS match the CSS (from = brand-600, to = duo-500, meta = brand-700)', () => {
    for (const a of ACCENTS) {
      const block = presetBlock(a.id)
      expect(hex(step(block, 'brand-600')), `${a.id} from`).toBe(a.from)
      expect(hex(step(block, 'duo-500')), `${a.id} to`).toBe(a.to)
      expect(hex(step(block, 'brand-700')), `${a.id} meta`).toBe(a.meta)
    }
  })

  it('white text passes AA (4.5:1) on brand-600 and duo-600 of every preset (btn-primary ends)', () => {
    for (const a of ACCENTS) {
      const block = presetBlock(a.id)
      expect(contrast(WHITE, step(block, 'brand-600')), `${a.id} brand-600`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(WHITE, step(block, 'duo-600')), `${a.id} duo-600`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('each scale gets darker from 50 to 900', () => {
    for (const a of ACCENTS) {
      const block = presetBlock(a.id)
      for (const scale of ['brand', 'duo']) {
        const lums = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => luminance(step(block, `${scale}-${n}`)))
        for (let i = 1; i < lums.length; i++) expect(lums[i], `${a.id} ${scale} step ${i}`).toBeLessThanOrEqual(lums[i - 1] + 1e-9)
      }
    }
  })
})
