import { describe, expect, it } from 'vitest'
import { GENERIC_LINES, dayPart, firstName, greeting, localDayNumber, pickSubline, stateLines, topCounterparties, type DebtGroup } from './greeting'

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0)

describe('dayPart', () => {
  it('maps local hours to parts of the day', () => {
    expect(dayPart(0)).toBe('lateNight')
    expect(dayPart(4)).toBe('lateNight')
    expect(dayPart(5)).toBe('earlyMorning')
    expect(dayPart(7)).toBe('earlyMorning')
    expect(dayPart(8)).toBe('morning')
    expect(dayPart(11)).toBe('morning')
    expect(dayPart(12)).toBe('afternoon')
    expect(dayPart(16)).toBe('afternoon')
    expect(dayPart(17)).toBe('evening')
    expect(dayPart(21)).toBe('evening')
    expect(dayPart(22)).toBe('lateNight')
    expect(dayPart(23)).toBe('lateNight')
  })
})

describe('firstName', () => {
  it('takes the first word, or the email local part', () => {
    expect(firstName('Amrit Singh')).toBe('Amrit')
    expect(firstName('  Priya  ')).toBe('Priya')
    expect(firstName('rohan@example.com')).toBe('rohan')
    expect(firstName('')).toBe('there')
    expect(firstName(undefined)).toBe('there')
  })
})

describe('subline', () => {
  it('is the same all day and changes with the date', () => {
    const a = pickSubline({}, at(2026, 10, 7, 6))
    expect(pickSubline({}, at(2026, 10, 7, 23))).toBe(a)
    const week = new Set([1, 2, 3, 4, 5, 6, 7].map((d) => pickSubline({}, at(2026, 10, d))))
    expect(week.size).toBeGreaterThan(1)
    for (const l of week) expect(GENERIC_LINES).toContain(l)
  })

  it('local day number ticks at local midnight', () => {
    expect(localDayNumber(at(2026, 10, 8, 0)) - localDayNumber(at(2026, 10, 7, 23))).toBe(1)
  })

  it('uses real state when there is some', () => {
    const s = { inbox: 3, liveTrips: [{ name: 'Goa Trip', emoji: '🏖️' }], owedBy: { name: 'Priya', amount: '₹1,200' }, settled: false }
    expect(stateLines(s)).toEqual([
      '3 payments to sort in your inbox 📥',
      'Goa Trip is live today 🏖️',
      'Priya owes you ₹1,200 💸',
    ])
    const days = [1, 2, 3, 4, 5, 6].map((d) => pickSubline(s, at(2026, 10, d)))
    for (const l of days) expect(stateLines(s)).toContain(l)
    expect(new Set(days).size).toBe(3)
  })

  it('singulars and settled', () => {
    expect(stateLines({ inbox: 1, needsOk: 1 })).toEqual(['1 payment to sort in your inbox 📥', '1 expense waiting for your OK 👀'])
    expect(stateLines({ settled: true })).toEqual(['You’re all settled up ✨'])
    expect(pickSubline({ settled: true }, at(2026, 1, 1))).toBe('You’re all settled up ✨')
  })
})

describe('greeting', () => {
  it('combines salutation, emoji and first name', () => {
    expect(greeting('Amrit Singh', {}, at(2026, 10, 7, 9))).toMatchObject({ salutation: 'Good morning', emoji: '☀️', name: 'Amrit' })
    expect(greeting('Amrit', {}, at(2026, 10, 7, 6)).salutation).toBe('Rise and shine')
    expect(greeting('Amrit', {}, at(2026, 10, 7, 14)).salutation).toBe('Good afternoon')
    expect(greeting('Amrit', {}, at(2026, 10, 7, 19)).salutation).toBe('Good evening')
    expect(greeting('Amrit', {}, at(2026, 10, 7, 1)).emoji).toBe('🌙')
  })
})

describe('topCounterparties', () => {
  const members = { me: { name: 'Me', uid: 'u-me' }, p: { name: 'Priya Shah', uid: 'u-p' }, r: { name: 'Rohan' } }
  const g = (debts: DebtGroup['debts'], extra: Partial<DebtGroup> = {}): DebtGroup => ({ currency: 'INR', me: 'me', members, debts, ...extra })
  it('sums per person across groups and picks the largest each way', () => {
    const res = topCounterparties([
      g([{ from: 'p', to: 'me', amount: 70000 }, { from: 'me', to: 'r', amount: 20000 }]),
      g([{ from: 'p', to: 'me', amount: 50000 }]),
      g([{ from: 'p', to: 'me', amount: 99999 }], { currency: 'USD' }),
      g([{ from: 'p', to: 'r', amount: 99999 }]),
    ], 'INR')
    expect(res).toEqual({ owedBy: { name: 'Priya', amount: 120000 }, owes: { name: 'Rohan', amount: 20000 } })
  })
  it('nets out opposite debts and ignores personal groups', () => {
    expect(topCounterparties([
      g([{ from: 'p', to: 'me', amount: 500 }]),
      g([{ from: 'me', to: 'p', amount: 500 }]),
      g([{ from: 'r', to: 'me', amount: 500 }], { type: 'personal' }),
    ], 'INR')).toEqual({ owedBy: undefined, owes: undefined })
  })
})
