import { describe, expect, it } from 'vitest'
import {
  ALL_GROUP_ICONS,
  GROUP_TYPES,
  SHARED_TYPES,
  firstEmoji,
  groupTypeInfo,
  groupTypeOf,
  guessGroup,
  iconsFor,
  isGroupType,
  parseGroupType,
} from './groupTypes'

describe('guessGroup', () => {
  it('spots trips, with beach and mountain icons for known places', () => {
    expect(guessGroup('Goa trip')).toEqual({ type: 'trip', emoji: '🏖️' })
    expect(guessGroup('BALI 2026')).toEqual({ type: 'trip', emoji: '🏖️' })
    expect(guessGroup('Manali')).toEqual({ type: 'trip', emoji: '🏔️' })
    expect(guessGroup('Ladakh bike ride')).toEqual({ type: 'trip', emoji: '🏔️' })
    expect(guessGroup('Summer vacation')).toEqual({ type: 'trip', emoji: '✈️' })
  })
  it('spots homes', () => {
    for (const n of ['Koramangala flat', 'PG rent', 'Roommates', 'The house', 'Apartment 4B']) expect(guessGroup(n)?.type).toBe('home')
  })
  it('spots dinners and drinks as outings', () => {
    expect(guessGroup('Friday dinner')).toEqual({ type: 'outing', emoji: '🍽️' })
    expect(guessGroup('Sunday brunch')).toEqual({ type: 'outing', emoji: '🍽️' })
    expect(guessGroup('Drinks at Toit')).toEqual({ type: 'outing', emoji: '🍻' })
  })
  it('prefers the specific event over the generic party', () => {
    expect(guessGroup('Riya’s birthday party')).toEqual({ type: 'event', emoji: '🎂' })
    expect(guessGroup('Sangeet night')).toEqual({ type: 'event', emoji: '💍' })
    expect(guessGroup('Bachelor party')).toEqual({ type: 'event', emoji: '💍' })
  })
  it('spots office groups', () => {
    expect(guessGroup('Design team')).toEqual({ type: 'office', emoji: '💼' })
    expect(guessGroup('Work lunches')?.type).toBe('outing')
  })
  it('matches whole words only and returns null otherwise', () => {
    expect(guessGroup('')).toBeNull()
    expect(guessGroup('Misc')).toBeNull()
    expect(guessGroup('Goan')).toBeNull()
    expect(guessGroup('Teamwork')).toBeNull()
  })
})

describe('icon lists', () => {
  it('has no duplicates and puts the type’s icons first', () => {
    expect(new Set(ALL_GROUP_ICONS).size).toBe(ALL_GROUP_ICONS.length)
    const trip = iconsFor('trip')
    expect(trip.slice(0, 4)).toEqual(['✈️', '🏖️', '🏔️', '🏝️'])
    expect(new Set(trip).size).toBe(ALL_GROUP_ICONS.length)
    expect(iconsFor('outing')[0]).toBe('🍽️')
  })
  it('defaults each type to its first icon', () => {
    for (const t of Object.values(GROUP_TYPES)) expect(t.icons[0]).toBe(t.emoji)
  })
})

describe('parseGroupType and firstEmoji', () => {
  it('parses known types and falls back to trip', () => {
    expect(parseGroupType('office')).toBe('office')
    expect(parseGroupType('nope')).toBe('trip')
    expect(parseGroupType(null)).toBe('trip')
    expect(SHARED_TYPES).not.toContain('direct')
  })
  it('reads a stored type safely: unknown values become Other, never a crash', () => {
    expect(groupTypeOf({ type: 'home' })).toBe('home')
    expect(groupTypeOf({ type: 'banana' })).toBe('other')
    expect(groupTypeOf({ type: 42 })).toBe('other')
    expect(groupTypeOf({})).toBe('other')
    expect(groupTypeOf(null)).toBe('other')
    expect(groupTypeOf('personal')).toBe('personal')
    expect(groupTypeInfo({ type: 'banana' }).label).toBe('Other')
    expect(groupTypeInfo('couple').emoji).toBe('💞')
    expect(iconsFor('banana')[0]).toBe('📦')
    expect(isGroupType('toString')).toBe(false)
    expect(isGroupType('trip')).toBe(true)
  })
  it('takes the first emoji, keeping multi-codepoint ones whole', () => {
    expect(firstEmoji('🎸 band')).toBe('🎸')
    expect(firstEmoji('abc 👨‍👩‍👧 x')).toBe('👨‍👩‍👧')
    expect(firstEmoji('🇮🇳')).toBe('🇮🇳')
    expect(firstEmoji('hello')).toBeNull()
  })
})
