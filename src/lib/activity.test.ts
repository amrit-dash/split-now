import { describe, expect, it } from 'vitest'
import type { ActivityEntry, Expense, Settlement } from '@/types'
import {
  activityHref,
  activityText,
  describeChanges,
  diffExpense,
  disputeActivity,
  expenseEventActivity,
  expenseSaveActivity,
  expenseSnapshot,
  groupSettingsActivity,
  importActivity,
  joinPhrases,
  activityIcon,
  memberActivity,
  mergeFeeds,
  settlementActivity,
  type ActivityCtx,
} from './activity'
import { formatMoney } from './money'
import { shortMoney } from './approval'

const names: Record<string, string> = { s: 'Sarah', j: 'Jay', m: 'Mia' }
const ctx: ActivityCtx = { actorUid: 'u_sarah', actorName: 'Sarah', currency: 'AUD', memberName: (id) => names[id] ?? 'Former member', now: 1000 }
const A = (v: number) => formatMoney(v, 'AUD')

const base: Expense = {
  id: 'e1',
  groupId: 'g',
  description: 'Dinner',
  amount: 8000,
  category: 'food',
  date: '2026-10-03',
  paidBy: { s: 8000 },
  splits: { s: 4000, j: 4000 },
  splitType: 'equal',
  splitInput: { selected: ['s', 'j'] },
  createdBy: 'u_sarah',
  createdAt: 1,
  updatedAt: 1,
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
  it('notes an edit that brought a waiting expense under the approval threshold', () => {
    const a = expenseSaveActivity({ ...base, requiresApproval: true }, { ...base, amount: 4000, splits: { s: 2000, j: 2000 } }, ctx)!
    expect(a.summary).toBe(`Sarah changed amount ${A(8000)} → ${A(4000)} on “Dinner”. Approved automatically (below the threshold)`)
    const kept = expenseSaveActivity({ ...base, requiresApproval: true }, { ...base, amount: 8400, requiresApproval: true, splits: { s: 4200, j: 4200 } }, ctx)!
    expect(kept.summary).not.toContain('Approved automatically')
  })
  it('notes an amount change edit auto-approve let through', () => {
    const before = { ...base, requiresApproval: true }
    const a = expenseSaveActivity(before, { ...before, amount: 8400, splits: { s: 4200, j: 4200 } }, ctx, { autoApprovedWithin: 500 })!
    expect(a.summary).toBe(`Sarah changed amount ${A(8000)} → ${A(8400)} on “Dinner”. Edit approved automatically (within ${A(500).replace(/[.,]00$/, '')})`)
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
    expect(lines).toEqual(['paid by Sarah → Jay', `split (Jay ${A(4000)} → ${A(2000)}, Mia added (${A(2000)}))`])
  })
  it('shows the foreign original next to the group amount', () => {
    const o = (amount: number) => ({ currency: 'THB', amount, rate: 0.0421, rateDate: '2026-10-01', source: 'ecb' as const })
    expect(describeChanges({ amount: 5052, original: o(120000) }, { amount: 5473, original: o(130000) }, ctx)).toEqual([
      `amount ${formatMoney(120000, 'THB')} (${A(5052)}) → ${formatMoney(130000, 'THB')} (${A(5473)})`,
    ])
    const thai = { ...base, amount: 5052, paidBy: { s: 5052 }, splits: { s: 2526, j: 2526 }, original: o(120000) }
    expect(expenseSaveActivity(undefined, thai, ctx)!.summary).toBe(`Sarah added “Dinner” (${formatMoney(120000, 'THB')} (${A(5052)}))`)
    // amount edit where the original stays the same is still shown with it
    expect(expenseSaveActivity(thai, { ...thai, amount: 5000, paidBy: { s: 5000 }, splits: { s: 2500, j: 2500 } }, ctx)!.summary).toBe(
      `Sarah changed amount ${formatMoney(120000, 'THB')} (${A(5052)}) → ${formatMoney(120000, 'THB')} (${A(5000)}) on “Dinner”`,
    )
  })
  it('summarises an import in one entry', () => {
    const a = importActivity('g', 12, 3, 'splitwise', ctx)
    expect(a.type).toBe('expense.imported')
    expect(a.summary).toBe('Sarah imported 12 expenses and 3 payments from Splitwise')
  })
  it('links an entry to its expense, or to the group when it is not about one expense', () => {
    // the import summary's targetId is the group: it must not open /expenses/<groupId>
    expect(activityHref({ ...importActivity('g1', 12, 3, 'splitwise', ctx), groupId: 'g1' })).toBe('/groups/g1')
    expect(activityHref({ type: 'expense.created', groupId: 'g1', targetId: 'e_1' })).toBe('/groups/g1/expenses/e_1')
    expect(activityHref({ type: 'expense.updated', groupId: 'g1', targetId: 'e_1' })).toBe('/groups/g1/expenses/e_1')
    expect(activityHref({ type: 'expense.purged', groupId: 'g1', targetId: 'e_1' })).toBe('/groups/g1')
    expect(activityHref({ type: 'settlement.created', groupId: 'g1', targetId: 's_1' })).toBe('/groups/g1')
    expect(activityHref({ type: 'member.added', groupId: 'g1', targetId: 'p_1' })).toBe('/groups/g1')
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
    // Paid in another currency: the summary says what changed hands too.
    const inr = { ...s, paid: { currency: 'INR', amount: 275000, rate: 0.0182, rateDate: '2026-10-10', source: 'ecb' as const } }
    expect(settlementActivity('created', inr, ctx).summary).toBe(`Sarah recorded a payment: Jay → Sarah ${A(5000)}, paid ${formatMoney(275000, 'INR')}`)
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
    id,
    groupId: 'g',
    type: 'expense.created',
    actorUid,
    actorName: 'Sarah',
    targetId: 'e',
    summary: 'Sarah resolved their flag on “X”',
    createdAt,
  })
  it('own entries read as "You"', () => {
    expect(activityText(entry('a', 1), 'u_sarah')).toBe('You resolved your flag on “X”')
    expect(activityText(entry('a', 1), 'someone')).toBe('Sarah resolved their flag on “X”')
  })
  it('merges feeds newest first', () => {
    expect(mergeFeeds([[entry('a', 1), entry('c', 3)], [entry('b', 2)]], 2).map((a) => a.id)).toEqual(['c', 'b'])
  })
})

