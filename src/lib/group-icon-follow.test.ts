import { describe, expect, it } from 'vitest'
import { altsOffered, iconFollowsName, iconFromName, typeIconOffer } from './group-icon-follow'

const base = { editing: false, renamed: false, iconTouched: false, iconChosen: false, hasPicture: false }

describe('a group’s icon follows its name', () => {
  it('a new group: until an icon is chosen', () => {
    expect(iconFollowsName(base)).toBe(true)
    expect(iconFollowsName({ ...base, iconTouched: true })).toBe(false)
  })
  it('a saved group: once renamed, until an icon is chosen here, never over a picture', () => {
    const edit = { ...base, editing: true, iconTouched: true }
    expect(iconFollowsName(edit)).toBe(false)
    expect(iconFollowsName({ ...edit, renamed: true })).toBe(true)
    expect(iconFollowsName({ ...edit, renamed: true, iconChosen: true })).toBe(false)
    expect(iconFollowsName({ ...edit, renamed: true, hasPicture: true })).toBe(false)
  })
})

describe('the AI’s other icons and the type’s icon', () => {
  const pick = { title: 'Sri Lanka bees', emojis: ['🐝', '🇱🇰', '🍯'] }
  it('offers the AI’s others while the icon is one of its answer for this name', () => {
    expect(altsOffered(pick, { name: 'Sri Lanka bees', emoji: '🐝', picking: false })).toEqual(['🇱🇰', '🍯'])
    // picking one keeps the rest, the first pick among them
    expect(altsOffered(pick, { name: 'Sri Lanka bees', emoji: '🍯', picking: false })).toEqual(['🐝', '🇱🇰'])
    expect(altsOffered(pick, { name: 'Sri Lanka', emoji: '🐝', picking: false })).toEqual([])
    expect(altsOffered(pick, { name: 'Sri Lanka bees', emoji: '✈️', picking: false })).toEqual([])
    expect(altsOffered(pick, { name: 'Sri Lanka bees', emoji: '🐝', picking: true })).toEqual([])
    expect(altsOffered(null, { name: 'x', emoji: '🐝', picking: false })).toEqual([])
  })
  it('knows an icon the name gave', () => {
    expect(iconFromName('🏖️', '🏖️', null)).toBe(true)
    expect(iconFromName('🇱🇰', null, pick)).toBe(true)
    expect(iconFromName('✈️', '🏖️', pick)).toBe(false)
  })
  it('a type chosen after the name gave the icon offers its own, never swaps it in', () => {
    const base = { editing: false, typeChosen: true, fromName: true, typeIcon: '✈️', emoji: '🐝' }
    expect(typeIconOffer(base)).toBe('✈️')
    expect(typeIconOffer({ ...base, emoji: '✈️' })).toBeNull()
    expect(typeIconOffer({ ...base, fromName: false })).toBeNull()
    expect(typeIconOffer({ ...base, typeChosen: false })).toBeNull()
    expect(typeIconOffer({ ...base, editing: true })).toBeNull()
  })
})
