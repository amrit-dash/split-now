import { describe, expect, it } from 'vitest'
import { cleanQuickRequest, normaliseQuickAi, quickPrompt, toMinor } from './quick-ai'

const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 2 * 86_400_000
const req = cleanQuickRequest(
  {
    text: 'create a group Goa trip with Rahul and Priya and add dinner 2400 paid by me split equally',
    today: '2026-10-09',
    currency: 'INR',
    me: 'Asha',
    groupId: 'g_flat',
    groups: [
      {
        id: 'g_flat',
        name: 'Indiranagar Flat',
        type: 'home',
        members: [
          { id: 'm_rohan', name: 'Rohan Mehta' },
          { id: 'm_dev', name: 'Dev' },
        ],
      },
      { id: 'g_goa', name: 'Goa Trip', type: 'trip', members: [{ id: 'm_rahul', name: 'Rahul' }] },
    ],
  },
  '2026-10-09',
  near,
)!

describe('cleanQuickRequest', () => {
  it('keeps what the prompt needs and drops anything malformed', () => {
    const r = cleanQuickRequest(
      {
        text: `  dinner\u0000 2400 ${'x'.repeat(400)}`,
        today: '2020-01-01',
        currency: 'inr',
        me: 'Asha <script>',
        groupId: 'nope',
        groups: [
          {
            id: 'g1',
            name: 'Trip 🏖️',
            members: [
              { id: 'a', name: 'Rahul' },
              { id: 'bad id!', name: 'X' },
              { id: 'b', name: '' },
            ],
          },
          { id: 'g1', name: 'Duplicate', members: [] },
          { id: '../x', name: 'Bad', members: [] },
          'junk',
        ],
      },
      '2026-10-09',
      near,
    )!
    expect(r.text.length).toBe(300)
    expect(r.text.startsWith('dinner 2400')).toBe(true)
    expect(r.today).toBe('2026-10-09')
    expect(r.currency).toBe('INR')
    expect(r.me).toBe('Asha script')
    expect(r.groupId).toBeUndefined()
    expect(r.groups).toEqual([{ id: 'g1', name: 'Trip', members: [{ id: 'a', name: 'Rahul' }] }])
    expect(cleanQuickRequest({ text: '   ' }, '2026-10-09', near)).toBeNull()
    expect(cleanQuickRequest(null, '2026-10-09', near)).toBeNull()
  })
  it('the prompt lists the groups and the default, never the writer as a member', () => {
    const p = quickPrompt(req)
    expect(p).toContain('id g_flat: "Indiranagar Flat" (home); members: m_rohan=Rohan Mehta, m_dev=Dev')
    expect(p).toContain('the cost goes into g_flat')
    expect(p).toContain('The writer is "Asha"')
    expect(p).toContain('untrusted data')
  })
})

describe('toMinor', () => {
  it('turns major units into integer minor units, by the currency', () => {
    expect(toMinor(2400, 'INR')).toBe(240000)
    expect(toMinor('1,250.5', 'INR')).toBe(125050)
    expect(toMinor(1500, 'JPY')).toBe(1500)
    expect(toMinor(0.004, 'INR')).toBeUndefined()
    expect(toMinor(-5, 'INR')).toBeUndefined()
    expect(toMinor(Number.NaN, 'INR')).toBeUndefined()
    expect(toMinor(1e12, 'INR')).toBeUndefined()
  })
})

