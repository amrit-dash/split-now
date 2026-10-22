import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ICON_STYLE,
  effectiveIconStyle,
  ICON_STYLE_CHOICES,
  ICON_STYLE_INFO,
  ICON_STYLES,
  iconWeight,
  isIconStyle,
  isIconStyleChoice,
  resolveIconStyle,
  resolveIconStyleChoice,
} from './icon-style'

describe('resolveIconStyle', () => {
  it('keeps a known style and falls back to Outline for anything else', () => {
    for (const s of ICON_STYLES) expect(resolveIconStyle(s)).toBe(s)
    expect(resolveIconStyle(undefined)).toBe('outline')
    expect(resolveIconStyle('duotone')).toBe(DEFAULT_ICON_STYLE)
    expect(isIconStyle(1)).toBe(false)
  })
  it('every style has a label', () => {
    for (const s of ICON_STYLES) expect(ICON_STYLE_INFO[s].label).toBeTruthy()
  })
})

describe('resolveIconStyleChoice', () => {
  it('keeps app or a style, anything else follows the app', () => {
    for (const c of ICON_STYLE_CHOICES) expect(resolveIconStyleChoice(c)).toBe(c)
    expect(resolveIconStyleChoice(null)).toBe('app')
    expect(resolveIconStyleChoice('bold')).toBe('app')
    expect(isIconStyleChoice('app')).toBe(true)
  })
})

describe('effectiveIconStyle', () => {
  it('a person’s own choice wins over the admin’s default', () => {
    expect(effectiveIconStyle('outline', 'filled')).toBe('filled')
    expect(effectiveIconStyle('filled', 'outline')).toBe('outline')
  })
  it('app follows the admin', () => {
    expect(effectiveIconStyle('filled', 'app')).toBe('filled')
    expect(effectiveIconStyle('outline', 'app')).toBe('outline')
  })
})

describe('iconWeight', () => {
  it('Outline draws line icons, Filled draws solid ones', () => {
    expect(iconWeight('outline')).toBe('regular')
    expect(iconWeight('filled')).toBe('fill')
  })
  it('big feature pictures get a soft tint in Outline', () => {
    expect(iconWeight('outline', 'feature')).toBe('duotone')
    expect(iconWeight('filled', 'feature')).toBe('fill')
  })
  it('the place you are is solid in either style', () => {
    expect(iconWeight('outline', 'active')).toBe('fill')
    expect(iconWeight('filled', 'active')).toBe('fill')
  })
})
