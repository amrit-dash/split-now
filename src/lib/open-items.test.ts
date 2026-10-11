import { describe, expect, it } from 'vitest'
import type { Expense, OpenItem } from '@/types'
import {
  CLAIM_SETTLE_MS,
  askedMe,
  claimHref,
  editOpenItem,
  newOpenItem,
  openItemErrors,
  openItemMeta,
  openItemPrefill,
  openItemState,
  sortOpenItems,
  suspectLine,
} from './open-items'

const NOW = 1_760_000_000_000
const item = (over: Partial<OpenItem> = {}): OpenItem => ({
  id: 'o1',
  groupId: 'g1',
  title: 'Lunch',
  status: 'open',
  createdBy: 'u1',
  createdAt: NOW - 10_000,
  updatedAt: NOW - 10_000,
  ...over,
})
const expense = (id: string, over: Partial<Expense> = {}) => ({ id, ...over }) as Expense

describe('openItemState', () => {
  it('open, claimed and deleted', () => {
    const ex = new Map([['e1', {}]])
    expect(openItemState(item(), ex, NOW)).toBe('open')
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1' }), ex, NOW)).toBe('claimed')
    expect(openItemState(item({ deletedAt: NOW }), ex, NOW)).toBe('deleted')
    // deleted wins over claimed
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1', deletedAt: NOW }), ex, NOW)).toBe('deleted')
  })
  it('a claimed item whose expense is in Recently deleted is open again', () => {
    const ex = new Map([['e1', { deletedAt: NOW }]])
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1', claimedAt: NOW - 1000 }), ex, NOW)).toBe('open')
  })
  it('a missing expense: claimed for a moment (listener lag), then open (deleted for good)', () => {
    const ex = new Map<string, object>()
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: NOW - 1000 }), ex, NOW)).toBe('claimed')
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: NOW - CLAIM_SETTLE_MS - 1 }), ex, NOW)).toBe('open')
  })
  it('expenses still loading: a claimed item stays claimed', () => {
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: 0 }), null, NOW)).toBe('claimed')
  })
  it('claimed without an expense id counts as open', () => {
    expect(openItemState(item({ status: 'claimed' }), new Map(), NOW)).toBe('open')
  })
})

describe('sortOpenItems', () => {
  it('splits and orders: open by date (newest first, undated last), claimed by claim time', () => {
    const items = [
      item({ id: 'a', date: '2026-10-01' }),
      item({ id: 'b', date: '2026-10-03' }),
      item({ id: 'c', createdAt: NOW }),
      item({ id: 'd', status: 'claimed', expenseId: 'e1', claimedAt: NOW - 5 }),
      item({ id: 'e', status: 'claimed', expenseId: 'e2', claimedAt: NOW - 1 }),
      item({ id: 'f', deletedAt: NOW }),
      item({ id: 'g', status: 'claimed', expenseId: 'e3', claimedAt: NOW - 3 }),
    ]
    const { open, claimed } = sortOpenItems(items, [expense('e1'), expense('e2'), expense('e3', { deletedAt: NOW })], NOW)
    expect(open.map((i) => i.id)).toEqual(['b', 'a', 'c', 'g'])
    expect(claimed.map((i) => i.id)).toEqual(['e', 'd'])
  })
  it('nothing loaded yet', () => {
    expect(sortOpenItems(null, null, NOW)).toEqual({ open: [], claimed: [] })
  })
})

describe('openItemPrefill', () => {
  it('paid by the claimer, split among everyone, with the item’s details', () => {
    const p = openItemPrefill(item({ title: 'Lunch', amount: 29000, date: '2026-10-02', category: 'food' }), {
      order: ['m1', 'm2', 'm3'],
      me: 'm2',
      currency: 'INR',
    })
    expect(p).toEqual({
      text: 'Lunch',
      description: 'Lunch',
      amount: 29000,
      currency: 'INR',
      payer: 'm2',
      participants: ['m1', 'm2', 'm3'],
      date: '2026-10-02',
      category: 'food',
    })
  })
  it('leaves the amount empty when unknown', () => {
    expect(openItemPrefill(item(), { order: ['m1'], me: 'm1', currency: 'INR' }).amount).toBeUndefined()
  })
})

