import { beforeEach, describe, expect, it } from 'vitest'
import type { Capture, Expense, Group } from '@/types'
import { descriptionHistory } from './recents'
import {
  buildRecurrence, clearDraft, describePayer, describeSplit, draftKey, fromSplitInput, hydrateDraft, initialDraft, isDirty, loadDraft, parseDecimal,
  reduce, rescaleMinor, restoreDraft, saveDraft, seedSplit, selectPaidBy, selectSplits, setDraftStorage, titleCase, toExpense, toSplitInput, validate, type Draft,
} from './expense-draft'

const group: Group = {
  id: 'g1', name: 'Goa trip', emoji: '🏖️', type: 'trip', currency: 'INR', simplify: true, memberUids: ['u_me', 'u_p'],
  members: { me: { name: 'Amrit', uid: 'u_me', color: '#111' }, p: { name: 'Priya', uid: 'u_p', color: '#222' }, r: { name: 'Rahul', color: '#333' } },
  inviteCode: 'ABCD2345', createdBy: 'u_me', createdAt: 0, updatedAt: 0,
}
const order = ['me', 'p', 'r']
const ctx = { group, order, me: 'me', personal: false }
const save = { ...ctx, userUid: 'u_me', now: 1_700_000_000_000, today: '2026-10-08' }
const seed = (extra: Partial<Parameters<typeof initialDraft>[0]> = {}) => initialDraft({ group, order, me: 'me', history: [], last: {}, today: '2026-10-08', ...extra })

const expense = (extra: Partial<Expense> = {}): Expense => ({
  id: 'e1', groupId: 'g1', description: 'Dinner', amount: 120000, category: 'food', date: '2026-10-01', paidBy: { p: 120000 },
  splits: { me: 40000, p: 40000, r: 40000 }, splitType: 'equal', splitInput: { selected: ['me', 'p', 'r'] }, createdBy: 'u_p', createdAt: 100, updatedAt: 200, ...extra,
})

describe('initialDraft', () => {
  it('starts a blank expense from you, split equally with everyone, dated today', () => {
    const d = seed()
    expect(d).toMatchObject({ cur: 'INR', amount: undefined, description: '', category: 'other', date: '2026-10-08', payer: 'me', multiPay: false, splitType: 'equal', repeat: 'never', fx: null })
    expect(d.split.selected).toEqual(order)
    expect(d.seededFor).toEqual({ id: 'g1', currency: 'INR' })
  })

  it('repeats what this device used last time in the group', () => {
    const d = seed({ last: { payer: 'p', splitType: 'shares', input: { shares: { me: 2, p: 1 } } }, lastCurrency: 'THB' })
    expect(d.payer).toBe('p')
    expect(d.cur).toBe('THB')
    expect(d.splitType).toBe('shares')
    expect(d.split.shares).toEqual({ me: 2, p: 1 })
  })

  it('seeds an edit from the expense, in its original currency with the locked rate', () => {
    const existing = expense({
      amount: 100000, paidBy: { me: 60000, p: 40000 }, splits: { me: 50000, p: 50000 }, splitType: 'exact', splitInput: { exact: { me: 3000, p: 3000 } },
      original: { currency: 'THB', amount: 6000, rate: 16.6667, rateDate: '2026-10-01', source: 'ecb' }, notes: 'late', recurrence: { freq: 'monthly', nextDate: '2026-11-01', until: '2027-01-01' },
    })
    const d = seed({ existing })
    expect(d.cur).toBe('THB')
    expect(d.amount).toBe(6000)
    expect(d.multiPay).toBe(true)
    expect(d.payers).toEqual({ me: 3600, p: 2400 })
    expect(d.payer).toBe('me')
    expect(d.split.exact).toEqual({ me: 3000, p: 3000 })
    expect(d.fx).toEqual({ rate: 16.6667, date: '2026-10-01', source: 'ecb' })
    expect(d).toMatchObject({ description: 'Dinner', category: 'food', catTouched: true, picked: true, notes: 'late', date: '2026-10-01', repeat: 'monthly', until: '2027-01-01' })
  })

  it('"add again" copies the expense but dates it today and does not repeat', () => {
    const d = seed({ again: expense({ recurrence: { freq: 'weekly', nextDate: '2026-10-08' } }) })
    expect(d.date).toBe('2026-10-08')
    expect(d.repeat).toBe('never')
    expect(d.payer).toBe('p')
    expect(d.amount).toBe(120000)
  })

  it('a captured payment is yours to have paid, with its merchant and a guessed category', () => {
    const capture: Capture = { id: 'c1', amount: 84000, currency: 'INR', merchant: 'Swiggy', date: '2026-10-07', source: 'ios-shortcut', status: 'pending', createdAt: 0, updatedAt: 0, note: 'lunch' }
    const d = seed({ capture, last: { payer: 'p' } })
    expect(d).toMatchObject({ payer: 'me', amount: 84000, description: 'Swiggy', category: 'food', date: '2026-10-07', notes: 'lunch' })
  })

  it('prefers the category this group last used for the same merchant', () => {
    const history = descriptionHistory([expense({ description: 'Swiggy', category: 'groceries' })])
    const capture: Capture = { id: 'c1', amount: 100, merchant: 'swiggy', date: '2026-10-07', source: 'share', status: 'pending', createdAt: 0, updatedAt: 0 }
    expect(seed({ capture, history }).category).toBe('groceries')
  })
})

