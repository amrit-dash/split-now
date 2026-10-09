import { describe, expect, it } from 'vitest'
import { bindQuickPrefill, matchName, mergeAiParse, parseNlExpense, toQuickPrefill, type NlContext } from './nl-expense'

const ctx: NlContext = {
  members: [
    { id: 'me', name: 'Asha Rao' },
    { id: 'rahul', name: 'Rahul Sharma' },
    { id: 'priya', name: 'Priya' },
    { id: 'sam2', name: 'Samar Jain' },
  ],
  me: 'me',
  currency: 'INR',
  today: '2026-10-08',
}
const parse = (s: string) => parseNlExpense(s, ctx)

describe('the plan’s examples', () => {
  it('dinner 1200 with Rahul and Priya, I paid', () => {
    expect(parse('dinner 1200 with Rahul and Priya, I paid')).toMatchObject({
      description: 'Dinner',
      amount: 120000,
      currency: 'INR',
      payer: 'me',
      payerExplicit: true,
      participants: ['me', 'rahul', 'priya'],
      unmatched: [],
      confidence: 'high',
    })
  })
  it('Rahul paid 850 for cab, split 3 ways', () => {
    const p = parse('Rahul paid 850 for cab, split 3 ways')
    expect(p).toMatchObject({ description: 'Cab', amount: 85000, payer: 'rahul', payerExplicit: true, ways: 3, confidence: 'high' })
    expect(p.participants).toBeUndefined()
  })
  it('auto 240 only me', () => {
    expect(parse('auto 240 only me')).toMatchObject({ description: 'Auto', amount: 24000, payer: 'me', participants: ['me'], confidence: 'high' })
  })
})

describe('amounts and currencies', () => {
  it('reads symbols, codes, words, commas, decimals and k/lakh', () => {
    expect(parse('₹2,500 hotel').amount).toBe(250000)
    expect(parse('hotel rs. 2500').amount).toBe(250000)
    expect(parse('coffee $4.50')).toMatchObject({ amount: 450, currency: 'USD', description: 'Coffee' })
    expect(parse('lunch 1.2k')).toMatchObject({ amount: 120000, currency: 'INR' })
    expect(parse('deposit 1 lakh')).toMatchObject({ amount: 10000000, description: 'Deposit' })
    expect(parse('beers 45 euros')).toMatchObject({ amount: 4500, currency: 'EUR', description: 'Beers' })
    expect(parse('taxi 1200 yen')).toMatchObject({ amount: 1200, currency: 'JPY' })
    expect(parse('A$30 brunch')).toMatchObject({ amount: 3000, currency: 'AUD', description: 'Brunch' })
  })
  it('counts are not money', () => {
    expect(parse('pizza 600 for 3 people')).toMatchObject({ amount: 60000, description: 'Pizza' })
    expect(parse('2 pizzas 600 Priya paid')).toMatchObject({ amount: 60000, payer: 'priya', description: '2 Pizzas' })
    expect(parse('split 1500 4 ways')).toMatchObject({ amount: 150000, ways: 4 })
  })
  it('no amount is low confidence', () => {
    const p = parse('dinner with Rahul')
    expect(p).toMatchObject({ confidence: 'low', participants: ['me', 'rahul'], description: 'Dinner' })
    expect(p.amount).toBeUndefined()
  })
})

describe('people', () => {
  it('payer phrases', () => {
    expect(parse('hotel 2500 paid by Priya')).toMatchObject({ payer: 'priya', payerExplicit: true, description: 'Hotel' })
    expect(parse('Priya paid 300 for chai')).toMatchObject({ payer: 'priya', description: 'Chai' })
    expect(parse('chai 40')).toMatchObject({ payer: 'me', payerExplicit: false })
    expect(parse('Nobody paid 300 for chai')).toMatchObject({ payer: 'me', payerExplicit: false, description: 'Nobody Paid For Chai' })
  })
  it('participants: with adds me, for and between take the list as given', () => {
    expect(parse('hotel 2500 paid by Priya between me and Rahul')).toMatchObject({ payer: 'priya', participants: ['me', 'rahul'], description: 'Hotel' })
    expect(parse('coffee 90 for pri and rah')).toMatchObject({ participants: ['priya', 'rahul'], description: 'Coffee' })
    expect(parse('gift 500 for Priya')).toMatchObject({ participants: ['priya'], description: 'Gift' })
    expect(parse('dinner 900 with Samar')).toMatchObject({ participants: ['me', 'sam2'] })
  })
  it('"for cab" is a thing, not a person; an unknown name is reported', () => {
    const cab = parse('Rahul paid 850 for cab')
    expect(cab).toMatchObject({ description: 'Cab', unmatched: [] })
    expect(cab.participants).toBeUndefined()
    expect(parse('chai 40 with Sameer')).toMatchObject({ participants: ['me'], unmatched: ['Sameer'], confidence: 'medium', description: 'Chai' })
  })
  it('everyone and only', () => {
    expect(parse('snacks 400 with everyone').participants).toBeUndefined()
    expect(parse('snacks 400 only Rahul')).toMatchObject({ participants: ['rahul'], description: 'Snacks' })
    expect(parse('snacks 400 for me only')).toMatchObject({ participants: ['me'] })
  })
  it('fuzzy names', () => {
    expect(matchName('Rahul', ctx.members)).toBe('rahul')
    expect(matchName('sharma', ctx.members)).toBe('rahul')
    expect(matchName('rahulji', ctx.members)).toBe('rahul')
    expect(matchName('pri', ctx.members)).toBe('priya')
    expect(matchName('pr', ctx.members)).toBeUndefined()
    expect(matchName('Kiran', ctx.members)).toBeUndefined()
  })
})

