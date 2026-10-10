import { describe, expect, it } from 'vitest'
import {
  activeMotion,
  DEFAULT_MOTION,
  FLOW_SECONDS,
  fireworkScale,
  flowRate,
  isDefaultMotion,
  motionSummary,
  parseMotion,
  parsePreviewShown,
  particleScale,
  GLITTER_LEVEL,
  REMNANT_FROM,
  REMNANT_TO,
  remnantMix,
  sparkHalo,
  sparkLife,
  sparkOpacity,
  sparkRadius,
} from './motion'

describe('parseMotion', () => {
  it('falls back to the defaults for nothing, bad JSON and non-objects', () => {
    expect(parseMotion(null)).toEqual(DEFAULT_MOTION)
    expect(parseMotion('{')).toEqual(DEFAULT_MOTION)
    expect(parseMotion('[1]')).toEqual(DEFAULT_MOTION)
    expect(parseMotion('"on"')).toEqual(DEFAULT_MOTION)
  })

  it('keeps valid fields and replaces bad ones one by one', () => {
    expect(parseMotion(JSON.stringify({ on: false, size: 'huge', sparkSize: 'big', glitterSize: 2, speed: 'fast', glitter: 'no', circles: false }))).toEqual({
      ...DEFAULT_MOTION,
      on: false,
      sparkSize: 'big',
      speed: 'fast',
      circles: false,
    })
  })

  it('reads settings saved before the particle sizes existed', () => {
    expect(parseMotion(JSON.stringify({ on: true, fireworks: true, size: 'big', glitter: false, flow: true, speed: 'slow', circles: true }))).toEqual({
      ...DEFAULT_MOTION,
      size: 'big',
      glitter: false,
      speed: 'slow',
    })
  })

  it('returns a fresh object, never the default itself', () => {
    expect(parseMotion(null)).not.toBe(DEFAULT_MOTION)
  })
})

describe('isDefaultMotion', () => {
  it('is true only when every field matches', () => {
    expect(isDefaultMotion({ ...DEFAULT_MOTION })).toBe(true)
    expect(isDefaultMotion({ ...DEFAULT_MOTION, size: 'big' })).toBe(false)
  })
})

describe('activeMotion', () => {
  it('runs what is switched on', () => {
    expect(activeMotion({ ...DEFAULT_MOTION, circles: false }, false)).toEqual({ fireworks: true, flow: true, circles: false })
  })
  it('stills everything when the master switch is off', () => {
    expect(activeMotion({ ...DEFAULT_MOTION, on: false }, false)).toEqual({ fireworks: false, flow: false, circles: false })
  })
  it('lets the device reduce-motion setting win', () => {
    expect(activeMotion(DEFAULT_MOTION, true)).toEqual({ fireworks: false, flow: false, circles: false })
  })
})

