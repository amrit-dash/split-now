import { describe, expect, it } from 'vitest'
import { guessCategory } from './categories'

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