describe('reduce', () => {
  it('guesses the category while typing until one is chosen by hand', () => {
    let d = reduce(seed(), { type: 'description', value: 'Uber to airport', history: [] })
    expect(d.category).toBe('transport')
    d = reduce(d, { type: 'category', category: 'gifts' })
    d = reduce(d, { type: 'description', value: 'Dinner', history: [] })
    expect(d.category).toBe('gifts')
    expect(d.picked).toBe(false)
  })

  it('switching currency keeps the typed figure in the new currency’s digits', () => {
    let d = reduce(seed(), { type: 'amount', amount: 1250 })
    d = reduce(d, { type: 'multiPay', on: true })
    d = reduce(d, { type: 'splitType', splitType: 'exact', order })
    d = reduce(d, { type: 'currency', cur: 'JPY' })
    expect(d.cur).toBe('JPY')
    expect(d.amount).toBe(13)
    expect(d.payers).toEqual({ me: 13 })
    expect(d.split.exact).toEqual({ me: 4, p: 4, r: 4 })
    d = reduce(d, { type: 'currency', cur: 'USD' })
    expect(d.amount).toBe(1300)
    expect(rescaleMinor(100, 'INR', 'AUD')).toBe(100)
  })

  it('multi-payer starts from the single payer covering the whole amount', () => {
    let d = reduce(seed(), { type: 'amount', amount: 1000 })
    d = reduce(d, { type: 'payer', id: 'p' })
    d = reduce(d, { type: 'multiPay', on: true })
    expect(d.payers).toEqual({ p: 1000 })
    d = reduce(d, { type: 'payerAmount', id: 'me', amount: 400 })
    d = reduce(d, { type: 'payerAmount', id: 'p', amount: undefined })
    expect(d.payers).toEqual({ me: 400 })
    d = reduce(d, { type: 'multiPay', on: false })
    expect(d.multiPay).toBe(false)
    expect(d.payer).toBe('p')
  })

  it('seeds each split type from what is already chosen', () => {
    const base = reduce(seed(), { type: 'amount', amount: 1000 })
    const sel = reduce(base, { type: 'toggleMember', id: 'r' })
    expect(sel.split.selected).toEqual(['me', 'p'])
    expect(reduce(sel, { type: 'splitType', splitType: 'exact', order }).split.exact).toEqual({ me: 500, p: 500 })
    expect(reduce(sel, { type: 'splitType', splitType: 'shares', order }).split.shares).toEqual({ me: 1, p: 1 })
    const pct = reduce(base, { type: 'splitType', splitType: 'percent', order }).split.percent
    expect(pct).toEqual({ me: 33.34, p: 33.33, r: 33.33 })
    const items = reduce(sel, { type: 'splitType', splitType: 'itemized', order }).split.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ amount: 1000, members: ['me', 'p'] })
    // Switching back and forth keeps what was typed.
    let d = reduce(base, { type: 'splitType', splitType: 'exact', order })
    d = reduce(d, { type: 'exact', id: 'me', amount: 900 })
    d = reduce(d, { type: 'splitType', splitType: 'equal', order })
    d = reduce(d, { type: 'splitType', splitType: 'exact', order })
    expect(d.split.exact.me).toBe(900)
    expect(seedSplit(fromSplitInput({ selected: [] }, order), 'equal', order, undefined).selected).toEqual(order)
  })

  it('an empty field drops the entry rather than storing 0', () => {
    let d = reduce(seed(), { type: 'percent', id: 'me', value: 12.5 })
    expect(d.split.percent).toEqual({ me: 12.5 })
    d = reduce(d, { type: 'percent', id: 'me', value: undefined })
    expect(d.split.percent).toEqual({})
    d = reduce(d, { type: 'shares', id: 'p', value: 2 })
    d = reduce(d, { type: 'adjust', id: 'p', amount: -500 })
    expect(toSplitInput(d.split, 'shares')).toEqual({ shares: { p: 2 } })
    expect(toSplitInput(d.split, 'adjust')).toEqual({ selected: order, adjust: { p: -500 } })
  })

  it('switching group keeps what was typed and re-seeds payer and split from the new members', () => {
    const other: Group = { ...group, id: 'g2', currency: 'AUD', members: { me: group.members.me, x: { name: 'Xi', color: '#444' } }, memberUids: ['u_me'] }
    let d = reduce(seed({ last: { payer: 'p' } }), { type: 'amount', amount: 1250 })
    d = reduce(d, { type: 'description', value: 'Dinner', history: [] })
    d = reduce(d, { type: 'multiPay', on: true })
    d = reduce(d, { type: 'switchGroup', group: other, order: ['me', 'x'], me: 'me', last: { payer: 'x', splitType: 'equal', input: { selected: ['x'] } } })
    expect(d).toMatchObject({ amount: 1250, description: 'Dinner', cur: 'AUD', payer: 'x', multiPay: false, payers: {}, splitType: 'equal' })
    expect(d.split.selected).toEqual(['x'])
    expect(d.seededFor).toEqual({ id: 'g2', currency: 'AUD' })
    // Same group again: nothing changes.
    expect(reduce(d, { type: 'switchGroup', group: other, order: ['me', 'x'], me: 'me', last: {} })).toBe(d)
  })

  it('a foreign entry currency survives a group switch; the group’s own currency follows the new group', () => {
    const thb = reduce(seed(), { type: 'currency', cur: 'THB' })
    const other: Group = { ...group, id: 'g2', currency: 'AUD' }
    expect(reduce(thb, { type: 'switchGroup', group: other, order, me: 'me', last: {} }).cur).toBe('THB')
    expect(reduce(seed(), { type: 'switchGroup', group: other, order, me: 'me', last: {}, lastCurrency: 'JPY' }).cur).toBe('JPY')
    expect(reduce(seed(), { type: 'switchGroup', group: other, order, me: 'me', last: {} }).cur).toBe('AUD')
  })

  it('a scanned bill fills total, merchant, date and currency from the reader (not the group)', () => {
    const d = reduce(seed(), { type: 'applyReceipt', parsed: { merchant: 'STARBUCKS coffee', total: 145000, date: '2026-10-05', currency: 'THB', items: [] } })
    expect(d).toMatchObject({ cur: 'THB', amount: 145000, description: 'Starbucks Coffee', category: 'food', date: '2026-10-05' })
    // Whole-yen bills: the reader's hundredths become yen.
    const y = reduce(seed(), { type: 'applyReceipt', parsed: { total: 120000, currency: 'JPY', items: [] } })
    expect(y.amount).toBe(1200)
    // An unknown currency code is ignored.
    expect(reduce(seed(), { type: 'applyReceipt', parsed: { total: 100, currency: 'XXX', items: [] } }).cur).toBe('INR')
  })

  it('"assign items myself" turns the scanned lines into an itemised split for everyone', () => {
    const d = reduce(seed(), { type: 'assignItems', items: [{ name: 'Beer', amount: 30000 }, { name: 'Pizza', amount: 45000 }], order })
    expect(d.splitType).toBe('itemized')
    expect(d.split.items.map((i) => ({ name: i.name, amount: i.amount, members: i.members }))).toEqual([
      { name: 'Beer', amount: 30000, members: order }, { name: 'Pizza', amount: 45000, members: order },
    ])
    expect(new Set(d.split.items.map((i) => i.id)).size).toBe(2)
  })

  it('picking a past description repeats its category, payer and split when they still fit', () => {
    const history = descriptionHistory([expense({ paidBy: { p: 120000 }, splitType: 'shares', splitInput: { shares: { me: 2, p: 1, gone: 1 } } })])
    const d = reduce(seed(), { type: 'pickSuggestion', s: history[0], order, personal: false })
    expect(d).toMatchObject({ description: 'Dinner', category: 'food', picked: true, payer: 'p', splitType: 'shares' })
    expect(d.split.shares).toEqual({ me: 2, p: 1 })
    const personal = reduce(seed(), { type: 'pickSuggestion', s: history[0], order, personal: true })
    expect(personal.payer).toBe('me')
    expect(personal.splitType).toBe('equal')
  })
})

