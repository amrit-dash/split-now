import { describe, expect, it } from 'vitest'
import { type FireworkTheme, fireworkLook, isDark, parseRgb } from './firework'

const theme = (onFill: string): FireworkTheme => ({
  onFill,
  brand200: '#ddd6fe',
  brand300: '#c4b5fd',
  duo300: '#f0abfc',
  brand700: '#6d28d9',
  brand800: '#5b21b6',
  duo700: '#a21caf',
})

describe('parseRgb', () => {
  it('reads hex and rgb() colours', () => {
    expect(parseRgb('#fff')).toEqual([255, 255, 255])
    expect(parseRgb(' #0B0A14 ')).toEqual([11, 10, 20])
    expect(parseRgb('rgb(12, 34, 56)')).toEqual([12, 34, 56])
    expect(parseRgb('rgba(12 34 56 / 0.5)')).toEqual([12, 34, 56])
  })

  it('gives up on other formats', () => {
    expect(parseRgb('oklch(50% 0.1 120)')).toBeNull()
    expect(parseRgb('')).toBeNull()
  })
})

describe('isDark', () => {
  it('tells the ink from white', () => {
    expect(isDark('#0b0a14')).toBe(true)
    expect(isDark('#000000')).toBe(true)
    expect(isDark('#ffffff')).toBe(false)
    expect(isDark('#c6ff00')).toBe(false)
  })

  it('treats an unknown colour as light (the white-text default)', () => {
    expect(isDark('')).toBe(false)
    expect(isDark('oklch(20% 0 0)')).toBe(false)
  })
})

describe('fireworkLook', () => {
  it('glows in light colours on a deep fill (white text)', () => {
    const look = fireworkLook(theme('#ffffff'))
    expect(look.blend).toBe('lighter')
    expect(look.main).toContain('#ddd6fe')
    expect(look.main).not.toContain('#5b21b6')
    expect(look.flash).toBe('255,246,222')
    expect(look.alpha).toBe(1)
    // The deep-fill look is the original one.
    expect([look.spark, look.dot, look.shrink, look.count, look.trailMs, look.mixed, look.halo]).toEqual([1, 1, 0, 1, 260, false, 0.13])
  })

  it('paints in the ink and deep accent shades on a bright fill (dark text)', () => {
    const look = fireworkLook(theme('#0b0a14'))
    expect(look.blend).toBe('source-over')
    // Nothing light: every colour is dark enough to show on a bright fill.
    for (const c of [...look.main, ...look.accents, look.head, look.trail, look.ember]) expect(isDark(c), c).toBe(true)
    // Festive: several distinct hues, including the accent's own deep shade, and no ink-grey.
    expect(new Set(look.main).size).toBeGreaterThanOrEqual(4)
    expect(look.main).toContain('#5b21b6')
    expect(look.main).not.toContain('#0b0a14')
    expect(look.head).toBe('#0b0a14')
    expect(look.mixed).toBe(true)
    expect(look.flash).toBe('255,255,255')
    expect(look.alpha).toBeGreaterThan(1)
    const deep = fireworkLook(theme('#ffffff'))
    expect(look.halo).toBeLessThan(deep.halo)
    // Bolder than on a deep fill: a bigger head, more numerous sparks and a longer trail.
    expect(look.spark).toBeGreaterThan(deep.spark)
    // The sparks start only a little larger and shrink as they fall, so the glitter after a
    // burst stays fine (painted dots have no glow to soften them): at most 1.3x at the burst,
    // well under the glow look's size by the end.
    expect(look.dot).toBeLessThanOrEqual(1.3)
    expect(look.dot).toBeLessThan(look.spark)
    expect(look.dot * (1 - look.shrink)).toBeLessThan(deep.dot * (1 - deep.shrink) * 0.6)
    expect(look.count).toBeGreaterThan(deep.count)
    expect(look.trailMs).toBeGreaterThan(deep.trailMs)
  })
})