describe('claimHref', () => {
  it('opens the expense form for the item', () => {
    expect(claimHref('g 1', 'o1')).toBe('/add?group=g%201&open=o1')
  })
})

describe('openItemMeta', () => {
  it('date and amount, or what is unknown', () => {
    expect(openItemMeta({ date: '2026-10-02', amount: 29000 }, 'INR', '2026-10-11')).toMatch(/2 Oct · ₹290/)
    expect(openItemMeta({ date: '2026-10-02' }, 'INR', '2026-10-11')).toMatch(/2 Oct · amount not known/)
    expect(openItemMeta({ amount: 29000 }, 'INR', '2026-10-11')).toMatch(/^No date · ₹290/)
  })
  it('shows the year for another year', () => {
    expect(openItemMeta({ date: '2025-12-30' }, 'INR', '2026-01-02')).toMatch(/2025/)
  })
})

describe('suspectLine', () => {
  const names: Record<string, string> = { m1: 'Rahul', m2: 'Priya', m3: 'Ananya' }
  const name = (id: string) => names[id]
  it('names the people, you first', () => {
    expect(suspectLine(['m1'], 'm9', name)).toBe('Rahul might have paid')
    expect(suspectLine(['m1', 'm9'], 'm9', name)).toBe('You or Rahul might have paid')
    expect(suspectLine(['m1', 'm2', 'm3'], undefined, name)).toBe('Rahul, Priya or Ananya might have paid')
  })
  it('nobody, or only unknown people', () => {
    expect(suspectLine(undefined, 'm1', name)).toBeNull()
    expect(suspectLine(['zz'], 'm1', name)).toBeNull()
  })
  it('askedMe', () => {
    expect(askedMe({ suspects: ['m1'] }, 'm1')).toBe(true)
    expect(askedMe({ suspects: ['m1'] }, 'm2')).toBe(false)
    expect(askedMe({}, undefined)).toBe(false)
  })
})

describe('openItemErrors', () => {
  const today = '2026-10-11'
  it('needs a title', () => {
    expect(openItemErrors({ title: '  ' }, today).title).toBeTruthy()
    expect(openItemErrors({ title: 'x'.repeat(121) }, today).title).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch' }, today)).toEqual({})
  })
  it('amount is optional but must be positive whole minor units', () => {
    expect(openItemErrors({ title: 'Lunch', amount: 0 }, today).amount).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', amount: 10.5 }, today).amount).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', amount: 100 }, today).amount).toBeUndefined()
  })
  it('no future dates', () => {
    expect(openItemErrors({ title: 'Lunch', date: '2026-10-12' }, today).date).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', date: '2026-10-11' }, today).date).toBeUndefined()
  })
})

describe('newOpenItem / editOpenItem', () => {
  it('trims, guesses the category, drops empty fields', () => {
    const o = newOpenItem({ title: '  Lunch   at  cafe ', notes: '  ', suspects: ['m1', 'm1'] }, { id: 'o1', groupId: 'g1', uid: 'u1', now: NOW })
    expect(o).toEqual({
      id: 'o1',
      groupId: 'g1',
      title: 'Lunch at cafe',
      category: 'food',
      suspects: ['m1'],
      status: 'open',
      createdBy: 'u1',
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
  it('an edit replaces the editable fields and keeps the rest', () => {
    const before = item({ amount: 100, notes: 'x', status: 'open' })
    const after = editOpenItem(before, { title: 'Dinner', date: '2026-10-02' }, NOW)
    expect(after.title).toBe('Dinner')
    expect(after.amount).toBeUndefined()
    expect(after.notes).toBeUndefined()
    expect(after.date).toBe('2026-10-02')
    expect(after.createdBy).toBe('u1')
    expect(after.updatedAt).toBe(NOW)
  })
})
