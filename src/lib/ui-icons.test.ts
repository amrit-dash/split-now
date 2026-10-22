import { describe, expect, it } from 'vitest'
import bold from '@/components/feature-art-bold'
import line from '@/components/feature-art-line'
import { isSceneGlyph, isUiIcon, SCENE_GLYPHS, UI_ICONS } from './ui-icons'

describe('ui-icons', () => {
  it('names are unique', () => {
    expect(new Set(UI_ICONS).size).toBe(UI_ICONS.length)
    expect(new Set(SCENE_GLYPHS).size).toBe(SCENE_GLYPHS.length)
  })
  it('every scene glyph is also a picture name', () => {
    for (const g of SCENE_GLYPHS) expect(isUiIcon(g), g).toBe(true)
    expect(isSceneGlyph('house')).toBe(true)
    expect(isSceneGlyph('wrench')).toBe(false)
    expect(isUiIcon('🏠')).toBe(false)
  })
  it('both styles have a drawing for every picture, and nothing else (scripts/icon-art.mjs)', () => {
    for (const art of [line, bold]) expect(Object.keys(art).sort()).toEqual([...UI_ICONS].sort())
  })
})
