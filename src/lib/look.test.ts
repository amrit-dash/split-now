import { describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, effectiveLook, hintView, isLook, LOOK_CHOICES, LOOK_INFO, LOOKS, lookDetail, resolveLook, resolveLookChoice, showsAt } from './look'

describe('resolveLook', () => {
  it('keeps a known look and falls back to Full for anything else', () => {
    for (const l of LOOKS) expect(resolveLook(l)).toBe(l)
    expect(resolveLook(undefined)).toBe('full')
    expect(resolveLook('compact')).toBe(DEFAULT_LOOK)
    expect(isLook(3)).toBe(false)
  })
  it('every look has a label for the console', () => {
    for (const l of LOOKS) expect(LOOK_INFO[l].label).toBeTruthy()
  })
})

describe('hintView', () => {
  const h = { full: 'Long explanation.', short: 'Short.' }
  it('Full shows the full text inline', () => {
    expect(hintView('full', h)).toEqual({ text: 'Long explanation.', tip: null })
  })
  it('Tooltip moves the full text into the tip; a key hint also keeps its short line', () => {
    expect(hintView('tooltip', h)).toEqual({ text: null, tip: 'Long explanation.' })
    expect(hintView('tooltip', { ...h, tier: 'extra' })).toEqual({ text: null, tip: 'Long explanation.' })
    expect(hintView('tooltip', { ...h, tier: 'key' })).toEqual({ text: 'Short.', tip: 'Long explanation.' })
  })
  it('When needed shows the short text, or the full one when there is no short; drops extra', () => {
    expect(hintView('needed', h).text).toBe('Short.')
    expect(hintView('needed', { full: 'Only.' }).text).toBe('Only.')
    expect(hintView('needed', { ...h, tier: 'extra' }).text).toBeNull()
  })
  it('Minimal keeps only key hints, in their shortest form', () => {
    expect(hintView('minimal', h).text).toBeNull()
    expect(hintView('minimal', { ...h, tier: 'extra' }).text).toBeNull()
    expect(hintView('minimal', { ...h, tier: 'key' }).text).toBe('Short.')
    expect(hintView('minimal', { ...h, tier: 'key', min: 'S.' }).text).toBe('S.')
  })
  it('sets both text and tip only for a key hint in the Tooltip look', () => {
    for (const l of LOOKS)
      for (const tier of ['key', 'help', 'extra'] as const) {
        const v = hintView(l, { ...h, tier })
        expect(v.text !== null && v.tip !== null).toBe(l === 'tooltip' && tier === 'key')
      }
    expect(hintView('tooltip', { full: 'Only.', tier: 'key' })).toEqual({ text: 'Only.', tip: null })
  })
  it('a key hint is never dropped in any look', () => {
    for (const l of LOOKS) expect(hintView(l, { ...h, tier: 'key' }).text).not.toBeNull()
  })
})

describe('lookDetail / showsAt', () => {
  it('ranks Minimal < When needed < Full = Tooltip', () => {
    expect(lookDetail('minimal')).toBe(1)
    expect(lookDetail('needed')).toBe(2)
    expect(lookDetail('full')).toBe(3)
    expect(lookDetail('tooltip')).toBe(3)
  })
  it('a section needing detail 2 hides only in Minimal', () => {
    expect(showsAt('minimal', 2)).toBe(false)
    expect(showsAt('needed', 2)).toBe(true)
    expect(showsAt('tooltip', 2)).toBe(true)
    expect(showsAt('needed', 3)).toBe(false)
    expect(showsAt('minimal', 1)).toBe(true)
  })
})

describe('a person’s own choice', () => {
  it('follows the admin until the person picks a look', () => {
    expect(effectiveLook('minimal', 'app')).toBe('minimal')
    expect(effectiveLook('minimal', 'full')).toBe('full')
    expect(effectiveLook('full', 'tooltip')).toBe('tooltip')
  })
  it('reads anything unknown as following the app', () => {
    expect(resolveLookChoice('needed')).toBe('needed')
    expect(resolveLookChoice('app')).toBe('app')
    expect(resolveLookChoice('loud')).toBe('app')
    expect(resolveLookChoice(undefined)).toBe('app')
    expect(LOOK_CHOICES[0]).toBe('app')
  })
})