describe('selectors and validation', () => {
  it('paid-by follows the mode', () => {
    const d = reduce(seed(), { type: 'amount', amount: 1000 })
    expect(selectPaidBy(d, 'me', false)).toEqual({ me: 1000 })
    expect(selectPaidBy(d, 'me', true)).toEqual({ me: 1000 })
    const m = reduce(reduce(reduce(d, { type: 'multiPay', on: true }), { type: 'payerAmount', id: 'p', amount: 300 }), { type: 'payerAmount', id: 'me', amount: 700 })
    expect(selectPaidBy(m, 'me', false)).toEqual({ me: 700, p: 300 })
    expect(selectPaidBy(seed(), 'me', false)).toEqual({})
  })

  it('reports the split error instead of throwing, and nothing without an amount', () => {
    expect(selectSplits(seed(), order, 'me', false)).toEqual({})
    const d = reduce(reduce(seed(), { type: 'amount', amount: 1000 }), { type: 'selected', ids: [] })
    expect(selectSplits(d, order, 'me', false).error).toBe('Select at least one person')
    expect(selectSplits(d, order, 'me', true).splits).toEqual({ me: 1000 })
  })

  it('validate points at each problem field', () => {
    expect(validate(seed(), ctx)).toEqual({ amount: 'Enter an amount', description: 'Add a description' })
    let d = reduce(seed(), { type: 'amount', amount: 1000 })
    d = reduce(d, { type: 'category', category: 'groceries' })
    expect(validate(d, ctx)).toEqual({})
    d = reduce(d, { type: 'multiPay', on: true })
    d = reduce(d, { type: 'payerAmount', id: 'me', amount: 400 })
    expect(validate(d, ctx).payers).toBe('Payers add up to ₹4.00, not ₹10.00')
    d = reduce(d, { type: 'multiPay', on: false })
    d = reduce(d, { type: 'splitType', splitType: 'exact', order })
    d = reduce(d, { type: 'exact', id: 'me', amount: 900 })
    expect(validate(d, ctx).split).toMatch(/add up/)
    d = reduce(d, { type: 'splitType', splitType: 'equal', order })
    d = reduce(d, { type: 'repeat', repeat: 'monthly' })
    d = reduce(d, { type: 'until', until: '2026-01-01' })
    expect(validate(d, ctx).until).toBe('The repeat end date is before the expense date')
    d = reduce(d, { type: 'until', until: '' })
    d = reduce(d, { type: 'currency', cur: 'THB' })
    expect(validate(d, ctx).fx).toBe('Enter the THB → INR exchange rate')
    d = reduce(d, { type: 'fx', fx: { rate: 0.0000001, date: '2026-10-08', source: 'manual' } })
    expect(validate(d, ctx).fx).toBe('That’s less than the smallest INR amount')
  })
})

