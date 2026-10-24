import { describe, expect, it } from 'vitest'
import { groundedAmount, lineAmounts } from './line-amounts'

describe('lineAmounts', () => {
  it('the amounts a line says', () => {
    expect(lineAmounts('groceries 640')).toEqual([640])
    expect(lineAmounts('dinner 1,200.50 with Priya')).toEqual([1200.5])
    expect(lineAmounts('petrol 2k Rohan paid')).toEqual([2000])
    expect(lineAmounts('deposit 1 lakh')).toEqual([100000])
    expect(lineAmounts('cab 600 I paid, Rahul owes 400')).toEqual([600, 400])
  })
  it('not dates, times, percents, ratios or counts', () => {
    expect(lineAmounts('lunch on 3rd October for 1262 rupees')).toEqual([1262])
    expect(lineAmounts('groceries 640 on 2 Oct')).toEqual([640])
    expect(lineAmounts('snacks 500 Rahul 30% Priya 70%')).toEqual([500])
    expect(lineAmounts('groceries 1500 split 60/40 with Meera')).toEqual([1500])
    expect(lineAmounts('lunch 2300, the share was 2x3')).toEqual([2300])
    expect(lineAmounts('hotel 9000 Rahul 2 shares Priya 1 share')).toEqual([9000])
    expect(lineAmounts('pizza 900 split 3 ways')).toEqual([900])
    expect(lineAmounts('split it 3 to 1, drinks 2000')).toEqual([2000])
  })
})

describe('groundedAmount: an AI amount is checked against the line', () => {
  it('kept when the line says it', () => expect(groundedAmount(600, 'cab 600 I paid, Rahul owes 400')).toBe(600))
  it('the line’s one amount when the AI dropped or changed it (Gemma, 24 Oct 2026)', () => {
    expect(groundedAmount(undefined, 'dinner 1200 with Rahul, I paid')).toBe(1200)
    expect(groundedAmount(420, 'groceries 640')).toBe(640)
    expect(groundedAmount(200, 'gave Rohan 100')).toBe(100)
  })
  it('“each” may be multiplied; several amounts leave the AI’s', () => {
    expect(groundedAmount(1500, '500 each for the tickets for me Rahul and Priya')).toBe(1500)
    expect(groundedAmount(1000, 'cab 600 I paid, Rahul owes 400')).toBe(1000)
  })
})
