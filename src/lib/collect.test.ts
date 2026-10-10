import { describe, expect, it } from 'vitest'
import { clearedFor, homeKey, inHome, paidIn, PAY_TOLERANCE, payInLine, personOf, planInHome, toleranceBand } from './collect'
import { personBalances, type SettleRow } from './settleAll'

// $12.50 owed, paid in rupees at 83.6 INR per USD: 1 INR = 1/83.6 USD.
const USD_PER_INR = 1 / 83.6

describe('clearedFor (one debt paid in another currency)', () => {
  it('clears the debt in full at the exact conversion', () => {
    const c = clearedFor(104500, 1250, 'USD', 'INR', USD_PER_INR)
    expect(c.expected).toBe(104500)
    expect(c).toMatchObject({ cleared: 1250, status: 'full' })
  })
  it('clears in full within ±4% (a bank or UPI app rate), and no further', () => {
    const [lo, hi] = toleranceBand(104500)
    expect(PAY_TOLERANCE).toBe(0.04)
    expect([lo, hi]).toEqual([100320, 108680])
    expect(clearedFor(106000, 1250, 'USD', 'INR', USD_PER_INR)).toMatchObject({ cleared: 1250, status: 'full' })
    expect(clearedFor(lo, 1250, 'USD', 'INR', USD_PER_INR).status).toBe('full')
    expect(clearedFor(hi, 1250, 'USD', 'INR', USD_PER_INR).status).toBe('full')
  })
  it('a smaller payment clears only what it is worth: ₹4.50 against $12.50 clears $0.05', () => {
    expect(clearedFor(450, 1250, 'USD', 'INR', USD_PER_INR)).toMatchObject({ cleared: 5, status: 'part' })
    // Just under the band: a part payment, never the whole debt.
    const c = clearedFor(100319, 1250, 'USD', 'INR', USD_PER_INR)
    expect(c.status).toBe('part')
    expect(c.cleared).toBeLessThan(1250)
  })
  it('refuses more than owed beyond the band, and nothing for nothing', () => {
    expect(clearedFor(108681, 1250, 'USD', 'INR', USD_PER_INR).status).toBe('over')
    expect(clearedFor(0, 1250, 'USD', 'INR', USD_PER_INR)).toMatchObject({ cleared: 0, status: 'none' })
    expect(clearedFor(1, 1250, 'USD', 'INR', USD_PER_INR)).toMatchObject({ cleared: 0, status: 'none' })
    expect(clearedFor(500, 0, 'USD', 'INR', USD_PER_INR).status).toBe('none')
  })
  it('handles currencies without decimals (JPY)', () => {
    // ¥2,000 owed (0 decimals), paid in INR at 0.56 INR per JPY.
    const c = clearedFor(112000, 2000, 'JPY', 'INR', 1 / 0.56)
    expect(c.expected).toBe(112000)
    expect(c.status).toBe('full')
  })
})

describe('paidIn', () => {
  it('records the currency, amount, a tidy rate and the rate date', () => {
    expect(paidIn('INR', 104500, 1 / 83.6, '2026-10-10')).toEqual({
      currency: 'INR',
      amount: 104500,
      rate: 0.01196172249,
      rateDate: '2026-10-10',
      source: 'ecb',
    })
  })
})

const row = (o: Partial<SettleRow> & Pick<SettleRow, 'key' | 'currency' | 'amount' | 'dir'>): SettleRow => ({
  groupId: o.key,
  groupName: o.key,
  groupEmoji: '✈️',
  me: 'me',
  memberId: 't2',
  name: 'Test User 2',
  color: '#f97316',
  uid: 'u2',
  href: `/groups/${o.key}/settle`,
  ...o,
})

describe('inHome (Collect in my currency on Balances)', () => {
  const rows = [
    row({ key: 'kerala', currency: 'INR', amount: 154000, dir: 'owed' }),
    row({ key: 'test', currency: 'USD', amount: 1250, dir: 'owed' }),
    row({ key: 'goa', currency: 'INR', amount: 50000, dir: 'owed', memberId: 'r', name: 'Rohan', uid: 'ur' }),
  ]
  const people = personBalances(rows)

  it('folds the same person’s dollars and rupees into one ≈ rupee balance', () => {
    const out = inHome(people, 'INR', { USD: { rate: 83.6 } })
    const t2 = out.find((p) => p.key === homeKey('u:u2'))!
    expect(t2).toMatchObject({ currency: 'INR', net: 154000 + 104500, approx: true })
    expect(t2.parts.map((r) => r.key).sort()).toEqual(['kerala', 'test'])
    expect(t2.home).toEqual({ kerala: 154000, test: 104500 })
    // Someone only in rupees is unchanged.
    expect(out.find((p) => p.name === 'Rohan')).toMatchObject({ key: 'u:ur|INR', approx: false, net: 50000 })
  })
  it('keeps the currencies apart when a rate is missing (offline)', () => {
    const out = inHome(people, 'INR', { USD: null })
    expect(
      out
        .filter((p) => personOf(p.key) === 'u:u2')
        .map((p) => p.key)
        .sort(),
    ).toEqual(['u:u2|INR', 'u:u2|USD'])
    expect(out.every((p) => !p.approx)).toBe(true)
  })
  it('nets directions across currencies (you owe in one, they owe in another)', () => {
    const mixed = personBalances([row({ key: 'a', currency: 'INR', amount: 20000, dir: 'owe' }), row({ key: 'b', currency: 'USD', amount: 1000, dir: 'owed' })])
    const [p] = inHome(mixed, 'INR', { USD: { rate: 83.6 } })
    expect(p.net).toBe(83600 - 20000)
  })
})