describe('normaliseQuickAi', () => {
  it('a new group with an expense: names kept, me left out, equal split', () => {
    const r = normaliseQuickAi(
      {
        action: 'group_and_expense',
        newGroupName: 'Goa trip',
        newGroupType: 'trip',
        newGroupMembers: ['Rahul', 'Priya', 'me', 'rahul', 'Asha'],
        description: 'Dinner',
        amount: 2400,
        paidBy: 'me',
        splitMode: 'equal',
      },
      req,
    )
    expect(r).toEqual({
      action: 'group_and_expense',
      group: { name: 'Goa trip', type: 'trip', members: ['Rahul', 'Priya'] },
      expense: { description: 'Dinner', amount: 240000, currency: 'INR', paidBy: 'me', split: 'equal' },
    })
  })
  it('a payer or participant named only there joins the new group; an unknown type is dropped', () => {
    const r = normaliseQuickAi(
      {
        action: 'group_and_expense',
        newGroupName: 'Lunch',
        newGroupType: 'spaceship',
        newGroupMembers: ['Rahul'],
        amount: 900,
        paidBy: 'Kiran',
        participants: ['me', 'rahul', 'Kiran'],
      },
      req,
    )
    expect(r.action === 'group_and_expense' && r.group).toEqual({ name: 'Lunch', members: ['Rahul', 'Kiran'] })
    expect(r.action === 'group_and_expense' && r.expense.paidBy).toBe('Kiran')
    expect(r.action === 'group_and_expense' && r.expense.participants).toEqual(['me', 'Rahul', 'Kiran'])
  })
  it('an expense in an existing group: ids from that group only, names resolved, invented ids dropped', () => {
    const r = normaliseQuickAi(
      {
        action: 'expense',
        groupId: 'g_flat',
        description: 'Groceries',
        amount: 640,
        paidBy: 'Rohan',
        participants: ['me', 'm_dev', 'm_rahul', 'ghost'],
        date: '2026-10-08',
      },
      req,
    )
    expect(r).toEqual({
      action: 'expense',
      group: { existingId: 'g_flat' },
      expense: {
        description: 'Groceries',
        amount: 64000,
        currency: 'INR',
        paidBy: 'm_rohan',
        split: 'equal',
        participants: ['me', 'm_dev'],
        date: '2026-10-08',
      },
    })
  })
  it('an unknown group id falls back to the picked group; an unknown payer is me', () => {
    const r = normaliseQuickAi({ action: 'expense', groupId: 'g_made_up', description: 'Cab', amount: 300, paidBy: 'Zed' }, req)
    expect(r.action === 'expense' && r.group.existingId).toBe('g_flat')
    expect(r.action === 'expense' && r.expense.paidBy).toBe('me')
  })
  it('exact shares are kept only when they add up to the amount', () => {
    const ok = normaliseQuickAi(
      {
        action: 'expense',
        groupId: 'g_flat',
        description: 'Rent',
        amount: 1000,
        splitMode: 'amounts',
        shares: [
          { person: 'me', amount: 600 },
          { person: 'm_dev', amount: 400 },
        ],
      },
      req,
    )
    expect(ok.action === 'expense' && ok.expense.split).toEqual({ me: 60000, m_dev: 40000 })
    expect(ok.action === 'expense' && ok.expense.participants).toEqual(['me', 'm_dev'])
    const off = normaliseQuickAi(
      {
        action: 'expense',
        groupId: 'g_flat',
        description: 'Rent',
        amount: 1000,
        splitMode: 'amounts',
        shares: [
          { person: 'me', amount: 600 },
          { person: 'm_dev', amount: 300 },
        ],
      },
      req,
    )
    expect(off.action === 'expense' && off.expense.split).toBe('equal')
    expect(off.action === 'expense' && off.expense.participants).toEqual(['me', 'm_dev'])
  })
  it('dates far from today, silly amounts and other currencies are handled', () => {
    const r = normaliseQuickAi({ action: 'expense', description: 'Hotel', amount: 120.5, currency: 'usd', date: '2019-01-01' }, req)
    expect(r.action === 'expense' && r.expense).toEqual({ description: 'Hotel', amount: 12050, currency: 'USD', paidBy: 'me', split: 'equal' })
    const big = normaliseQuickAi({ action: 'expense', description: 'Yacht', amount: 1e15 }, req)
    expect(big.action === 'expense' && big.expense.amount).toBeUndefined()
  })
  it('anything unusable is unknown', () => {
    expect(normaliseQuickAi(null, req)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi('{"action":"expense"}', req)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi({ action: 'delete_everything' }, req)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi({ action: 'expense', groupId: 'g_flat' }, req)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi({ action: 'group_and_expense', newGroupMembers: ['Rahul'], amount: 10 }, req)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi({ action: 'expense', amount: 10 }, { ...req, groupId: undefined })).toEqual({ action: 'unknown' })
  })
})
