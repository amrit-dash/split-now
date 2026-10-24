import { describe, expect, it } from 'vitest'
import {
  firmUpPrefill,
  bindQuickPrefill,
  exactFromParts,
  matchName,
  mergeAiParse,
  nameMatches,
  parseNlExpense,
  toQuickPrefill,
  type NlContext,
} from './nl-expense'

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
  it('ordinals, years, times, phone numbers and percentages are not money', () => {
    expect(parse('2nd round 600')).toMatchObject({ amount: 60000, description: '2nd Round' })
    expect(parse('1st class ticket').amount).toBeUndefined()
    expect(parse('trip Oct 2026 hotel 5000')).toMatchObject({ amount: 500000 })
    expect(parse('fees 2026 oct').amount).toBeUndefined()
    expect(parse('31 Feb lunch').amount).toBeUndefined()
    expect(parse('dinner 2pm 500')).toMatchObject({ amount: 50000 })
    expect(parse('dinner at 7 for 800')).toMatchObject({ amount: 80000 })
    expect(parse('movie 2:30 450')).toMatchObject({ amount: 45000, description: 'Movie 2:30' })
    expect(parse('cab 14:00').amount).toBeUndefined()
    expect(parse('meeting at 7').amount).toBeUndefined()
    expect(parse('recharge 9876543210').amount).toBeUndefined()
    expect(parse('recharge 9876543210 299')).toMatchObject({ amount: 29900 })
    expect(parse('tip 10%').amount).toBeUndefined()
    expect(parse('tip 10 percent 1200')).toMatchObject({ amount: 120000 })
  })
  it('people counts set the split, not the amount', () => {
    expect(parse('pizza 600 for 3 people')).toMatchObject({ amount: 60000, ways: 3 })
    expect(parse('pizza 600 4 of us')).toMatchObject({ amount: 60000, ways: 4 })
    expect(parse('pizza 600 2 ppl')).toMatchObject({ amount: 60000, ways: 2, description: 'Pizza' })
    expect(parse('2 coffees 300')).toMatchObject({ amount: 30000, description: '2 Coffees' })
  })
  it('Indian notations, grouping, k and decimals', () => {
    expect(parse('thali 290/-')).toMatchObject({ amount: 29000, currency: 'INR', description: 'Thali' })
    expect(parse('thali rs290')).toMatchObject({ amount: 29000, description: 'Thali' })
    expect(parse('thali Rs. 290')).toMatchObject({ amount: 29000, description: 'Thali' })
    expect(parse('thali INR 290')).toMatchObject({ amount: 29000, description: 'Thali' })
    expect(parse('thali 290rs')).toMatchObject({ amount: 29000, description: 'Thali' })
    expect(parse('thali ₹ 290')).toMatchObject({ amount: 29000, description: 'Thali' })
    expect(parse('flight 1,200')).toMatchObject({ amount: 120000, description: 'Flight' })
    expect(parse('rent 1,20,000')).toMatchObject({ amount: 12000000, description: 'Rent' })
    expect(parse('rent 2k')).toMatchObject({ amount: 200000, description: 'Rent' })
    expect(parse('rent 1.5k')).toMatchObject({ amount: 150000 })
    expect(parse('lunch 290.50')).toMatchObject({ amount: 29050, description: 'Lunch' })
    expect(parse('dinner 1200, I paid')).toMatchObject({ amount: 120000, description: 'Dinner', payerExplicit: true })
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
  it('a date is read before the amount, so its day is never the amount', () => {
    const p = parse('lunch Oct 2 Cafe Blue')
    expect(p).toMatchObject({ description: 'Lunch Cafe Blue', date: '2026-10-02', confidence: 'low' })
    expect(p.amount).toBeUndefined()
    expect(parse('lunch 290 2nd Oct')).toMatchObject({ description: 'Lunch', amount: 29000, date: '2026-10-02' })
    expect(parse('lunch 290 on the 2nd of October')).toMatchObject({ description: 'Lunch', amount: 29000, date: '2026-10-02' })
    expect(parse('cab 450 on 2/10')).toMatchObject({ description: 'Cab', amount: 45000, date: '2026-10-02' })
    expect(parseNlExpense('cab 450 on 2/10', { ...ctx, dayFirst: false }).date).toBe('2026-02-10')
    expect(parse('hotel 02/10/2026 2500')).toMatchObject({ description: 'Hotel', amount: 250000, date: '2026-10-02' })
    expect(parse('chai 40 last fri')).toMatchObject({ description: 'Chai', amount: 4000, date: '2026-10-02' })
    expect(parse('movie 600 2 days ago')).toMatchObject({ description: 'Movie', amount: 60000, date: '2026-10-06' })
    expect(parse('dinner 900 last night with Rahul')).toMatchObject({ description: 'Dinner', date: '2026-10-07', participants: ['me', 'rahul'] })
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

describe('money received', () => {
  it('reads who received it, and keeps the rest as usual', () => {
    expect(parse('Rahul received 1000 flight refund split with everyone')).toMatchObject({
      received: true,
      payer: 'rahul',
      payerExplicit: true,
      amount: 100000,
    })
    expect(parse('I got back 500 from the hotel')).toMatchObject({ received: true, payer: 'me', amount: 50000 })
    expect(parse('received 300 cashback')).toMatchObject({ received: true, payer: 'me', amount: 30000 })
    expect(parse('reimbursement 2000 with Priya')).toMatchObject({ received: true, payer: 'me', participants: ['me', 'priya'] })
  })
  it('buying is still an expense', () => {
    expect(parse('I got pizza 500').received).toBeUndefined()
    expect(parse('dinner 1200, Rahul paid').received).toBeUndefined()
  })
  it('hands the form the flag', () => {
    expect(toQuickPrefill(parse('refund 500'), 'refund 500').received).toBe(true)
    expect(toQuickPrefill(parse('dinner 500'), 'dinner 500').received).toBeUndefined()
  })
})

describe('payments back', () => {
  it('to someone: paid / sent / gave / settled up by paying', () => {
    expect(parse('paid Rahul 500 back')).toMatchObject({ payment: { from: 'me', to: 'rahul' }, amount: 50000 })
    expect(parse('sent Priya 300')).toMatchObject({ payment: { from: 'me', to: 'priya' }, amount: 30000 })
    expect(parse('settled up with Rahul by paying 700')).toMatchObject({ payment: { from: 'me', to: 'rahul' }, amount: 70000 })
  })
  it('from someone: paid me / got N back from', () => {
    expect(parse('Priya paid me 200 back')).toMatchObject({ payment: { from: 'priya', to: 'me' }, amount: 20000 })
    expect(parse('got 800 back from Rahul')).toMatchObject({ payment: { from: 'rahul', to: 'me' }, amount: 80000 })
  })
  it('“paid 500 for chai” is a cost, not a payment', () => {
    expect(parse('paid 500 for chai').payment).toBeUndefined()
  })
})

describe('who paid, in other words', () => {
  it('pronouns point at the one other person named', () => {
    expect(parse('For lunch with Rahul bill was 1762 and they paid')).toMatchObject({
      description: 'Lunch',
      amount: 176200,
      payer: 'rahul',
      participants: ['me', 'rahul'],
    })
  })
  it('two people named: a choice; nobody: unclear', () => {
    expect(parse('dinner 900 with Rahul and Priya he paid').payerChoices).toEqual(['rahul', 'priya'])
    expect(parse('lunch 900 they paid').payerUnclear).toBe(true)
  })
  it('covered / on NAME', () => {
    expect(parse('coffee 300 Priya covered it').payer).toBe('priya')
    expect(parse('drinks 1200 on Rahul').payer).toBe('rahul')
  })
})

describe('uneven parts', () => {
  it('owes, percent, shares, ratio, pairs with a rest', () => {
    expect(parse('cab 600 I paid, Rahul owes 400').exact).toEqual({ rahul: 40000, me: 20000 })
    expect(parse('snacks 500 Rahul 30% Priya 70%').exact).toEqual({ rahul: 15000, priya: 35000 })
    expect(parse('hotel 9000 Rahul 2 shares Priya 1 share me 1 share').exact).toEqual({ rahul: 450000, priya: 225000, me: 225000 })
    expect(parse('groceries 1500 split 60/40 with Priya').exact).toEqual({ me: 90000, priya: 60000 })
    expect(parse('pizza 1000 Rahul 700 rest me').exact).toEqual({ rahul: 70000, me: 30000 })
  })
  it('one pair counts only when the line has a total besides it', () => {
    expect(parse('hotel 6000 Priya 4000').exact).toEqual({ priya: 400000, me: 200000 })
    expect(parse('lunch with Rahul 600').exact).toBeUndefined()
  })
  it('parts over the total are not exact', () => {
    expect(parse('cab 300 Rahul owes 400').exact).toBeUndefined()
  })
})

describe('exactFromParts', () => {
  it('amounts, then the rest to whoever shares without a part', () => {
    expect(exactFromParts(1000, [{ id: 'a', kind: 'amount', value: 700 }], null, ['a', 'b'], 'b')).toEqual({ a: 700, b: 300 })
  })
  it('percents round to the total', () => {
    const r = exactFromParts(
      1001,
      [
        { id: 'a', kind: 'percent', value: 50 },
        { id: 'b', kind: 'percent', value: 50 },
      ],
      null,
      ['a', 'b'],
      'a',
    )
    expect(Object.values(r ?? {}).reduce((x, y) => x + y, 0)).toBe(1001)
  })
  it('shares mixed with amounts, or over 100%, cannot be exact', () => {
    expect(
      exactFromParts(
        1000,
        [
          { id: 'a', kind: 'shares', value: 2 },
          { id: 'b', kind: 'amount', value: 100 },
        ],
        null,
        ['a', 'b'],
        'a',
      ),
    ).toBeNull()
    expect(
      exactFromParts(
        1000,
        [
          { id: 'a', kind: 'percent', value: 80 },
          { id: 'b', kind: 'percent', value: 30 },
        ],
        null,
        ['a', 'b'],
        'a',
      ),
    ).toBeNull()
  })
})

describe('names', () => {
  const two: NlContext = { ...ctx, members: [...ctx.members, { id: 'rahul2', name: 'Rahul Verma' }] }
  it('nameMatches gives every best fit', () => {
    expect(nameMatches('Rahul', two.members)).toEqual(['rahul', 'rahul2'])
    expect(nameMatches('Rahul Verma', two.members)).toEqual(['rahul2'])
    expect(nameMatches('Zed', two.members)).toEqual([])
  })
  it('a shared first name is noted, a full name is not', () => {
    expect(parseNlExpense('dinner 900 with Rahul', two).ambiguous).toEqual([{ token: 'Rahul', ids: ['rahul', 'rahul2'] }])
    const full = parseNlExpense('dinner 900 with Rahul Verma', two)
    expect(full).toMatchObject({ description: 'Dinner', participants: ['me', 'rahul2'] })
    expect(full.ambiguous).toBeUndefined()
  })
  it('a full name from another group is nobody here, not a namesake', () => {
    const p = parseNlExpense('dinner 900 with Rahul Verma', { ...ctx, knownNames: ['Rahul Verma'] })
    expect(p.unmatched).toEqual(['Rahul Verma'])
  })
  it('everyone except someone', () => {
    expect(parse('taxi 900 everyone except Samar').participants).toEqual(['me', 'rahul', 'priya'])
  })
  it('filler around a spoken amount leaves the description', () => {
    expect(parse('dinner the total came to 2400').description).toBe('Dinner')
    expect(parse('parking 50 paid').description).toBe('Parking')
  })
  it('toQuickPrefill carries exact parts', () => {
    expect(toQuickPrefill(parse('cab 600 I paid, Rahul owes 400'), 'x').exact).toEqual({ rahul: 40000, me: 20000 })
  })
})

describe('spoken stories (owner’s lines, 24 Oct 2026)', () => {
  it('someone left out in plain words: everyone else shares it, and “the rest” is nobody’s name', () => {
    const p = parse(
      'I just remembered I paid for lunch on 3rd October for 1262 rupees. It was split by all but I remember Priya was not a part of that lunch. Split it equally amongst the rest.',
    )
    expect(p).toMatchObject({ description: 'Lunch', amount: 126200, payer: 'me', date: '2026-10-03', participants: ['me', 'rahul', 'sam2'], unmatched: [] })
  })
  it('shares as a ratio with one other person: yours first, unless the line says who had more', () => {
    expect(parse('lunch with Rahul, I paid 2300, the share was 2x3').exact).toEqual({ me: 92000, rahul: 138000 })
    expect(parse('lunch with Rahul, I paid 2300, shares 3:2 where he had less').exact).toEqual({ me: 138000, rahul: 92000 })
    expect(parse('Me and Rahul went for lunch where I paid 2300 rupees but the share was 3x2, where they had more shares.').exact).toEqual({
      me: 92000,
      rahul: 138000,
    })
  })
})

describe('firmUpPrefill: what the phone was sure of wins over AI’s answer', () => {
  const ai = { text: 'x', description: 'Lunch', currency: 'INR', payer: 'me' }
  it('an amount AI dropped, parts AI made equal, the payer the line names, the date', () => {
    const local = parse('cab 600 Priya paid, Rahul owes 400 on 2 Oct')
    const out = firmUpPrefill({ ...ai, amount: undefined }, local)
    expect(out.amount).toBe(60000)
    expect(out.exact).toEqual(local.exact)
    expect(out.payer).toBe('priya')
    expect(out.date).toBe('2026-10-02')
  })
  it('who shares it, when AI said everyone and the line says otherwise', () => {
    const local = parse('dinner 1200, Priya wasn’t there')
    expect(firmUpPrefill({ ...ai, amount: 120000 }, local).participants).toEqual(['me', 'rahul', 'sam2'])
  })
  it('AI’s own reading stays where the phone wasn’t sure', () => {
    const local = parse('villa 3000, Rahul pays double')
    const out = firmUpPrefill({ ...ai, amount: 300000, exact: { me: 100000, rahul: 200000 }, participants: ['me', 'rahul'] }, local)
    expect(out.exact).toEqual({ me: 100000, rahul: 200000 })
  })
})
