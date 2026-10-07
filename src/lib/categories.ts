import type { Category } from '@/types'

export const CATEGORIES: Record<Category, { label: string; emoji: string; color: string }> = {
  food: { label: 'Food & drink', emoji: '🍔', color: '#f97316' },
  groceries: { label: 'Groceries', emoji: '🛒', color: '#84cc16' },
  transport: { label: 'Transport', emoji: '🚕', color: '#0ea5e9' },
  stay: { label: 'Accommodation', emoji: '🏨', color: '#8b5cf6' },
  entertainment: { label: 'Entertainment', emoji: '🎟️', color: '#ec4899' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#f43f5e' },
  utilities: { label: 'Utilities', emoji: '💡', color: '#eab308' },
  rent: { label: 'Rent', emoji: '🏠', color: '#14b8a6' },
  health: { label: 'Health', emoji: '💊', color: '#22c55e' },
  travel: { label: 'Flights & travel', emoji: '✈️', color: '#6366f1' },
  gifts: { label: 'Gifts', emoji: '🎁', color: '#d946ef' },
  other: { label: 'Other', emoji: '🧾', color: '#64748b' },
}

const KEYWORDS: Array<[Category, RegExp]> = [
  ['groceries', /grocer|woolworths|coles|aldi|iga|supermarket|costco|market/i],
  ['food', /food|dinner|lunch|breakfast|brunch|cafe|coffee|restaurant|pizza|burger|bar|pub|drinks|beer|uber ?eats|doordash|menulog|kfc|mcdonald|sushi/i],
  ['transport', /uber|taxi|cab|lyft|didi|ola|fuel|petrol|gas|parking|toll|train|bus|metro|opal|myki|car hire|rental car/i],
  ['stay', /hotel|airbnb|hostel|motel|resort|booking\.com|accommodation|villa/i],
  ['travel', /flight|airline|qantas|jetstar|virgin|airport|visa|luggage/i],
  ['entertainment', /movie|cinema|concert|ticket|netflix|spotify|game|bowling|club|museum|tour/i],
  ['utilities', /electric|power|water|gas bill|internet|wifi|nbn|phone|mobile|optus|telstra/i],
  ['rent', /rent|bond|lease/i],
  ['health', /pharmacy|chemist|doctor|medical|dentist|gym/i],
  ['shopping', /amazon|kmart|target|ikea|clothes|shopping|bunnings/i],
  ['gifts', /gift|present|birthday/i],
]

export function guessCategory(description: string): Category | null {
  for (const [cat, re] of KEYWORDS) if (re.test(description)) return cat
  return null
}