describe('settlementActivity for payments that need an OK', () => {
  const s = { id: 's1', groupId: 'g1', from: 'm_b', to: 'me', amount: 50000, method: 'UPI', date: '2026-10-10', createdBy: 'u_b', createdAt: 1 }
  const c: ActivityCtx = { ...ctx, actorName: 'Asha', memberName: (id: string) => ({ m_b: 'Bob', me: 'Asha' })[id] ?? id }
  it('a new one says it waits; confirming and flagging have their own lines', () => {
    expect(settlementActivity('created', { ...s, needsOk: true }, c).summary).toContain('· needs Asha’s OK')
    expect(settlementActivity('created', s, c).summary).not.toContain('needs')
    expect(settlementActivity('approved', s, c)).toMatchObject({ type: 'settlement.approved', targetId: 's1' })
    expect(settlementActivity('approved', s, c).summary).toMatch(/^Asha confirmed a payment: Bob → Asha /)
    expect(settlementActivity('flagged', s, c, ' Not in my account ').summary).toMatch(
      /^Asha says a payment hasn’t arrived: Bob → Asha .*\(“Not in my account”\)$/,
    )
  })
})

describe('groupSettingsActivity', () => {
  const g = { id: 'g1', name: 'Goa', currency: 'INR' }
  const rahul: ActivityCtx = { ...ctx, actorUid: 'u_rahul', actorName: 'Rahul', currency: 'INR' }
  const R = (v: number) => shortMoney(v, 'INR')
  const say = (before: Parameters<typeof groupSettingsActivity>[0], after: Parameters<typeof groupSettingsActivity>[1]) =>
    groupSettingsActivity(before, after, rahul)?.summary

  it('approval on and off', () => {
    expect(say({ ...g, requireApproval: true, approvalThreshold: 500000 }, { ...g })).toBe('Rahul turned off approval')
    expect(say({ ...g, requireApproval: true }, { ...g, requireApproval: false })).toBe('Rahul turned off approval')
    expect(say(g, { ...g, requireApproval: true, approvalThreshold: 200000 })).toBe(`Rahul turned on approval for expenses over ${R(200000)}`)
    // no stored threshold: the currency's default
    expect(say(g, { ...g, requireApproval: true })).toBe(`Rahul turned on approval for expenses over ${R(200000)}`)
  })
  it('the threshold', () => {
    const on = { ...g, requireApproval: true }
    expect(say({ ...on, approvalThreshold: 200000 }, { ...on, approvalThreshold: 500000 })).toBe(`Rahul changed the approval threshold to ${R(500000)}`)
    expect(say(on, { ...on, approvalThreshold: 500000 })).toBe(`Rahul changed the approval threshold to ${R(500000)}`)
    // cleared back to the default it already equalled: nothing to say
    expect(say({ ...on, approvalThreshold: 200000 }, on)).toBeUndefined()
  })
  it('small-edit auto-approve', () => {
    const on = { ...g, requireApproval: true }
    expect(say(on, { ...on, editAutoApprove: 10000 })).toBe(`Rahul turned on small-edit auto-approve up to ${R(10000)}`)
    expect(say({ ...on, editAutoApprove: 10000 }, on)).toBe('Rahul turned off small-edit auto-approve')
    expect(say({ ...on, editAutoApprove: 10000 }, { ...on, editAutoApprove: 20000 })).toBe(`Rahul changed small-edit auto-approve to up to ${R(20000)}`)
    // turning approval off clears it too; that is one change, not two
    expect(say({ ...on, editAutoApprove: 10000 }, g)).toBe('Rahul turned off approval')
    expect(say(g, { ...on, approvalThreshold: 200000, editAutoApprove: 10000 })).toBe(
      `Rahul turned on approval for expenses over ${R(200000)} and turned on small-edit auto-approve up to ${R(10000)}`,
    )
  })
  it('currency, name and budget', () => {
    expect(say(g, { ...g, currency: 'USD' })).toBe('Rahul changed the currency to USD')
    expect(say(g, { ...g, name: 'Goa 2026' })).toBe('Rahul renamed the group to Goa 2026')
    expect(say(g, { ...g, budget: 5000000 })).toBe(`Rahul set a budget of ${R(5000000)}`)
    expect(say({ ...g, budget: 5000000 }, { ...g, budget: 6000000 })).toBe(`Rahul changed the budget to ${R(6000000)}`)
    expect(say({ ...g, budget: 5000000 }, g)).toBe('Rahul removed the budget')
  })
  it('a currency change shows amounts in the new currency, including a converted threshold', () => {
    const on = { ...g, requireApproval: true, approvalThreshold: 200000 }
    expect(say(on, { ...on, currency: 'USD', approvalThreshold: 2500 })).toBe(
      `Rahul changed the currency to USD and changed the approval threshold to ${shortMoney(2500, 'USD')}`,
    )
    // a default threshold stays the default: only the currency is named
    expect(say({ ...g, requireApproval: true }, { ...g, requireApproval: true, currency: 'USD' })).toBe('Rahul changed the currency to USD')
  })
  it('several changes make one entry', () => {
    const a = groupSettingsActivity(g, { ...g, name: 'Goa 2026', currency: 'USD', budget: 100000 }, rahul)
    expect(a?.summary).toBe(`Rahul renamed the group to Goa 2026, changed the currency to USD, and set a budget of ${shortMoney(100000, 'USD')}`)
    expect(a).toMatchObject({ type: 'group.updated', targetId: 'g1', actorUid: 'u_rahul', actorName: 'Rahul', createdAt: 1000 })
    expect(a?.before).toEqual({ name: 'Goa', currency: 'INR' })
    expect(a?.after).toEqual({ name: 'Goa 2026', currency: 'USD', budget: 100000 })
  })
  it('payments need the recipient’s OK, on and off', () => {
    expect(say(g, { ...g, paymentApproval: true })).toBe('Rahul turned on OKs for payments')
    expect(say({ ...g, paymentApproval: true }, { ...g })).toBe('Rahul turned off OKs for payments (every payment counts at once)')
    expect(say({ ...g, paymentApproval: false }, { ...g })).toBeUndefined()
  })
  it('nothing logged for unlisted or unchanged settings', () => {
    expect(groupSettingsActivity(g, { ...g }, rahul)).toBeNull()
    expect(groupSettingsActivity({ ...g, requireApproval: false }, g, rahul)).toBeNull()
    expect(groupSettingsActivity({ ...g, budget: 0 }, g, rahul)).toBeNull()
  })
  it('reads as "You", opens the group and has an icon', () => {
    const a = { ...groupSettingsActivity(g, { ...g, requireApproval: true }, rahul)!, id: 'a1', groupId: 'g1' }
    expect(activityText(a, 'u_rahul')).toBe(`You turned on approval for expenses over ${R(200000)}`)
    expect(activityHref(a)).toBe('/groups/g1')
    expect(activityIcon('group.updated')).toBe('⚙️')
  })
  it('joinPhrases', () => {
    expect(joinPhrases(['a'])).toBe('a')
    expect(joinPhrases(['a', 'b'])).toBe('a and b')
    expect(joinPhrases(['a', 'b', 'c'])).toBe('a, b, and c')
  })
})