describe('toExpense', () => {
  it('builds a plain equal expense and remembers the choice for next time', () => {
    let d = reduce(seed(), { type: 'amount', amount: 1200 })
    d = reduce(d, { type: 'description', value: 'Cab', history: [] })
    const { expense: e, remember } = toExpense(d, save)
    expect(e).toMatchObject({ groupId: 'g1', description: 'Cab', amount: 1200, category: 'transport', date: '2026-10-08', paidBy: { me: 1200 }, splits: { me: 400, p: 400, r: 400 }, splitType: 'equal', splitInput: { selected: order }, createdBy: 'u_me', createdAt: save.now, updatedAt: save.now })
    expect(e.id).toMatch(/^e_/)
    expect(e.notes).toBeUndefined()
    expect(e.recurrence).toBeUndefined()
    expect(remember).toEqual({ payer: 'me', splitType: 'equal', input: { selected: order } })
  })

  it('every split type ends up balanced', () => {
    const base = reduce(reduce(seed(), { type: 'amount', amount: 100000 }), { type: 'description', value: 'Dinner', history: [] })
    const cases: Array<[Draft, Record<string, number>]> = [
      [reduce(reduce(base, { type: 'splitType', splitType: 'exact', order }), { type: 'exact', id: 'me', amount: 50000 }), { me: 50000, p: 33333, r: 33333 }],
      [reduce(reduce(reduce(base, { type: 'splitType', splitType: 'percent', order }), { type: 'percent', id: 'me', value: 50 }), { type: 'percent', id: 'p', value: 50 }), { me: 50000, p: 50000 }],
      [reduce(reduce(base, { type: 'splitType', splitType: 'shares', order }), { type: 'shares', id: 'me', value: 2 }), { me: 50000, p: 25000, r: 25000 }],
      [reduce(reduce(base, { type: 'splitType', splitType: 'adjust', order }), { type: 'adjust', id: 'me', amount: 10000 }), { me: 40000, p: 30000, r: 30000 }],
    ]
    // Exact needs every share to add up; fix the last case's numbers.
    cases[0][0] = reduce(reduce(cases[0][0], { type: 'exact', id: 'p', amount: 30000 }), { type: 'exact', id: 'r', amount: 20000 })
    cases[0][1] = { me: 50000, p: 30000, r: 20000 }
    cases[1][0] = reduce(cases[1][0], { type: 'percent', id: 'r', value: undefined })
    for (const [d, splits] of cases) {
      expect(validate(d, ctx)).toEqual({})
      const { expense: e } = toExpense(d, save)
      expect(e.splits).toEqual(splits)
      expect(Object.values(e.splits).reduce((a, b) => a + b, 0)).toBe(100000)
      expect(e.splitType).toBe(d.splitType)
    }
    const items = reduce(reduce(base, { type: 'assignItems', items: [{ name: 'Beer', amount: 60000 }, { name: 'Pizza', amount: 30000 }], order }), { type: 'items', items: [] })
    const withItems = reduce(items, { type: 'assignItems', items: [{ name: 'Beer', amount: 60000 }, { name: 'Pizza', amount: 30000 }], order })
    const only = { ...withItems, split: { ...withItems.split, items: withItems.split.items.map((it, i) => (i === 0 ? { ...it, members: ['me'] } : it)) } }
    const { expense: e } = toExpense(only, save)
    // Beer 600 to me, pizza 300 split three ways, ₹100 tax shared in proportion.
    expect(e.splits).toEqual({ me: 77778, p: 11111, r: 11111 })
    expect(e.splitInput.items?.[0]).toEqual({ name: 'Beer', amount: 60000, members: ['me'] })
    expect(e.splitInput.items?.[0]).not.toHaveProperty('id')
  })

  it('converts a foreign-currency draft once and keeps the typed amount in `original`', () => {
    let d = reduce(seed(), { type: 'currency', cur: 'THB' })
    d = reduce(d, { type: 'amount', amount: 100000 })
    d = reduce(d, { type: 'description', value: 'Pad thai', history: [] })
    d = reduce(d, { type: 'fx', fx: { rate: 2.5, date: '2026-10-07', source: 'ecb' } })
    const { expense: e } = toExpense(d, save)
    expect(e.amount).toBe(250000)
    expect(e.paidBy).toEqual({ me: 250000 })
    expect(Object.values(e.splits).reduce((a, b) => a + b, 0)).toBe(250000)
    expect(e.original).toEqual({ currency: 'THB', amount: 100000, rate: 2.5, rateDate: '2026-10-07', source: 'ecb' })
    expect(() => toExpense(reduce(d, { type: 'fx', fx: null }), save)).toThrow(/exchange rate/)
  })

  it('edit mode keeps identity, receipt, import origin and the schedule', () => {
    const existing = expense({ receiptUrl: 'https://x/r.jpg', receiptPath: 'receipts/g1/e1.jpg', importedFrom: 'splitwise', recurrence: { freq: 'monthly', nextDate: '2026-11-01' } })
    const d = reduce(seed({ existing }), { type: 'notes', notes: ' fixed ' })
    const { expense: e } = toExpense(d, { ...save, existing })
    expect(e).toMatchObject({ id: 'e1', createdBy: 'u_p', createdAt: 100, updatedAt: save.now, notes: 'fixed', receiptUrl: 'https://x/r.jpg', receiptPath: 'receipts/g1/e1.jpg', importedFrom: 'splitwise' })
    expect(e.recurrence).toEqual({ freq: 'monthly', nextDate: '2026-11-01', until: undefined })
  })

  it('an occurrence of a repeating expense never becomes a template itself', () => {
    const existing = expense({ recurringFrom: 't1' })
    const d = reduce(seed({ existing }), { type: 'repeat', repeat: 'weekly' })
    const { expense: e } = toExpense(d, { ...save, existing })
    expect(e.recurrence).toBeUndefined()
    expect(e.recurringFrom).toBe('t1')
  })

  it('personal wallets always charge you alone', () => {
    const personal: Group = { ...group, type: 'personal', members: { me: group.members.me } }
    const d = reduce(reduce(seed({ group: personal, order: ['me'] }), { type: 'amount', amount: 500 }), { type: 'description', value: 'Coffee', history: [] })
    const { expense: e } = toExpense(d, { ...save, group: personal, order: ['me'], personal: true })
    expect(e).toMatchObject({ paidBy: { me: 500 }, splits: { me: 500 }, splitType: 'equal', splitInput: { selected: ['me'] } })
  })
})

