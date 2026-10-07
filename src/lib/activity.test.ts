import { describe, expect, it } from 'vitest'
import type { ActivityEntry, Expense, Settlement } from '@/types'
import {
  activityText, describeChanges, diffExpense, disputeActivity, expenseEventActivity, expenseSaveActivity, expenseSnapshot,
  importActivity, memberActivity, mergeFeeds, settlementActivity, type ActivityCtx,
} from './activity'
import { formatMoney } from './money'

const names: Record<string, string> = { s: 'Sarah', j: 'Jay', m: 'Mia' }
const ctx: ActivityCtx = { actorUid: 'u_sarah', actorName: 'Sarah', currency: 'AUD', memberName: (id) => names[id] ?? 'Former member', now: 1000 }
const A = (v: number) => formatMoney(v, 'AUD')

const base: Expense = {
  id: 'e1', groupId: 'g', description: 'Dinner', amount: 8000, category: 'food', date: '2026-10-03',
  paidBy: { s: 8000 }, splits: { s: 4000, j: 4000 }, splitType: 'equal', splitInput: { selected: ['s', 'j'] },
  createdBy: 'u_sarah', createdAt: 1, updatedAt: 1,
}

describe('diffExpense', () => {
  it('only reports tracked fields that changed', () => {
    const d = diffExpense(base, { ...base, amount: 8400, splits: { s: 4200, j: 4200 }, updatedAt: 99, receiptUrl: 'x' })
    expect(d.fields).toEqual(['amount', 'splits'])
    expect(d.before).toEqual({ amount: 8000, splits: { s: 4000, j: 4000 } })
    expect(d.after).toEqual({ amount: 8400, splits: { s: 4200, j: 4200 } })
  })
  it('treats maps with the same entries in a different order as equal', () => {
    expect(diffExpense(base, { ...base, splits: { j: 4000, s: 4000 } }).fields).toEqual([])
  })
  it('records added and removed optional fields', () => {
    const d = diffExpense(base, { ...base, notes: 'with tip' })
    expect(d.fields).toEqual(['notes'])
    expect(d.before).toEqual({})
    expect(d.after).toEqual({ notes: 'with tip' })
  })
  it('snapshot drops empty values', () => {
    expect(expenseSnapshot({ ...base, notes: '' })).not.toHaveProperty('notes')
  })
})

describe('expenseSaveActivity', () => {
  it('describes a new expense', () => {
    const a = expenseSaveActivity(undefined, base, ctx)!
    expect(a.type).toBe('expense.created')
    expect(a.summary).toBe(`Sarah added “Dinner” (${A(8000)})`)
    expect(a.actorUid).toBe('u_sarah')
    expect(a.targetId).toBe('e1')
    expect(a.createdAt).toBe(1000)
  })
  it('one change: "Sarah changed amount A$80.00 → A$84.00"', () => {
    const a = expenseSaveActivity(base, { ...base, amount: 8400, splits: { s: 4200, j: 4200 } }, ctx)!
    expect(a.type).toBe('expense.updated')
    expect(a.summary).toBe(`Sarah changed amount ${A(8000)} → ${A(8400)} on “Dinner”`)
    expect(a.before).toEqual({ amount: 8000, splits: { s: 4000, j: 4000 } })
  })
  it('several changes are listed', () => {
    const a = expenseSaveActivity(base, { ...base, description: 'Sushi', category: 'groceries' }, ctx)!
    expect(a.summary).toBe('Sarah edited “Sushi”: description “Dinner” → “Sushi”; category Food & drink → Groceries')
  })
  it('nothing tracked changed → no entry', () => {
    expect(expenseSaveActivity(base, { ...base, updatedAt: 5, receiptUrl: 'https://x' }, ctx)).toBeNull()
  })
  it('keeps summaries bounded', () => {
    const a = expenseSaveActivity(base, { ...base, description: 'x'.repeat(900) }, ctx)!
    expect(a.summary.length).toBeLessThanOrEqual(480)
  })
})

