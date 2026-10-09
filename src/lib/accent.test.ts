import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCENTS, ACCENT_KEY, DUO_KEY, RETIRED_ACCENTS, applyAccent, getAccent, getDuo, setAccent, setDuo, themeColor, tintIconSvg } from './accent'

// vitest runs in node: a minimal fake <html>, <meta name="theme-color"> and localStorage.
function fakeDom(dark = false) {
  const attrs = new Map<string, string>()
  const classes = new Set<string>(dark ? ['dark'] : [])
  const meta = {
    content: '#6d28d9',
    setAttribute(_: string, v: string) {
      this.content = v
    },
  }
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
  beforeEach(() => {
    dom = fakeDom()
  })

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
    setAccent('lime')
    setDuo(false)
    expect(dom.store.get(ACCENT_KEY)).toBe('lime')
    expect(dom.store.get(DUO_KEY)).toBe('off')
    expect(getAccent()).toBe('lime')
    expect(getDuo()).toBe(false)
    expect(dom.attrs.get('data-accent')).toBe('lime')
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
    // Emerald and Rose were retired with no successor; a phone that stored one gets the default.
    for (const old of ['emerald', 'rose']) {
      dom.store.set(ACCENT_KEY, old)
      expect(getAccent()).toBe('violet')
    }
  })

  it('moves the retired presets to their successors (Saffron, Amber to Gold; Indigo to Ocean)', () => {
    for (const old of ['saffron', 'amber']) {
      dom.store.set(ACCENT_KEY, old)
      expect(getAccent()).toBe('gold')
      applyAccent()
      expect(dom.attrs.get('data-accent')).toBe('gold')
      expect(dom.meta.content).toBe('#774f00')
    }
    // Indigo was one blue too many beside Violet and Ocean; it moves to Ocean.
    dom.store.set(ACCENT_KEY, 'indigo')
    expect(getAccent()).toBe('ocean')
    // Prototype keys are not presets.
    dom.store.set(ACCENT_KEY, 'constructor')
    expect(getAccent()).toBe('violet')
  })

  it('survives localStorage throwing', () => {
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(getAccent()).toBe('violet')
    expect(getDuo()).toBe(true)
    expect(() => setAccent('neon')).not.toThrow()
    expect(dom.attrs.get('data-accent')).toBe('neon')
  })

  it('uses ink for the theme colour in dark mode', () => {
    dom = fakeDom(true)
    applyAccent('graphite')
    expect(dom.meta.content).toBe('#0b0a14')
    expect(themeColor('graphite', false)).toBe('#314158')
  })
})

