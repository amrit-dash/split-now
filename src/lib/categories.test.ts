import { describe, expect, it } from 'vitest'
import { CATEGORIES, guessCategory } from './categories'
import { QUICK_GROUP_TYPES } from '../../shared/quick-ai'
import { SHARED_TYPES } from './groupTypes'

// The functions keep their own copy of the list (no app imports there); read it so the two can't drift.
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }

describe('guessCategory (India)', () => {
  it.each([
    ['Swiggy order', 'food'],
    ['Zomato - Biryani Blues', 'food'],
    ['Chai at Chaayos', 'food'],
    ['Dhaba lunch on NH48', 'food'],
    ['Beach shack dinner', 'food'],
    ['Uber Eats', 'food'],
    ['Swiggy Instamart', 'groceries'],
    ['Zepto', 'groceries'],
    ['Blinkit', 'groceries'],
    ['BigBasket order', 'groceries'],
    ['DMart', 'groceries'],
    ['JioMart', 'groceries'],
    ['Ola to airport', 'transport'],
    ['Uber', 'transport'],
    ['Rapido bike', 'transport'],
    ['Petrol - IOCL', 'transport'],
    ['BPCL fuel', 'transport'],
    ['HP petrol pump', 'transport'],
    ['Scooty rental', 'transport'],
    ['FASTag recharge', 'transport'],
    ['Coca-Cola', null],
    ['IRCTC Tatkal', 'travel'],
    ['RedBus Bengaluru → Goa', 'travel'],
    ['MakeMyTrip hotel+flight', 'travel'],
    ['Goibibo', 'travel'],
    ['IndiGo flights BLR → GOI', 'travel'],
    ['OYO Rooms', 'stay'],
    ['Villa in Anjuna', 'stay'],
    ['BookMyShow', 'entertainment'],
    ['PVR IMAX', 'entertainment'],
    ['Parasailing', 'entertainment'],
    ['Jio Fiber', 'utilities'],
    ['Airtel postpaid', 'utilities'],
    ['BESCOM electricity', 'utilities'],
    ['ACT Fibernet broadband', 'utilities'],
    ['HP gas cylinder', 'utilities'],
    ['Society maintenance', 'utilities'],
    ['Rent — October', 'rent'],
    ['PG rent', 'rent'],
    ['Apollo Pharmacy', 'health'],
    ['cult.fit membership', 'health'],
    ['Flipkart', 'shopping'],
    ['Myntra', 'shopping'],
  ] as const)('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat)
  })

  it('still knows the Australian brands', () => {
    expect(guessCategory('Woolworths shop')).toBe('groceries')
    expect(guessCategory('Internet — NBN')).toBe('utilities')
  })
})

describe('guessCategory: everyday words', () => {
  it.each([
    // alcohol counts as food & drink
    ['Liquor store', 'food'],
    ['Wine at dinner party', 'food'],
    ['Whisky', 'food'],
    ['Daaru for the trip', 'food'],
    ['Theka run', 'food'],
    ['Beer', 'food'],
    // home staff and household services
    ['Maid salary', 'utilities'],
    ['Cook — October', 'utilities'],
    ['Laundry', 'utilities'],
    ['Dhobi', 'utilities'],
    ['Newspaper bill', 'utilities'],
    ['Ironing clothes', 'utilities'],
    // personal care
    ['Salon', 'health'],
    ['Haircut', 'health'],
    ['Spa day', 'health'],
    ['Foot massage', 'health'],
    // on the water, and getting to the airport
    ['Ferry to Havelock', 'transport'],
    ['Boat ride', 'transport'],
    ['Houseboat in Alleppey', 'stay'],
    ['Sunset cruise', 'travel'],
    ['Airport transfer', 'transport'],
    ['Ola to airport', 'transport'],
    ['Airport hotel', 'stay'],
    ['Tip', 'food'],
    ['Tips for the staff', 'food'],
    ['Taxi tip', 'transport'],
  ] as const)('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat)
  })

  it.each([
    ['Milkshake', 'food'],
    ['Milk', 'groceries'],
    ['Fruits', 'groceries'],
    ['Flea market', 'shopping'],
    ['Anjuna night market', 'shopping'],
    ['VISA POS 1234 STARBUCKS', 'food'],
    ['Visa on arrival', 'travel'],
    ['Thailand visa fee', 'travel'],
    ['Phone case', 'shopping'],
    ['Phone bill', 'utilities'],
    ['Mobile recharge', 'utilities'],
    ['Candy bar', null],
    ['Rooftop bar', 'food'],
    ['Public transport', null],
    ['Dinner in the Central Business District', 'food'],
    ['District movie tickets', 'entertainment'],
    ['Cookies', null],
    ['Presentation printouts', null],
  ] as const)('no false match: %s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat)
  })
})

describe('guessCategory: the newer categories', () => {
  it.each([
    // subscriptions
    ['Netflix', 'subscriptions'],
    ['Spotify Premium', 'subscriptions'],
    ['YouTube Premium', 'subscriptions'],
    ['Amazon Prime', 'subscriptions'],
    ['iCloud storage', 'subscriptions'],
    ['Disneyland tickets', 'entertainment'],
    ['Amazon order', 'shopping'],
    // education
    ['School fees', 'education'],
    ['Udemy course', 'education'],
    ['Coursera', 'education'],
    ['Tuition for Riya', 'education'],
    ['Exam fee', 'education'],
    // pets
    ['Vet visit', 'pets'],
    ['Pet food', 'pets'],
    ['Pedigree from Blinkit', 'pets'],
    ['Dog food', 'pets'],
    ['Pet grooming', 'pets'],
    ['Carpet cleaning', null],
    ['HP gas cylinder', 'utilities'],
    ['Petrol', 'transport'],
    ['Gym membership', 'health'],
  ] as const)('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat)
  })
})

describe('CATEGORIES', () => {
  it('has a label, an emoji and a colour for each, and fills the three-across picker evenly', () => {
    const all = Object.values(CATEGORIES)
    expect(all.length % 3).toBe(0)
    for (const c of all) {
      expect(c.label.length).toBeGreaterThan(2)
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(new Set(all.map((c) => c.emoji)).size).toBe(all.length)
    expect(new Set(all.map((c) => c.color)).size).toBe(all.length)
    expect(Object.keys(CATEGORIES).at(-1)).toBe('other')
  })
  it('matches the server’s list for AI answers (functions/src/lib/gemini.ts EXPENSE_CATEGORIES)', () => {
    const src = readFileSync(new URL('../../functions/src/lib/gemini.ts', import.meta.url), 'utf8')
    const block = src.slice(src.indexOf('export const EXPENSE_CATEGORIES'), src.indexOf('] as const', src.indexOf('export const EXPENSE_CATEGORIES')))
    const listed = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(listed).toEqual(Object.keys(CATEGORIES))
  })
  it('Quick add with AI may suggest every shared group type', () => {
    expect([...QUICK_GROUP_TYPES]).toEqual(SHARED_TYPES)
  })
})
