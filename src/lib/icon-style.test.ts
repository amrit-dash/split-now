import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ICON_STYLE,
  effectiveIconStyle,
  ICON_STYLE_CHOICES,
  ICON_STYLE_INFO,
  ICON_STYLES,
  iconVariant,
  isIconStyle,
  isIconStyleChoice,
  resolveIconStyle,
  resolveIconStyleChoice,
  tabIconLook,
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

describe('iconVariant', () => {
  it('Outline draws line icons, Filled draws solid ones', () => {
    expect(iconVariant('outline')).toBe('line')
    expect(iconVariant('filled')).toBe('solid')
  })
  it('the place you are is solid in either style', () => {
    expect(iconVariant('outline', true)).toBe('solid')
    expect(iconVariant('filled', true)).toBe('solid')
  })
})

describe('tabIconLook', () => {
  it('the current tab is two-tone in Outline and solid in Filled; the rest follow the style', () => {
    expect(tabIconLook('outline', true)).toEqual({ solid: false, duo: true })
    expect(tabIconLook('filled', true)).toEqual({ solid: true, duo: false })
    expect(tabIconLook('outline', false)).toEqual({ duo: false })
    expect(tabIconLook('filled', false)).toEqual({ duo: false })
  })
})