describe('tintIconSvg', () => {
  const svg =
    '<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color=\'#db2777\' /></linearGradient></defs><rect fill="url(#g)"/><stop stop-color="#000"/></svg>'

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
  const a = C * Math.cos((h * Math.PI) / 180),
    b = C * Math.sin((h * Math.PI) / 180)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b,
    m_ = L - 0.1055613458 * a - 0.0638541728 * b,
    s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const gam = (x: number) => {
    x = Math.min(1, Math.max(0, x))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  return lin.map((v) => Math.round(gam(v) * 255)) as Rgb
}
function parseColor(v: string): Rgb {
  v = v.trim()
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb
  const m = v.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)$/)
  if (!m) throw new Error(`unparseable colour ${v}`)
  return oklchToRgb(+m[1] / 100, +m[2], m[3] === 'none' ? 0 : +m[3])
}
/** sRGB → oklch chroma and hue (degrees), the inverse of oklchToRgb. */
function oklchOf(c: Rgb): { C: number; h: number } {
  const [r, g, b] = c.map((v) => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
function luminance([r, g, b]: Rgb) {
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: Rgb, b: Rgb) {
  const l1 = luminance(a),
    l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
/** The CSS block that defines a preset's scales (the @theme block for the default). */
function presetBlock(id: string): string {
  const block = id === 'violet' ? css.match(/@theme static\s*\{([^}]*)\}/)?.[1] : css.match(new RegExp(`\\[data-accent='${id}'\\]\\s*\\{([^}]*)\\}`))?.[1]
  if (!block) throw new Error(`no CSS block for ${id}`)
  return block
}
/** A step's raw CSS value in a preset's block, or in the @theme defaults when the preset leaves it alone. */
function rawStep(id: string, name: string): string | undefined {
  const re = new RegExp(`--color-${name}:\\s*([^;]+);`)
  return presetBlock(id).match(re)?.[1] ?? presetBlock('violet').match(re)?.[1]
}
/** A preset's colour for a step, following var(--color-…) the way the browser does on <html>. */
function color(id: string, name: string): Rgb {
  const v = rawStep(id, name)
  if (!v) throw new Error(`missing --color-${name}`)
  const ref = v.match(/^var\(--color-([\w-]+)\)$/)
  return ref ? color(id, ref[1]) : parseColor(v)
}
const WHITE: Rgb = [255, 255, 255]
/** Whether a preset sets its own value for a step (rather than the default pointing at brand / duo). */
const ownStep = (id: string, name: string) => id !== 'violet' && new RegExp(`--color-${name}:`).test(presetBlock(id))

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
    for (const id of ['emerald', 'rose', 'amber', 'saffron', 'indigo']) expect(css).not.toContain(`[data-accent='${id}']`)
    expect(css).not.toContain('brand-vivid')
  })

  it('the pre-paint script in index.html knows every preset and its theme colour', () => {
    for (const a of ACCENTS) expect(html).toContain(`${a.id}: '${a.meta}'`)
    const map = html.match(/var accents = \{([^}]*)\}/)?.[1] ?? ''
    expect(map.match(/\w+(?=:)/g)).toEqual(ACCENTS.map((a) => a.id))
    // The same retired → successor moves, so the first paint already shows the successor.
    const retired = html.match(/var retired = \{([^}]*)\}/)?.[1] ?? ''
    expect(Object.fromEntries([...retired.matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]))).toEqual(RETIRED_ACCENTS)
    for (const to of Object.values(RETIRED_ACCENTS)) expect(ACCENTS.some((a) => a.id === to)).toBe(true)
  })

  it('the hex copies in ACCENTS match the CSS (from = fill, to = duo-500 or own fill-to, meta = brand-700)', () => {
    for (const a of ACCENTS) {
      expect(hex(color(a.id, 'fill')), `${a.id} from`).toBe(a.from)
      expect(hex(color(a.id, ownStep(a.id, 'fill-to') ? 'fill-to' : 'duo-500')), `${a.id} to`).toBe(a.to)
      expect(hex(color(a.id, 'brand-700')), `${a.id} meta`).toBe(a.meta)
    }
  })

  it('on-fill text passes AA (4.5:1) on fill and fill-to of every preset (btn-primary ends)', () => {
    for (const a of ACCENTS) {
      const ink = color(a.id, 'on-fill')
      expect(contrast(ink, color(a.id, 'fill')), `${a.id} fill`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(ink, color(a.id, 'fill-to')), `${a.id} fill-to`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('a preset with its own fills keeps on-fill readable over every aurora shade', () => {
    // The patches drift over the whole fill, so text can sit on any of them.
    for (const a of ACCENTS.filter((p) => ownStep(p.id, 'fill'))) {
      const ink = color(a.id, 'on-fill')
      for (const name of ['fill-300', 'fill-400', 'fill-500', 'fill-700', 'fill-800', 'fill-900', 'fill-to-400', 'fill-to-500']) {
        expect(ownStep(a.id, name), `${a.id} sets ${name}`).toBe(true)
        expect(contrast(ink, color(a.id, name)), `${a.id} ${name}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('brand-600 passes AA (4.5:1) as text on white for every preset', () => {
    for (const a of ACCENTS) expect(contrast(WHITE, color(a.id, 'brand-600')), `${a.id} brand-600`).toBeGreaterThanOrEqual(4.5)
  })

  it('the default fills are the brand / duo steps they replaced, and white on them', () => {
    expect(rawStep('violet', 'fill')).toBe('var(--color-brand-600)')
    expect(rawStep('violet', 'fill-to')).toBe('var(--color-duo-600)')
    expect(rawStep('violet', 'on-fill')).toBe('#ffffff')
    for (const n of [300, 400, 500, 700, 800, 900]) expect(rawStep('violet', `fill-${n}`)).toBe(`var(--color-brand-${n})`)
    for (const n of [400, 500]) expect(rawStep('violet', `fill-to-${n}`)).toBe(`var(--color-duo-${n})`)
    // Dual tone off makes accent fills flat: accent-live's drifting patches are not drawn.
    expect(css).toMatch(/@utility accent-live \{[\s\S]*?&:where\(\[data-duo='off'\] \*\)::before \{\s*display: none;/)
    // Dual tone off collapses the fill's partner onto the fill too.
    const off = css.match(/\[data-duo='off'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(off).toContain('--color-fill-to: var(--color-fill);')
    expect(off).toContain('--color-fill-to-400: var(--color-fill-400);')
    expect(off).toContain('--color-fill-to-500: var(--color-fill-500);')
  })

  it('no preset fill is the hue of an amount colour (emerald owed, rose owe)', () => {
    // Hues in oklch degrees: emerald-700 ≈ 166, rose-700 ≈ 16. Near-grey steps (Graphite) are skipped.
    const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    for (const a of ACCENTS) {
      for (const name of ['brand-500', 'brand-600', 'duo-500', 'duo-600', 'fill', 'fill-to']) {
        const { C, h } = oklchOf(color(a.id, name))
        if (C < 0.05) continue
        expect(hueGap(h, 166), `${a.id} ${name} vs emerald`).toBeGreaterThanOrEqual(25)
        expect(hueGap(h, 16), `${a.id} ${name} vs rose`).toBeGreaterThanOrEqual(25)
      }
    }
  })

  it('each scale gets darker from 50 to 900', () => {
    for (const a of ACCENTS) {
      for (const scale of ['brand', 'duo']) {
        const lums = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => luminance(color(a.id, `${scale}-${n}`)))
        for (let i = 1; i < lums.length; i++) expect(lums[i], `${a.id} ${scale} step ${i}`).toBeLessThanOrEqual(lums[i - 1] + 1e-9)
      }
    }
  })
})
