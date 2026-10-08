import type { GroupType } from '@/types'

export interface GroupTypeInfo {
  value: GroupType
  label: string
  emoji: string
  /** Icons offered first in the picker for this type (the first is the default). */
  icons: string[]
  /** Placeholder for the name field. */
  placeholder: string
  /** Label for the optional date window, or null when the type has no dates (still shown if a group already has some). */
  dates: string | null
  /** New groups of this type start with today as their date window (a dinner is usually today). */
  datesToday?: boolean
}

/** Every group type: shared ones (the chip row) first, then the two special ones. */
export const GROUP_TYPES: Record<GroupType, GroupTypeInfo> = {
  trip: { value: 'trip', label: 'Trip', emoji: '✈️', icons: ['✈️', '🏖️', '🏔️', '🏝️'], placeholder: 'e.g. Goa 2026', dates: 'Trip dates' },
  outing: { value: 'outing', label: 'Dinner / outing', emoji: '🍽️', icons: ['🍽️', '🍕', '🍻', '🍛'], placeholder: 'e.g. Friday dinner', dates: 'When', datesToday: true },
  event: { value: 'event', label: 'Event', emoji: '🎉', icons: ['🎉', '🎂', '💍', '🎵'], placeholder: 'e.g. Riya’s birthday', dates: 'Event dates' },
  home: { value: 'home', label: 'Home', emoji: '🏠', icons: ['🏠', '🏡', '🛋️', '🧺'], placeholder: 'e.g. Indiranagar flat', dates: null },
  couple: { value: 'couple', label: 'Couple', emoji: '💞', icons: ['💞', '❤️', '🥂'], placeholder: 'e.g. Us two', dates: null },
  office: { value: 'office', label: 'Office', emoji: '💼', icons: ['💼', '☕', '🏢'], placeholder: 'e.g. Design team', dates: null },
  other: { value: 'other', label: 'Other', emoji: '📦', icons: ['📦'], placeholder: 'Group name', dates: 'Dates' },
  direct: { value: 'direct', label: 'Friend (1:1)', emoji: '🤝', icons: ['🤝'], placeholder: 'Friend’s name (optional)', dates: null },
  personal: { value: 'personal', label: 'Personal', emoji: '👛', icons: ['👛'], placeholder: 'My spending', dates: null },
}

/** Types that are real groups (several people, invite link, dates); the chip row in the forms. */
export const SHARED_TYPES: GroupType[] = ['trip', 'outing', 'event', 'home', 'couple', 'office', 'other']

export const isSharedType = (t: GroupType) => SHARED_TYPES.includes(t)

/** Parses a ?type= value; anything unknown is a trip. */
export function parseGroupType(v: string | null | undefined): GroupType {
  return v && v in GROUP_TYPES ? (v as GroupType) : 'trip'
}

const EXTRA_ICONS = ['🚗', '🎿', '🏕️', '⚽', '🎓', '🌏', '🛕', '🚆', '🎮', '🐶']

/** Every icon the picker offers, each once: type icons first (in type order), then extras. */
export const ALL_GROUP_ICONS: string[] = [...new Set([...Object.values(GROUP_TYPES).flatMap((t) => t.icons), ...EXTRA_ICONS])]

/** The picker list for a type: that type's icons first, then everything else. */
export function iconsFor(type: GroupType): string[] {
  const first = GROUP_TYPES[type].icons
  return [...first, ...ALL_GROUP_ICONS.filter((e) => !first.includes(e))]
}

export interface GroupGuess { type: GroupType; emoji: string }

// First matching rule wins, so specific words (beach, birthday) come before generic ones (trip, party).
const RULES: Array<{ words: string[]; type: GroupType; emoji: string }> = [
  { words: ['birthday', 'bday'], type: 'event', emoji: '🎂' },
  { words: ['wedding', 'sangeet', 'mehendi', 'mehndi', 'haldi', 'bachelor', 'bachelorette', 'engagement'], type: 'event', emoji: '💍' },
  { words: ['concert', 'gig', 'festival', 'fest'], type: 'event', emoji: '🎵' },
  { words: ['goa', 'bali', 'beach', 'phuket', 'maldives', 'andaman', 'gokarna', 'pondicherry', 'varkala', 'island'], type: 'trip', emoji: '🏖️' },
  { words: ['manali', 'ladakh', 'leh', 'shimla', 'kashmir', 'spiti', 'himalaya', 'himalayas', 'trek', 'mountain', 'hills', 'ski', 'rishikesh', 'kasol'], type: 'trip', emoji: '🏔️' },
  { words: ['trip', 'vacation', 'holiday', 'travel', 'roadtrip', 'getaway', 'tour', 'weekend'], type: 'trip', emoji: '✈️' },
  { words: ['party', 'drinks', 'beer', 'beers', 'pub', 'bar', 'night'], type: 'outing', emoji: '🍻' },
  { words: ['dinner', 'lunch', 'brunch', 'breakfast', 'meal', 'food', 'pizza'], type: 'outing', emoji: '🍽️' },
  { words: ['flat', 'pg', 'roommates', 'roommate', 'roomies', 'flatmates', 'house', 'apartment', 'home', 'rent', 'hostel'], type: 'home', emoji: '🏠' },
  { words: ['office', 'team', 'work', 'colleagues'], type: 'office', emoji: '💼' },
]

/**
 * Best guess at a group's type and icon from its name ("Goa trip" → trip 🏖️), or null when no
 * keyword matches. Whole words only, case-insensitive; a plural "s"/"es" is ignored.
 */
export function guessGroup(name: string): GroupGuess | null {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (!words.length) return null
  const has = (w: string) => words.some((x) => x === w || x === `${w}s` || x === `${w}es`)
  const rule = RULES.find((r) => r.words.some(has))
  return rule ? { type: rule.type, emoji: rule.emoji } : null
}

/** The first emoji in free text ("🎸 band" → "🎸"), for the picker's "type any emoji" field. */
export function firstEmoji(text: string): string | null {
  const parts = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
    : [...text]
  return parts.find((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) ?? null
}
