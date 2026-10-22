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
  GLINT_SCALE,
  glintAlpha,
  glintCount,
  glintLife,
  glintRadius,
  glintShape,
  particleScale,
  SPARK_LIFE,
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
    expect(activeMotion({ ...DEFAULT_MOTION, circles: false }, false)).toEqual({ fireworks: true, flow: true, circles: false, pro: true })
  })
  it('stills everything when the master switch is off', () => {
    expect(activeMotion({ ...DEFAULT_MOTION, on: false }, false)).toEqual({ fireworks: false, flow: false, circles: false, pro: false })
  })
  it('stills the Pro badges on their own switch, showing them still', () => {
    expect(activeMotion({ ...DEFAULT_MOTION, pro: false }, false).pro).toBe(false)
    expect(DEFAULT_MOTION.pro).toBe(true)
    expect(parseMotion(JSON.stringify({ pro: false })).pro).toBe(false)
    expect(parseMotion(JSON.stringify({ pro: 'no' })).pro).toBe(true)
  })
  it('lets the device reduce-motion setting win', () => {
    expect(activeMotion(DEFAULT_MOTION, true)).toEqual({ fireworks: false, flow: false, circles: false, pro: false })
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
  it('sparks live as long as they always did, whatever the glitter', () => {
    expect(SPARK_LIFE).toEqual([1300, 2200])
  })
})

describe('glitter: the flash of dots a burnt-out spark leaves', () => {
  it('leaves usually one dot, sometimes none, sometimes two', () => {
    expect(glintCount(0.1, 0.9)).toBe(1)
    expect(glintCount(0.9, 0.9)).toBe(0)
    expect(glintCount(0.1, 0.1)).toBe(2)
    expect(glintCount(0.9, 0.1)).toBe(1)
  })
  it('each dot is brief: 80–300 ms, mostly short', () => {
    expect(glintLife(0)).toBe(80)
    expect(glintLife(1)).toBe(300)
    expect(glintLife(0.5)).toBeLessThan(190)
  })
  it('rises fast, then falls away to nothing', () => {
    expect(glintAlpha(0, 200, false)).toBe(0)
    expect(glintAlpha(40, 200, false)).toBeCloseTo(1, 9)
    expect(glintAlpha(120, 200, false)).toBeGreaterThan(0)
    expect(glintAlpha(120, 200, false)).toBeLessThan(1)
    expect(glintAlpha(200, 200, false)).toBe(0)
    expect(glintAlpha(-5, 200, false)).toBe(0)
  })
  it('a blinking dot goes dark one 45 ms step in three', () => {
    expect(glintAlpha(60, 300, true)).toBe(0)
    expect(glintAlpha(60, 300, false)).toBeGreaterThan(0)
    expect(glintAlpha(100, 300, true)).toBeGreaterThan(0)
  })
  it('Glitter size sets the dot size, Tiny finest, never so small it vanishes', () => {
    expect(GLINT_SCALE.medium).toBe(1)
    expect(glintRadius(1, 'tiny')).toBeLessThan(glintRadius(1, 'small'))
    expect(glintRadius(1, 'small')).toBeLessThan(glintRadius(1, 'medium'))
    expect(glintRadius(1, 'medium')).toBeLessThan(glintRadius(1, 'big'))
    expect(glintRadius(0.1, 'tiny')).toBe(0.35)
  })
  it('Tiny is for glitter only; spark sizes stay Small / Medium / Big', () => {
    expect(parseMotion(JSON.stringify({ glitterSize: 'tiny' })).glitterSize).toBe('tiny')
    expect(parseMotion(JSON.stringify({ sparkSize: 'tiny' })).sparkSize).toBe(DEFAULT_MOTION.sparkSize)
  })
  it('Glitter shape: one kind, or a mix that is mostly dots with some of each other shape', () => {
    expect(glintShape('stars', 0.1)).toBe('star')
    expect(glintShape('curls', 0.9)).toBe('curl')
    expect(glintShape('dots', 0.99)).toBe('dot')
    expect(glintShape('streaks', 0)).toBe('streak')
    const mix = [0, 0.3, 0.6, 0.8, 0.95].map((r) => glintShape('mix', r))
    expect(mix).toEqual(['dot', 'dot', 'streak', 'star', 'curl'])
    expect(DEFAULT_MOTION.glitterShape).toBe('mix')
    expect(parseMotion(JSON.stringify({ glitterShape: 'stars' })).glitterShape).toBe('stars')
    expect(parseMotion(JSON.stringify({ glitterShape: 'hearts' })).glitterShape).toBe('mix')
  })
  it('twinkle is its own setting, off unless turned on', () => {
    expect(DEFAULT_MOTION.twinkle).toBe(false)
    expect(parseMotion(JSON.stringify({ twinkle: true })).twinkle).toBe(true)
    expect(parseMotion(JSON.stringify({ twinkle: 'yes' })).twinkle).toBe(false)
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
