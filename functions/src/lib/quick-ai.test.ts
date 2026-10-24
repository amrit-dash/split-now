import { describe, expect, it } from 'vitest'
import { cleanQuickRequest, normaliseQuickAi, quickPrompt, sharersFromLine, splitParts, toMinor } from './quick-ai'

const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 2 * 86_400_000
const req = cleanQuickRequest(
  {
    text: 'create a group Goa trip with Rahul and Priya and add dinner paid by me split equally',
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
        text: `  dinner\u0000 2400 ${'x'.repeat(700)}`,
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
    expect(r.text.length).toBe(600)
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
    // Not inside a group: the people named choose it, the default only when it names nobody.
    expect(p).toContain('when it names nobody, g_flat')
    expect(quickPrompt({ ...req, groupIdSure: true })).toContain('The writer is inside g_flat')
    expect(p).toContain('The writer is "Asha"')
    expect(p).toContain('untrusted data')
  })
  it('the prompt expects rough speech (clean up first, then understand) and says what to do with a line it can’t act on', () => {
    const p = quickPrompt(req)
    expect(p).toContain('rough speech-to-text transcript')
    expect(p).toContain('"twelve hundred" is 1200')
    expect(p.indexOf('First work out what was meant')).toBeLessThan(p.indexOf('Rules:'))
    expect(p).toContain('"make me a sandwich"')
    expect(p).toContain('action unknown')
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

describe('group-only answers', () => {
  const none = cleanQuickRequest(
    { text: 'Create a group for my Bali trip with Rahul, Priya and Subramaniam', today: '2026-10-09', me: 'Asha', groups: [], groupOnly: true },
    '2026-10-09',
    near,
  )!
  const answer = { action: 'group_and_expense', newGroupName: 'Bali Trip', newGroupType: 'trip', newGroupMembers: ['Rahul', 'Priya', 'Subramaniam', 'Asha'] }
  it('a new group with no cost is a group, for an app that takes one', () => {
    expect(none.groupOnly).toBe(true)
    expect(normaliseQuickAi(answer, none)).toEqual({ action: 'group', group: { name: 'Bali Trip', type: 'trip', members: ['Rahul', 'Priya', 'Subramaniam'] } })
  })
  it('older apps still get unknown for it', () => {
    const old = cleanQuickRequest({ text: 'x', today: '2026-10-09', me: 'Asha', groups: [] }, '2026-10-09', near)!
    expect(old.groupOnly).toBeUndefined()
    expect(normaliseQuickAi(answer, old)).toEqual({ action: 'unknown' })
  })
  it('the prompt tells the model there are no groups, and to leave the cost empty', () => {
    const p = quickPrompt(none)
    expect(p).toContain('no groups yet')
    expect(p).toContain('records no cost')
    expect(p).toContain('Bali Trip')
  })
})

describe('open items', () => {
  const withItems = { ...req, openItems: true }
  it('the request carries the switch, and the prompt explains open_item only then', () => {
    expect(cleanQuickRequest({ ...req, openItems: true }, '2026-10-09', near)?.openItems).toBe(true)
    expect(cleanQuickRequest({ ...req, openItems: 'yes' }, '2026-10-09', near)?.openItems).toBeUndefined()
    expect(quickPrompt(withItems)).toContain('action open_item')
    expect(quickPrompt(req)).not.toContain('action open_item')
  })
  it('an open item: title, amount and date when given, suspects resolved to the group', () => {
    expect(
      normaliseQuickAi(
        { action: 'open_item', groupId: 'g_flat', description: 'Lunch at Cafe Blue', amount: 290, date: '2026-10-02', maybePaidBy: ['Rohan', 'me', 'Zed'] },
        withItems,
      ),
    ).toEqual({
      action: 'open_item',
      group: { existingId: 'g_flat' },
      item: { title: 'Lunch at Cafe Blue', currency: 'INR', amount: 29000, date: '2026-10-02', suspects: ['m_rohan', 'me'] },
    })
  })
  it('no title, or no group: unknown; the default group when none is named', () => {
    expect(normaliseQuickAi({ action: 'open_item', groupId: 'g_flat', amount: 290 }, withItems)).toEqual({ action: 'unknown' })
    expect(normaliseQuickAi({ action: 'open_item', groupId: 'nope', description: 'Taxi' }, withItems)).toMatchObject({
      action: 'open_item',
      group: { existingId: 'g_flat' },
    })
  })
  it('an app without open items gets an expense instead', () => {
    expect(normaliseQuickAi({ action: 'open_item', groupId: 'g_flat', description: 'Taxi', amount: 400 }, req)).toMatchObject({
      action: 'expense',
      expense: { description: 'Taxi', amount: 40000 },
    })
  })
})

describe('splitParts', () => {
  it('amounts as given, the rest to whoever shares it with no part of their own', () => {
    expect(splitParts('amounts', [['p_rahul', 400]], ['me'], 60000, 'INR')).toEqual({ p_rahul: 40000, me: 20000 })
    expect(splitParts('amounts', [['p_rahul', 400]], ['me', 'p_priya'], 60000, 'INR')).toEqual({ p_rahul: 40000, me: 10000, p_priya: 10000 })
    // parts over the amount, or a rest with nobody to take it: not exact
    expect(splitParts('amounts', [['p_rahul', 700]], ['me'], 60000, 'INR')).toBeNull()
    expect(splitParts('amounts', [['p_rahul', 400]], [], 60000, 'INR')).toBeNull()
  })
  it('percents of the amount (a rest to the others), shares as weights, always adding up', () => {
    expect(
      splitParts(
        'percent',
        [
          ['me', 60],
          ['p_meera', 40],
        ],
        [],
        150000,
        'INR',
      ),
    ).toEqual({ me: 90000, p_meera: 60000 })
    expect(splitParts('percent', [['p_rahul', 30]], ['me'], 100000, 'INR')).toEqual({ p_rahul: 30000, me: 70000 })
    expect(
      splitParts(
        'shares',
        [
          ['p_rahul', 2],
          ['p_priya', 1],
          ['me', 1],
        ],
        [],
        900000,
        'INR',
      ),
    ).toEqual({ p_rahul: 450000, p_priya: 225000, me: 225000 })
    const odd = splitParts(
      'shares',
      [
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ],
      [],
      100,
      'INR',
    )!
    expect(Object.values(odd).reduce((x, y) => x + y, 0)).toBe(100)
  })
})

describe('sharersFromLine: names', () => {
  const g = {
    id: 'g',
    name: 'College',
    members: [
      { id: 'rs', name: 'Rahul Sharma' },
      { id: 'rv', name: 'Rahul Verma' },
      { id: 'n', name: 'Neha' },
      { id: 'ro', name: 'Rohan' },
    ],
  }
  it('a full name is that member alone', () => {
    expect(sharersFromLine('dinner 900 with Rahul Verma', g, 'me', undefined)).toEqual(['me', 'rv'])
    // even when the model put both Rahuls in
    expect(sharersFromLine('dinner 900 with Rahul Verma', g, 'me', ['me', 'rs', 'rv'])).toEqual(['me', 'rv'])
  })
  it('someone the line leaves out in plain words stays out, even though it names them (owner’s line, 24 Oct 2026)', () => {
    const line = 'I paid for lunch for 1262. It was split by all but I remember Neha was not a part of that lunch. Split it equally amongst the rest.'
    expect(sharersFromLine(line, g, 'me', ['me', 'rs', 'rv', 'ro'])).toEqual(['me', 'rs', 'rv', 'ro'])
    // the model said everyone: the words still leave Neha out
    expect(sharersFromLine(line, g, 'me', undefined)).toEqual(['me', 'rs', 'rv', 'ro'])
    expect(sharersFromLine('dinner 1200, Rohan didn’t come', g, 'me', undefined)).toEqual(['me', 'rs', 'rv', 'n'])
  })
  it('“everyone but Neha” and “only Rohan and Neha ate” (eval misses, 24 Oct 2026)', () => {
    expect(sharersFromLine('beer 900 everyone but Neha', g, 'me', undefined)).toEqual(['me', 'rs', 'rv', 'ro'])
    expect(sharersFromLine('lunch 900, Rohan paid, only Rohan and Neha ate', g, 'ro', ['me', 'n', 'ro'])).toEqual(['n', 'ro'])
    expect(sharersFromLine('taxi 700 Rohan paid, me and Rohan only', g, 'ro', undefined)).toEqual(['me', 'ro'])
    // "all but I remember…" is not "everyone but me"
    expect(sharersFromLine('split by all but I remember Neha was not there', g, 'me', undefined)).toEqual(['me', 'rs', 'rv', 'ro'])
  })
  it('“for Rohan” is bought for Rohan; “with” shares it', () => {
    expect(sharersFromLine('lunch for Rohan 500', g, 'me', undefined)).toEqual(['ro'])
    expect(sharersFromLine('lunch for Rohan 500 with Neha', g, 'me', undefined)).toEqual(['me', 'n', 'ro'])
  })
})

describe('sharersFromLine', () => {
  const g = {
    id: 'g_goa',
    name: 'Goa',
    members: [
      { id: 'p_rahul', name: 'Rahul Sharma' },
      { id: 'p_priya', name: 'Priya' },
      { id: 'p_rohan', name: 'Rohan' },
    ],
  }
  it('people named in the line, with the writer and the payer, not the whole group', () => {
    expect(sharersFromLine('lunch with Rahul 1762 they paid', g, 'p_rahul', undefined)).toEqual(['me', 'p_rahul'])
    expect(sharersFromLine('coffee with Priya 300', g, 'me', undefined)).toEqual(['me', 'p_priya'])
  })
  it('everyone, or nobody named: the whole group', () => {
    expect(sharersFromLine('dinner 2400 for everyone, Rohan paid', g, 'p_rohan', undefined)).toBeUndefined()
    expect(sharersFromLine('movie 600', g, 'me', undefined)).toBeUndefined()
  })
  it('everyone except someone: the writer stays in', () => {
    expect(sharersFromLine('taxi 900 everyone except Rohan, Priya paid', g, 'p_priya', ['p_priya', 'p_rahul'])).toEqual(['me', 'p_rahul', 'p_priya'])
  })
  it('a cost only for others leaves the payer out', () => {
    expect(sharersFromLine("I paid for Rahul's ticket 500", g, 'me', ['p_rahul'])).toEqual(['p_rahul'])
  })
})

describe('payments and other groups that fit', () => {
  const r2 = { ...req, payments: true }
  it('a payment between two people, the writer on one side when the line names only one', () => {
    expect(normaliseQuickAi({ action: 'payment', groupId: 'g_goa', paidTo: 'm_rahul', amount: 500 }, r2)).toEqual({
      action: 'payment',
      group: { existingId: 'g_goa' },
      payment: { from: 'me', to: 'm_rahul', currency: 'INR', amount: 50000 },
    })
    expect(normaliseQuickAi({ action: 'payment', groupId: 'g_goa', paidBy: 'me', paidTo: 'me', amount: 5 }, r2)).toEqual({ action: 'unknown' })
    // an app that doesn't take payments never gets one
    expect(normaliseQuickAi({ action: 'payment', groupId: 'g_goa', paidTo: 'm_rahul', amount: 500 }, req).action).toBe('unknown')
  })
  it("other groups that fit, only when the person wasn't inside a group", () => {
    const a = normaliseQuickAi({ action: 'expense', groupId: 'g_goa', otherGroupIds: ['g_flat', 'nope', 'g_goa'], description: 'tea', amount: 50 }, r2)
    expect(a.action === 'expense' && a.alsoFits).toEqual(['g_flat'])
    const sure = normaliseQuickAi(
      { action: 'expense', groupId: 'g_goa', otherGroupIds: ['g_flat'], description: 'tea', amount: 50 },
      { ...r2, groupIdSure: true },
    )
    expect(sure.action === 'expense' && 'alsoFits' in sure).toBe(false)
  })
  it('inside a group the answer stays there, even when the model picks another', () => {
    const sure = { ...r2, groupIdSure: true }
    const pay = normaliseQuickAi({ action: 'payment', groupId: 'g_goa', paidTo: 'Dev', amount: 500 }, sure)
    expect(pay).toMatchObject({ action: 'payment', group: { existingId: 'g_flat' }, payment: { from: 'me', to: 'm_dev' } })
    const cost = normaliseQuickAi({ action: 'expense', groupId: 'g_goa', description: 'tea', amount: 50 }, sure)
    expect(cost.action === 'expense' && cost.group).toEqual({ existingId: 'g_flat' })
    // not inside one: the model's pick stands
    const free = normaliseQuickAi({ action: 'expense', groupId: 'g_goa', description: 'tea', amount: 50 }, r2)
    expect(free.action === 'expense' && free.group).toEqual({ existingId: 'g_goa' })
  })
})
