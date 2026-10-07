import { describe, expect, it } from 'vitest'
import { guessCategory } from './categories'

describe('guessCategory (India)', () => {
  it.each([
    ['Swiggy order', 'food'], ['Zomato - Biryani Blues', 'food'], ['Chai at Chaayos', 'food'], ['Dhaba lunch on NH48', 'food'],
    ['Beach shack dinner', 'food'], ['Uber Eats', 'food'],
    ['Swiggy Instamart', 'groceries'], ['Zepto', 'groceries'], ['Blinkit', 'groceries'], ['BigBasket order', 'groceries'], ['DMart', 'groceries'], ['JioMart', 'groceries'],
    ['Ola to airport', 'transport'], ['Uber', 'transport'], ['Rapido bike', 'transport'], ['Petrol - IOCL', 'transport'], ['BPCL fuel', 'transport'],
    ['HP petrol pump', 'transport'], ['Scooty rental', 'transport'], ['FASTag recharge', 'transport'], ['Coca-Cola', null],
    ['IRCTC Tatkal', 'travel'], ['RedBus Bengaluru → Goa', 'travel'], ['MakeMyTrip hotel+flight', 'travel'], ['Goibibo', 'travel'], ['IndiGo flights BLR → GOI', 'travel'],
    ['OYO Rooms', 'stay'], ['Villa in Anjuna', 'stay'],
    ['BookMyShow', 'entertainment'], ['PVR IMAX', 'entertainment'], ['Parasailing', 'entertainment'],
    ['Jio Fiber', 'utilities'], ['Airtel postpaid', 'utilities'], ['BESCOM electricity', 'utilities'], ['ACT Fibernet broadband', 'utilities'], ['HP gas cylinder', 'utilities'], ['Society maintenance', 'utilities'],
    ['Rent — October', 'rent'], ['PG rent', 'rent'],
    ['Apollo Pharmacy', 'health'], ['cult.fit membership', 'health'],
    ['Flipkart', 'shopping'], ['Myntra', 'shopping'],
  ] as const)('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat)
  })

  it('still knows the Australian brands', () => {
    expect(guessCategory('Woolworths shop')).toBe('groceries')
    expect(guessCategory('Internet — NBN')).toBe('utilities')
  })
})
