import { describe, expect, it } from 'vitest'
import {
  ADVANCED_ICON_COUNT,
  burstDots,
  formatIconPick,
  MODE_SWITCH,
  modeButtonLabel,
  modeIconKey,
  modeSwitchMotion,
  modeSwitchToast,
  otherMode,
  parseIconPick,
  pickAdvancedIcon,
  settleIconPick,
} from './mode-icon'

describe('pickAdvancedIcon', () => {
  it('covers every picture with no previous one', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => pickAdvancedIcon(i / 50, null)))
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
  })
  it('never repeats the previous picture, and can reach all the others', () => {
    for (let prev = 0; prev < ADVANCED_ICON_COUNT; prev++) {
      const seen = new Set(Array.from({ length: 40 }, (_, i) => pickAdvancedIcon(i / 40, prev)))
      expect(seen.has(prev)).toBe(false)
      expect(seen.size).toBe(ADVANCED_ICON_COUNT - 1)
    }
  })
  it('stays in range at the edges and for a bad previous value', () => {
    expect(pickAdvancedIcon(0, null)).toBe(0)
    expect(pickAdvancedIcon(1, null)).toBe(4)
    expect(pickAdvancedIcon(0.999, 4)).toBe(3)
    expect(pickAdvancedIcon(-1, 0)).toBe(1)
    expect(pickAdvancedIcon(0.5, 9)).toBe(2)
  })
})

describe('stored pick', () => {
  it('round-trips and rejects junk', () => {
    expect(parseIconPick('3')).toEqual({ index: 3, spent: false })
    expect(parseIconPick('2-')).toEqual({ index: 2, spent: true })
    expect(formatIconPick({ index: 2, spent: true })).toBe('2-')
    expect(formatIconPick({ index: 0, spent: false })).toBe('0')
    for (const bad of [null, undefined, '', '5', '-1', 'x', '1--', '12']) expect(parseIconPick(bad)).toBeNull()
  })
})

describe('settleIconPick', () => {
  it('Advanced with nothing stored picks one', () => {
    expect(settleIconPick('advanced', null, 0.5)).toEqual({ index: 2, spent: false })
  })
  it('Advanced keeps a current pick', () => {
    expect(settleIconPick('advanced', { index: 1, spent: false }, 0.9)).toBeNull()
  })
  it('Advanced after Simple picks a different one', () => {
    const next = settleIconPick('advanced', { index: 1, spent: true }, 0.3)
    expect(next?.spent).toBe(false)
    expect(next?.index).not.toBe(1)
  })
  it('Simple marks the pick spent, once', () => {
    expect(settleIconPick('simple', { index: 4, spent: false }, 0)).toEqual({ index: 4, spent: true })
    expect(settleIconPick('simple', { index: 4, spent: true }, 0)).toBeNull()
    expect(settleIconPick('simple', null, 0)).toBeNull()
  })
})

describe('labels', () => {
  it('names the mode and what a tap does', () => {
    expect(modeButtonLabel('simple')).toBe('Mode: Simple. Switch to Advanced')
    expect(modeButtonLabel('advanced')).toBe('Mode: Advanced. Switch to Simple')
    expect(otherMode('simple')).toBe('advanced')
  })
  it('toasts plain lines, no exclamation marks', () => {
    expect(modeSwitchToast('simple')).toBe('Simple: everyday features')
    expect(modeSwitchToast('advanced')).toBe('Advanced: every feature and setting')
  })
  it('draws the leaf in Simple and the pick in Advanced', () => {
    expect(modeIconKey('simple', { index: 3, spent: false })).toBe('simple')
    expect(modeIconKey('advanced', { index: 3, spent: false })).toBe(3)
    expect(modeIconKey('advanced', null)).toBe(0)
  })
})

describe('modeSwitchMotion', () => {
  it('animates only a real switch with motion allowed', () => {
    expect(modeSwitchMotion({ firstRender: false, reduced: false, motionOn: true })).toBe('animate')
    expect(modeSwitchMotion({ firstRender: true, reduced: false, motionOn: true })).toBe('instant')
    expect(modeSwitchMotion({ firstRender: false, reduced: true, motionOn: true })).toBe('instant')
    expect(modeSwitchMotion({ firstRender: false, reduced: false, motionOn: false })).toBe('instant')
  })
  it('keeps the board timeline in order', () => {
    const t = MODE_SWITCH
    expect(t.enterAt).toBeLessThan(t.exit)
    expect(t.overshootAt).toBeLessThan(t.settleAt)
    expect(t.settleAt).toBeLessThan(t.fillUntil)
    expect(t.fillUntil).toBeLessThan(t.lineAt)
    expect(Math.max(t.lineAt, t.dotsAt + t.dotsFor, t.washAt + t.washFor)).toBeLessThanOrEqual(t.total)
  })
})

describe('burstDots', () => {
  it('ten dots, alternating colours, 20 to 32 px out', () => {
    const d = burstDots()
    expect(d).toHaveLength(10)
    expect(d.filter((x) => x.tone === 'brand')).toHaveLength(5)
    expect(d[0].tone).toBe('brand')
    expect(d[1].tone).toBe('duo')
    for (const x of d) {
      const r = Math.hypot(x.dx, x.dy)
      expect(r).toBeGreaterThanOrEqual(19.9)
      expect(r).toBeLessThanOrEqual(32.1)
    }
  })
})