describe('planInHome (one rupee payment across groups and currencies)', () => {
  const people = personBalances([
    row({ key: 'kerala', currency: 'INR', amount: 154000, dir: 'owed' }),
    row({ key: 'test', currency: 'USD', amount: 1250, dir: 'owed' }),
  ])
  const [p] = inHome(people, 'INR', { USD: { rate: 83.6 } })

  it('the full ≈ total clears every group exactly, each in its own currency', () => {
    const plan = planInHome(p, 258500)
    expect(plan.status).toBe('full')
    expect(plan.clearsAll).toBe(true)
    expect(plan.parts.find((x) => x.key === 'test')).toMatchObject({ amount: 1250, left: 0, paid: 104500 })
    expect(plan.parts.find((x) => x.key === 'kerala')).toMatchObject({ amount: 154000, left: 0, paid: 154000 })
  })
  it('within 4% still clears all, and the money moved adds up to what was paid', () => {
    const plan = planInHome(p, 262000)
    expect(plan.status).toBe('full')
    expect(plan.clearsAll).toBe(true)
    expect(plan.parts.reduce((s, x) => s + x.paid, 0)).toBe(262000)
  })
  it('a part payment lowers every group by the same share; never clears more than owed', () => {
    const plan = planInHome(p, 129250)
    expect(plan.status).toBe('part')
    expect(plan.clearsAll).toBe(false)
    const usd = plan.parts.find((x) => x.key === 'test')!
    const inr = plan.parts.find((x) => x.key === 'kerala')!
    expect(usd.amount).toBe(625)
    expect(inr.amount).toBe(77000)
    expect(usd.paid + inr.paid).toBe(129250)
  })
  it('refuses a payment past the band', () => {
    expect(planInHome(p, 300000).status).toBe('over')
    expect(planInHome(p, 0).status).toBe('none')
  })
  it('groups running the other way are netted, with no money for them', () => {
    const mixed = personBalances([row({ key: 'a', currency: 'INR', amount: 20000, dir: 'owe' }), row({ key: 'b', currency: 'USD', amount: 1000, dir: 'owed' })])
    const [m] = inHome(mixed, 'INR', { USD: { rate: 83.6 } })
    const plan = planInHome(m, 63600)
    expect(plan.clearsAll).toBe(true)
    expect(plan.parts.find((x) => x.key === 'a')).toMatchObject({ counter: true, paid: 0, amount: 20000 })
    expect(plan.parts.find((x) => x.key === 'b')).toMatchObject({ counter: false, paid: 63600, amount: 1000 })
  })
})

describe('payInLine', () => {
  const pay = (m: number) => `₹${(m / 100).toFixed(2)}`
  const usd = (m: number) => `$${(m / 100).toFixed(2)}`
  it('says what a converted payment clears, in plain words', () => {
    expect(payInLine(clearedFor(104500, 1250, 'USD', 'INR', USD_PER_INR), 104500, 1250, pay, usd)).toBe('Clears $12.50 in full')
    expect(payInLine(clearedFor(106000, 1250, 'USD', 'INR', USD_PER_INR), 106000, 1250, pay, usd)).toBe('Clears $12.50 in full (within 4% of ₹1045.00)')
    expect(payInLine(clearedFor(450, 1250, 'USD', 'INR', USD_PER_INR), 450, 1250, pay, usd)).toBe('₹4.50 clears $0.05 of $12.50. $12.45 stays owed.')
    expect(payInLine(clearedFor(200000, 1250, 'USD', 'INR', USD_PER_INR), 200000, 1250, pay, usd)).toBe(
      'More than the ₹1045.00 owed. Lower it, or pay the rest separately.',
    )
    expect(payInLine(clearedFor(0, 1250, 'USD', 'INR', USD_PER_INR), 0, 1250, pay, usd)).toBe('₹1045.00 clears $12.50')
  })
})