describe('buildRecurrence', () => {
  it('a new template starts right after its date', () => {
    expect(buildRecurrence('monthly', '2026-01-31', '', undefined, '2026-10-08')).toEqual({ freq: 'monthly', nextDate: '2026-02-28', until: undefined })
    expect(buildRecurrence('never', '2026-01-31', '')).toBeUndefined()
  })
  it('an unchanged schedule keeps its nextDate; a changed one resumes after today', () => {
    const existing = expense({ date: '2026-01-31', recurrence: { freq: 'monthly', nextDate: '2026-11-30' } })
    expect(buildRecurrence('monthly', '2026-01-31', '2027-01-01', existing, '2026-10-08')).toEqual({ freq: 'monthly', nextDate: '2026-11-30', until: '2027-01-01' })
    expect(buildRecurrence('weekly', '2026-01-31', '', existing, '2026-10-08')).toEqual({ freq: 'weekly', nextDate: '2026-10-10', until: undefined })
  })
})

describe('summaries', () => {
  it('says who paid', () => {
    let d = seed()
    expect(describePayer(d, group, 'me', false)).toBe('You paid')
    expect(describePayer(reduce(d, { type: 'payer', id: 'p' }), group, 'me', false)).toBe('Priya paid')
    d = reduce(reduce(d, { type: 'amount', amount: 1000 }), { type: 'multiPay', on: true })
    expect(describePayer(d, group, 'me', false)).toBe('You paid')
    d = reduce(d, { type: 'payerAmount', id: 'p', amount: 1 })
    expect(describePayer(d, group, 'me', false)).toBe('You and Priya paid')
    d = reduce(d, { type: 'payerAmount', id: 'r', amount: 1 })
    expect(describePayer(d, group, 'me', false)).toBe('You, Priya and Rahul paid')
    expect(describePayer(reduce(d, { type: 'payerAmount', id: 'p', amount: undefined }), group, 'me', false)).toBe('You and Rahul paid')
    expect(describePayer(reduce(seed(), { type: 'multiPay', on: true }), group, 'me', false)).toBe('Nobody yet')
  })
  it('describes the split', () => {
    const d = seed()
    expect(describeSplit(d, order, group, 'me')).toBe('Split equally · 3 people')
    expect(describeSplit(reduce(d, { type: 'selected', ids: ['p'] }), order, group, 'me')).toBe('Only Priya')
    expect(describeSplit(reduce(d, { type: 'selected', ids: ['p', 'me'] }), order, group, 'me')).toBe('Split equally · 2 of 3')
    expect(describeSplit(reduce(d, { type: 'splitType', splitType: 'percent', order }), order, group, 'me')).toBe('By percentage')
    expect(describeSplit(reduce(d, { type: 'assignItems', items: [{ name: 'a', amount: 1 }], order }), order, group, 'me')).toBe('Split by items · 1 item')
  })
})