describe('describeChanges', () => {
  it('names people in split and payer changes', () => {
    const lines = describeChanges({ paidBy: { s: 8000 }, splits: { s: 4000, j: 4000 } }, { paidBy: { j: 8000 }, splits: { s: 4000, j: 2000, m: 2000 } }, ctx)
    expect(lines).toEqual([
      'paid by Sarah → Jay',
      `split (Jay ${A(4000)} → ${A(2000)}, Mia added (${A(2000)}))`,
    ])
  })
  it('shows the foreign original next to the group amount', () => {
    const o = (amount: number) => ({ currency: 'THB', amount, rate: 0.0421, rateDate: '2026-10-01', source: 'ecb' as const })
    expect(describeChanges({ amount: 5052, original: o(120000) }, { amount: 5473, original: o(130000) }, ctx))
      .toEqual([`amount ${formatMoney(120000, 'THB')} (${A(5052)}) → ${formatMoney(130000, 'THB')} (${A(5473)})`])
    const thai = { ...base, amount: 5052, paidBy: { s: 5052 }, splits: { s: 2526, j: 2526 }, original: o(120000) }
    expect(expenseSaveActivity(undefined, thai, ctx)!.summary).toBe(`Sarah added “Dinner” (${formatMoney(120000, 'THB')} (${A(5052)}))`)
    // amount edit where the original stays the same is still shown with it
    expect(expenseSaveActivity(thai, { ...thai, amount: 5000, paidBy: { s: 5000 }, splits: { s: 2500, j: 2500 } }, ctx)!.summary)
      .toBe(`Sarah changed amount ${formatMoney(120000, 'THB')} (${A(5052)}) → ${formatMoney(120000, 'THB')} (${A(5000)}) on “Dinner”`)
  })
  it('summarises an import in one entry', () => {
    const a = importActivity('g', 12, 3, 'splitwise', ctx)
    expect(a.type).toBe('expense.imported')
    expect(a.summary).toBe('Sarah imported 12 expenses and 3 payments from Splitwise')
  })
  it('notes and recurrence', () => {
    expect(describeChanges({}, { notes: 'hi' }, ctx)).toEqual(['added a note'])
    expect(describeChanges({ recurrence: { freq: 'monthly', nextDate: '2026-11-03' } }, {}, ctx)).toEqual(['repeat monthly → never'])
  })
})

describe('other entries', () => {
  it('delete / restore / purge', () => {
    expect(expenseEventActivity('deleted', base, ctx).summary).toBe(`Sarah deleted “Dinner” (${A(8000)})`)
    expect(expenseEventActivity('restored', base, ctx).type).toBe('expense.restored')
    expect(expenseEventActivity('purged', base, ctx).summary).toContain('permanently deleted')
  })
  it('settlements', () => {
    const s: Settlement = { id: 's1', groupId: 'g', from: 'j', to: 's', amount: 5000, method: 'Cash', date: '2026-10-03', createdBy: 'u', createdAt: 1 }
    expect(settlementActivity('created', s, ctx).summary).toBe(`Sarah recorded a payment: Jay → Sarah ${A(5000)}`)
    expect(settlementActivity('deleted', s, ctx).type).toBe('settlement.deleted')
  })
  it('members', () => {
    expect(memberActivity('added', 'p_t', 'Tom', ctx).summary).toBe('Sarah added Tom to the group')
    expect(memberActivity('removed', 's', 'Sarah', ctx, true).summary).toBe('Sarah left the group')
  })
  it('disputes', () => {
    const a = disputeActivity('disputed', base, ctx, 'I wasn’t there')
    expect(a.type).toBe('expense.disputed')
    expect(a.summary).toBe('Sarah flagged “Dinner”: I wasn’t there')
    expect(disputeActivity('resolved', base, ctx).summary).toBe('Sarah resolved their flag on “Dinner”')
  })
})

describe('reading', () => {
  const entry = (id: string, createdAt: number, actorUid = 'u_sarah'): ActivityEntry => ({
    id, groupId: 'g', type: 'expense.created', actorUid, actorName: 'Sarah', targetId: 'e', summary: 'Sarah resolved their flag on “X”', createdAt,
  })
  it('own entries read as "You"', () => {
    expect(activityText(entry('a', 1), 'u_sarah')).toBe('You resolved your flag on “X”')
    expect(activityText(entry('a', 1), 'someone')).toBe('Sarah resolved their flag on “X”')
  })
  it('merges feeds newest first', () => {
    expect(mergeFeeds([[entry('a', 1), entry('c', 3)], [entry('b', 2)]], 2).map((a) => a.id)).toEqual(['c', 'b'])
  })
})