describe('dates and hand-off', () => {
  it('day words', () => {
    expect(parse('lunch 300 yesterday')).toMatchObject({ date: '2026-10-07', description: 'Lunch' })
    expect(parse('lunch 300 today').date).toBe('2026-10-08')
    expect(parse('lunch 300 the day before yesterday').date).toBe('2026-10-06')
    expect(parse('lunch 300').date).toBeUndefined()
  })
  it('an amount alone is medium confidence with an empty description', () => {
    expect(parse('paid 500')).toMatchObject({ amount: 50000, description: '', confidence: 'medium' })
  })
  it('toQuickPrefill carries everything the form needs', () => {
    const p = parse('dinner 1200 with Rahul, I paid')
    expect(toQuickPrefill(p, 'dinner 1200 with Rahul, I paid', 'food')).toEqual({
      text: 'dinner 1200 with Rahul, I paid',
      description: 'Dinner',
      amount: 120000,
      currency: 'INR',
      payer: 'me',
      participants: ['me', 'rahul'],
      date: undefined,
      category: 'food',
    })
  })
})

describe('mergeAiParse', () => {
  it('fills only the gaps, resolving names the same way', () => {
    const local = parse('500 with Sameer')
    const merged = mergeAiParse(
      local,
      { description: 'momos', payer: 'Rahul', participants: ['me', 'Priya', 'Nobody'], category: 'food', date: '2026-10-01' },
      ctx,
    )
    expect(merged).toMatchObject({ description: 'Momos', amount: 50000, payer: 'rahul', payerExplicit: true, date: '2026-10-01', category: 'food' })
    // the local parse already had people ("with Sameer" → me + an unknown): the AI list is not applied over it, and the unknown name keeps it "medium"
    expect(merged.participants).toEqual(['me'])
    expect(merged.unmatched).toEqual(['Sameer'])
    expect(merged.confidence).toBe('medium')
    // a payer the text named is never overridden
    expect(mergeAiParse(parse('paid 500'), { payer: 'Rahul' }, ctx).payer).toBe('me')
  })
  it('amount from the AI is in hundredths of its currency', () => {
    const m = mergeAiParse(parse('dinner with Rahul'), { amount: 120000, currency: 'JPY', participants: ['Rahul'] }, ctx)
    expect(m).toMatchObject({ amount: 1200, currency: 'JPY', participants: ['me', 'rahul'] })
    expect(mergeAiParse(parse('x 1'), null, ctx)).toEqual(parse('x 1'))
  })
})

describe('bindQuickPrefill', () => {
  const before: NlContext = { members: [{ id: 'u', name: 'Asha' }], me: 'u', currency: 'INR', today: '2026-10-08' }
  const line = 'dinner 1200 with Rahul and Priya, Priya paid yesterday'
  const first = toQuickPrefill(parseNlExpense(line, before), `${line} in a new group Bali trip`, 'food')
  it('reads the people again once the group has members, keeping the rest', () => {
    const p = bindQuickPrefill(first, line, { ...ctx, currency: 'INR' })
    expect(p).toMatchObject({
      description: 'Dinner',
      amount: 120000,
      currency: 'INR',
      payer: 'priya',
      participants: ['me', 'rahul', 'priya'],
      date: '2026-10-07',
      category: 'food',
    })
    expect(p.text).toBe(`${line} in a new group Bali trip`)
  })
  it('an amount without a currency word follows the new group', () => {
    expect(bindQuickPrefill(first, line, { ...ctx, currency: 'JPY' })).toMatchObject({ amount: 1200, currency: 'JPY' })
  })
  it('a line with no amount keeps what was there', () => {
    const p = bindQuickPrefill({ ...first, amount: 5000 }, 'dinner with Rahul', ctx)
    expect(p).toMatchObject({ amount: 5000, currency: 'INR', payer: 'me', participants: ['me', 'rahul'] })
  })
})