describe('drafts on this device', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }
  beforeEach(() => setDraftStorage(mem()))

  it('keys one draft per route', () => {
    expect(draftKey()).toBe('splitit-expense-draft:new')
    expect(draftKey('e1')).toBe('splitit-expense-draft:edit:e1')
  })

  it('only user changes count as dirty', () => {
    const a = seed()
    expect(isDirty(a, a)).toBe(false)
    expect(isDirty(a, { ...a, picked: true, catTouched: true, seededFor: { id: 'x', currency: 'INR' } })).toBe(false)
    expect(isDirty(a, reduce(a, { type: 'amount', amount: 1 }))).toBe(true)
    expect(isDirty(a, reduce(a, { type: 'category', category: 'food' }))).toBe(true)
  })

  it('stores, loads and clears a draft, ignoring junk', () => {
    const d = reduce(seed(), { type: 'amount', amount: 1 })
    saveDraft(draftKey(), { groupId: 'g1', draft: d, capture: 'c1' }, 5)
    expect(loadDraft(draftKey())).toEqual({ v: 1, at: 5, groupId: 'g1', capture: 'c1', draft: d })
    clearDraft(draftKey())
    expect(loadDraft(draftKey())).toBeNull()
    setDraftStorage({ getItem: () => '{"v":2}', setItem: () => {}, removeItem: () => {} })
    expect(loadDraft(draftKey())).toBeNull()
    setDraftStorage({ getItem: () => 'not json', setItem: () => {}, removeItem: () => {} })
    expect(loadDraft(draftKey())).toBeNull()
    setDraftStorage(undefined)
    saveDraft(draftKey(), { groupId: 'g1', draft: d })
    expect(loadDraft(draftKey())).toBeNull()
  })

  it('hydrating drops members who left and repairs odd values', () => {
    const base = seed()
    let d = reduce(reduce(base, { type: 'amount', amount: 500 }), { type: 'payer', id: 'gone' })
    d = reduce(d, { type: 'exact', id: 'gone', amount: 100 })
    d = reduce(d, { type: 'exact', id: 'p', amount: 400 })
    d = reduce(d, { type: 'selected', ids: ['gone', 'p'] })
    d = reduce(d, { type: 'items', items: [{ id: 'it_1', name: 'x', amount: 1, members: ['gone', 'me'], shares: { gone: 2, me: 1 } }] })
    const h = hydrateDraft({ ...d, splitType: 'bogus' as never, repeat: 'daily' as never, category: 'nope' as never, fx: { rate: -1, date: '', source: 'manual' } }, base, order, 'me')
    expect(h.payer).toBe('me')
    expect(h.split.selected).toEqual(['p'])
    expect(h.split.exact).toEqual({ p: 400 })
    expect(h.split.items[0]).toMatchObject({ name: 'x', amount: 1, members: ['me'], shares: { me: 1 } })
    expect(h.split.items[0].id).toMatch(/^it_/)
    expect(h).toMatchObject({ amount: 500, splitType: 'equal', repeat: 'never', category: 'other', fx: null, seededFor: base.seededFor })
    expect(hydrateDraft({}, base, order, 'me')).toEqual(base)
  })

  it('restoring a draft typed in another group keeps the content and re-seeds payer and split', () => {
    const other: Group = { ...group, id: 'g2', currency: 'AUD', members: { me: group.members.me, x: { name: 'Xi', color: '#444' } }, memberUids: ['u_me'] }
    let d = reduce(seed({ group: other, order: ['me', 'x'] }), { type: 'amount', amount: 1250 })
    d = reduce(d, { type: 'payer', id: 'x' })
    d = reduce(d, { type: 'description', value: 'Cab', history: [] })
    const base = seed({ last: { payer: 'p' } })
    const r = restoreDraft(d, base, { group, order, me: 'me', history: [], last: { payer: 'p' } })
    expect(r).toMatchObject({ amount: 1250, description: 'Cab', cur: 'INR', payer: 'p', seededFor: { id: 'g1', currency: 'INR' } })
    expect(r.split.selected).toEqual(order)
    // Same group: members who left are dropped, nothing else changes.
    const same = restoreDraft(reduce(base, { type: 'amount', amount: 7 }), base, { group, order, me: 'me', history: [], last: {} })
    expect(same).toMatchObject({ amount: 7, payer: 'p' })
  })
})

describe('helpers', () => {
  it('parseDecimal accepts plain non-negative numbers up to the allowed places', () => {
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal('12.')).toBe(12)
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('2.5', 0)).toBeNaN()
    expect(parseDecimal('1e3')).toBeNaN()
    expect(parseDecimal('-1')).toBeNaN()
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('.')).toBeNaN()
  })
  it('titleCase handles accents and non-Latin letters', () => {
    expect(titleCase('TOIT brewpub')).toBe('Toit Brewpub')
    expect(titleCase('café du nord')).toBe('Café Du Nord')
    expect(titleCase("o'neil's (east)")).toBe("O'neil's (East)")
    expect(titleCase('école élémentaire')).toBe('École Élémentaire')
    expect(titleCase('चाय दुकान')).toBe('चाय दुकान')
  })
})