describe('fireworks', () => {
  it('scales up with size, medium unchanged', () => {
    expect(fireworkScale('medium')).toBe(1)
    expect(fireworkScale('small')).toBeLessThan(1)
    expect(fireworkScale('big')).toBeGreaterThan(1)
  })
  it('sizes particles separately from the burst', () => {
    expect(particleScale('medium')).toBe(1)
    expect(particleScale('small')).toBeLessThan(1)
    expect(particleScale('big')).toBeGreaterThan(fireworkScale('big'))
  })
  it('without glitter, sparks are gone before the remnants would start lingering', () => {
    expect(sparkLife(false)[1]).toBeLessThan(sparkLife(true)[0])
  })
  it("turns sparks into glitter by the time since the burst, not by each spark's life", () => {
    expect(remnantMix(0)).toBe(0)
    expect(remnantMix(REMNANT_FROM)).toBe(0)
    const mid = (REMNANT_FROM + REMNANT_TO) / 2
    expect(remnantMix(mid)).toBeGreaterThan(0)
    expect(remnantMix(mid)).toBeLessThan(1)
    expect(remnantMix(REMNANT_TO)).toBe(1)
    expect(remnantMix(5000)).toBe(1)
    // Glitter-off sparks are gone by the time sparks would have become glitter.
    expect(sparkLife(false)[1]).toBeLessThanOrEqual(REMNANT_TO)
  })
  it('sizes a spark by spark size while it flies and by glitter size once it lingers', () => {
    expect(sparkRadius('big', 'small', 0)).toBe(particleScale('big'))
    expect(sparkRadius('big', 'small', REMNANT_TO)).toBeCloseTo(particleScale('small'), 9)
    expect(sparkRadius('big', 'tiny', 2000)).toBeCloseTo(particleScale('tiny'), 9)
    expect(sparkRadius('medium', 'medium', 600)).toBe(1)
  })
  it('offers a glitter size finer than any spark size', () => {
    expect(particleScale('tiny')).toBeLessThan(particleScale('small'))
    expect(parseMotion(JSON.stringify({ glitterSize: 'tiny' })).glitterSize).toBe('tiny')
    // Tiny is for glitter only; spark sizes stay Small / Medium / Big.
    expect(parseMotion(JSON.stringify({ sparkSize: 'tiny' })).sparkSize).toBe(DEFAULT_MOTION.sparkSize)
  })
  it('keeps glitter visible while it lingers and lets it flicker, while without glitter sparks just fade', () => {
    const age = 0.6
    const ms = REMNANT_TO + 100
    // With glitter the lingering spark holds near GLITTER_LEVEL, well above the old dim tail of
    // the flight fade that the remnants used to be.
    expect(sparkOpacity(age, ms, true)).toBeCloseTo(GLITTER_LEVEL * 0.78, 5)
    expect(sparkOpacity(0.65, ms, true)).toBeGreaterThan(sparkOpacity(0.65, ms, false) * 1.5)
    // The flicker moves it, but never to nothing and never above the level.
    expect(sparkOpacity(age, ms, true, 1)).toBeCloseTo(GLITTER_LEVEL, 5)
    expect(sparkOpacity(age, ms, true, -1)).toBeGreaterThan(0.2)
    // It fades out at the end of its life, and the flight itself is the same either way.
    expect(sparkOpacity(1, 2000, true)).toBe(0)
    expect(sparkOpacity(0.1, 100, true)).toBe(sparkOpacity(0.1, 100, false))
  })
  it('drops most of the glow as a spark becomes glitter, so the glitter size is what shows', () => {
    expect(sparkHalo(0)).toBe(1)
    expect(sparkHalo(REMNANT_TO)).toBeCloseTo(0.15, 5)
  })
})

describe('flow speed', () => {
  it('normal is the 16 s drift the buttons always had', () => {
    expect(FLOW_SECONDS.normal).toBe(16)
    expect(flowRate('normal')).toBe(1)
  })
  it('fast is clearly faster and slow clearly slower', () => {
    expect(flowRate('fast')).toBeGreaterThanOrEqual(3)
    expect(flowRate('slow')).toBeLessThanOrEqual(0.5)
    expect(flowRate('slow')).toBeLessThan(1)
    expect(FLOW_SECONDS.fast).toBeLessThan(FLOW_SECONDS.slow)
  })
})

describe('motionSummary', () => {
  it('names what is on', () => {
    expect(motionSummary(DEFAULT_MOTION, false)).toBe('Fireworks with glitter · Colour flow · Circles')
    expect(motionSummary({ ...DEFAULT_MOTION, glitter: false, speed: 'slow', circles: false }, false)).toBe('Fireworks · Slow colour flow')
  })
  it('says off, still, or why the device stops it', () => {
    expect(motionSummary({ ...DEFAULT_MOTION, on: false }, false)).toBe('Off')
    expect(motionSummary({ ...DEFAULT_MOTION, fireworks: false, flow: false, circles: false }, false)).toBe('All still')
    expect(motionSummary(DEFAULT_MOTION, true)).toMatch(/less motion/)
  })
})

describe('parsePreviewShown', () => {
  it('shows the preview unless it was turned off', () => {
    expect(parsePreviewShown(null)).toBe(true)
    expect(parsePreviewShown('on')).toBe(true)
    expect(parsePreviewShown('junk')).toBe(true)
    expect(parsePreviewShown('off')).toBe(false)
  })
})
