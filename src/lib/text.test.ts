import { describe, expect, it } from 'vitest'
import { titleCase } from './text'

describe('titleCase', () => {
  it('capitalises each word, including accented and non-Latin letters', () => {
    expect(titleCase('TOIT brewpub')).toBe('Toit Brewpub')
    expect(titleCase('café de flore')).toBe('Café De Flore')
    expect(titleCase('swiggy (instamart)/blinkit & co')).toBe('Swiggy (Instamart)/Blinkit & Co')
    expect(titleCase('')).toBe('')
  })
})
