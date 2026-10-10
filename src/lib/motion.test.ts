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
  remnantMix,
  sparkLife,
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
  it('eases a spark from its spark size to its glitter size as it slows', () => {
    expect(remnantMix(0)).toBe(0)
    expect(remnantMix(0.3)).toBe(0)
    expect(remnantMix(0.5)).toBeGreaterThan(0)
    expect(remnantMix(0.5)).toBeLessThan(1)
    expect(remnantMix(0.65)).toBe(1)
    expect(remnantMix(1)).toBe(1)
    expect(sparkRadius('big', 'small', 0)).toBe(particleScale('big'))
    expect(sparkRadius('big', 'small', 0.9)).toBe(particleScale('small'))
    expect(sparkRadius('medium', 'medium', 0.5)).toBe(1)
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
