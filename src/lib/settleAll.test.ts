import { describe, expect, it } from 'vitest'
import type { Debt, Group } from '@/types'
import type { SettleRow } from './settleAll'
import {
  groupSettleTarget,
  canNudgePerson,
  groupCount,
  groupNames,
  nettableRows,
  pendingSettlements,
  personBalances,
  personNudgeItems,
  settleHref,
  settlePersonHref,
  signedAmount,
  totalsByCurrency,
} from './settleAll'

const g = (id: string, currency: string, members: Group['members'], type: Group['type'] = 'trip') => ({
  id,
  name: `G ${id}`,
  emoji: '🏖️',
  type,
  currency,
  members,
})
const members = {
  me: { name: 'Me', uid: 'u_me', color: '#111' },
  r: { name: 'Rohan', uid: 'u_rohan', color: '#f00' },
  p: { name: 'Priya', color: '#0f0' },
  x: { name: 'Xavier', color: '#00f' },
}

describe('settleAll', () => {
  const data: Array<{ group: ReturnType<typeof g>; me?: string; debts: Debt[] }> = [
    {
      group: g('a', 'INR', members),
      me: 'me',
      debts: [
        { from: 'me', to: 'r', amount: 5000 },
        { from: 'p', to: 'me', amount: 2000 },
        { from: 'x', to: 'r', amount: 999 },
      ],
    },
    // Rohan has a different member id in this group; matched by uid.
    {
      group: g('b', 'INR', { m1: members.me, m2: { name: 'Rohan K', uid: 'u_rohan', color: '#f00' } }),
      me: 'm1',
      debts: [{ from: 'm2', to: 'm1', amount: 1500 }],
    },
    { group: g('c', 'AUD', members), me: 'me', debts: [{ from: 'r', to: 'me', amount: 700 }] },
    { group: g('d', 'INR', members, 'personal'), me: 'me', debts: [{ from: 'me', to: 'r', amount: 1 }] },
    { group: g('e', 'INR', members), me: undefined, debts: [{ from: 'me', to: 'r', amount: 1 }] },
  ]
  const rows = pendingSettlements(data, 'INR')

  it('lists only payments involving me, skipping personal groups and groups I am not in', () => {
    expect(rows.map((r) => [r.groupId, r.name, r.dir, r.amount])).toEqual([
      ['a', 'Rohan', 'owe', 5000],
      ['a', 'Priya', 'owed', 2000],
      ['b', 'Rohan K', 'owed', 1500],
      ['c', 'Rohan', 'owed', 700],
    ])
  })

  it('leaves archived groups out', () => {
    const archived = { group: { ...g('z', 'INR', members), archived: true }, me: 'me', debts: [{ from: 'me', to: 'r', amount: 300 }] }
    expect(pendingSettlements([...data, archived], 'INR').some((r) => r.groupId === 'z')).toBe(false)
  })

  it('puts the home currency first', () => {
    expect(pendingSettlements(data, 'AUD').map((r) => r.groupId)).toEqual(['c', 'a', 'a', 'b'])
  })

  it('links to the group settle page with the payment preselected', () => {
    expect(rows[0].href).toBe('/groups/a/settle?from=me&to=r&amount=5000')
    expect(rows[1].href).toBe('/groups/a/settle?from=p&to=me&amount=2000')
    expect(settleHref('a b', 'x', 'y', 1)).toBe('/groups/a%20b/settle?from=x&to=y&amount=1')
  })

  it('totals per currency without mixing, home currency first', () => {
    expect(totalsByCurrency(rows, 'AUD')).toEqual([
      { currency: 'AUD', owe: 0, owed: 700 },
      { currency: 'INR', owe: 5000, owed: 3500 },
    ])
    expect(totalsByCurrency([], 'INR')).toEqual([])
  })

  it('nets each person across groups, per currency, keeping the per-group parts', () => {
    const people = personBalances(rows)
    expect(people.map((p) => [p.key, p.name, p.currency, p.net, groupCount(p), p.parts.map((r) => r.groupId)])).toEqual([
      ['u:u_rohan|INR', 'Rohan', 'INR', -3500, 2, ['a', 'b']],
      ['n:priya|INR', 'Priya', 'INR', 2000, 1, ['a']],
      ['u:u_rohan|AUD', 'Rohan', 'AUD', 700, 1, ['c']],
    ])
    expect(people[0].parts.map((r) => [r.me, r.memberId, r.dir])).toEqual([
      ['me', 'r', 'owe'],
      ['m1', 'm2', 'owed'],
    ])
  })

  it('keeps people whose groups cancel out exactly', () => {
    const even = pendingSettlements([
      { group: g('a', 'INR', members), me: 'me', debts: [{ from: 'me', to: 'p', amount: 300 }] },
      { group: g('b', 'INR', members), me: 'me', debts: [{ from: 'p', to: 'me', amount: 300 }] },
    ])
    expect(personBalances(even).map((p) => [p.name, p.net, p.parts.length])).toEqual([['Priya', 0, 2]])
  })

  it('links a person to their cross-group settle screen and signs each group', () => {
    const people = personBalances(rows)
    expect(settlePersonHref(people[0])).toBe('/settle/with/u%3Au_rohan%7CINR')
    expect(people[0].parts.map(signedAmount)).toEqual([-5000, 1500])
    expect(people[0].parts.map(signedAmount).reduce((a, b) => a + b, 0)).toBe(people[0].net)
  })
})

describe('nudging a person across groups', () => {
  const row = (over: Partial<SettleRow>): SettleRow => ({
    key: 'k',
    groupId: 'g1',
    groupName: 'Goa trip',
    groupEmoji: '🏖️',
    currency: 'INR',
    me: 'me',
    memberId: 'r',
    name: 'Rohan',
    label: 'Rohan',
    color: '#f00',
    uid: 'u_rohan',
    amount: 1000,
    dir: 'owed',
    href: '/x',
    ...over,
  })
  const p = {
    net: 1500,
    parts: [
      row({}),
      row({ groupId: 'g2', groupName: 'Flat', memberId: 'm2', amount: 800 }),
      row({ groupId: 'g3', groupName: 'Office', dir: 'owe', amount: 300 }),
    ],
  }
  it('sends every group with an account, the hint only where they owe you', () => {
    expect(personNudgeItems(p)).toEqual([
      { groupId: 'g1', memberId: 'r', amount: 1000 },
      { groupId: 'g2', memberId: 'm2', amount: 800 },
      { groupId: 'g3', memberId: 'r' },
    ])
    expect(personNudgeItems({ parts: [row({ uid: undefined })] })).toEqual([])
    expect(groupNames({ parts: [...p.parts, row({})] })).toEqual(['Goa trip', 'Flat', 'Office'])
  })
  it('offers Nudge only when they owe you overall and have an account', () => {
    expect(canNudgePerson(p, 'u_me')).toBe(true)
    expect(canNudgePerson({ ...p, net: 0 }, 'u_me')).toBe(false)
    expect(canNudgePerson({ ...p, net: -10 }, 'u_me')).toBe(false)
    expect(canNudgePerson({ net: 100, parts: [row({ uid: undefined })] }, 'u_me')).toBe(false)
    expect(canNudgePerson({ net: 100, parts: [row({})] }, 'u_rohan')).toBe(false)
  })
})

describe('groupSettleTarget', () => {
  const d = (from: string, to: string, amount = 100) => ({ from, to, amount })
  it('opens your one payment, prefilled, even when others still owe each other', () => {
    expect(groupSettleTarget('g1', [d('a', 'me', 500)], 'me')).toEqual({ href: '/groups/g1/settle?from=a&to=me&amount=500' })
    expect(groupSettleTarget('g1', [d('me', 'b', 250), d('c', 'b')], 'me')).toEqual({ href: '/groups/g1/settle?from=me&to=b&amount=250' })
  })
  it("opens the group's Balances when there are several payments to choose from", () => {
    expect(groupSettleTarget('g1', [d('a', 'me'), d('c', 'me')], 'me')).toEqual({ tab: 'balances' })
    expect(groupSettleTarget('g1', [d('a', 'b')], 'me')).toEqual({ tab: 'balances' })
    expect(groupSettleTarget('g1', [d('a', 'b')])).toEqual({ tab: 'balances' })
  })
  it("opens the group's Balances (and its celebration) when nothing is owed", () => {
    expect(groupSettleTarget('g1', [], 'me')).toEqual({ tab: 'balances' })
    expect(groupSettleTarget('g1', [])).toEqual({ tab: 'balances' })
  })
})

describe('nettableRows', () => {
  const row = (over: Partial<SettleRow>): SettleRow => ({
    key: 'k',
    groupId: 'g1',
    groupName: 'Goa trip',
    groupEmoji: '🏖️',
    currency: 'INR',
    me: 'me',
    memberId: 'r',
    name: 'Rohan',
    label: 'Rohan',
    color: '#f00',
    uid: 'u_rohan',
    amount: 1000,
    dir: 'owed',
    href: '/x',
    ...over,
  })
  it('holds out what I owe in a group that needs their OK when they owe me more overall', () => {
    const rows = [row({ groupId: 'g1', amount: 1000 }), row({ key: 'k2', groupId: 'g2', dir: 'owe', amount: 300 })]
    const { rows: kept, held } = nettableRows(rows, new Set(['g2']))
    expect(kept.map((r) => r.groupId)).toEqual(['g1'])
    expect(held.map((r) => r.groupId)).toEqual(['g2'])
  })
  it('nets as before when that group doesn’t ask for an OK, or when I owe overall', () => {
    const rows = [row({ groupId: 'g1', amount: 1000 }), row({ key: 'k2', groupId: 'g2', dir: 'owe', amount: 300 })]
    expect(nettableRows(rows, new Set()).held).toEqual([])
    const iOwe = [row({ groupId: 'g1', amount: 100 }), row({ key: 'k2', groupId: 'g2', dir: 'owe', amount: 300 })]
    expect(nettableRows(iOwe, new Set(['g2'])).held).toEqual([])
  })
  it('a single group is never held', () => {
    expect(nettableRows([row({ dir: 'owe' })], new Set(['g1'])).held).toEqual([])
  })
})

describe('names across groups', () => {
  it('two different Rahuls on one screen get their last initials; everyone else a first name', () => {
    const g = (id: string, other: { name: string; uid?: string }) => ({
      group: {
        id,
        name: id,
        emoji: '🏖️',
        type: 'trip' as const,
        currency: 'INR',
        members: { me: { name: 'Asha', uid: 'u0', color: '#000' }, o: { ...other, color: '#000' } },
      },
      me: 'me',
      debts: [{ from: 'o', to: 'me', amount: 100 }],
    })
    const rows = pendingSettlements([g('g1', { name: 'Rahul Sharma', uid: 'u1' }), g('g2', { name: 'Rahul Kumar' }), g('g3', { name: 'Priya Iyer' })])
    expect(Object.fromEntries(rows.map((r) => [r.groupId, r.label]))).toEqual({ g1: 'Rahul S.', g2: 'Rahul K.', g3: 'Priya' })
    expect(
      personBalances(rows)
        .map((p) => p.label)
        .sort(),
    ).toEqual(['Priya', 'Rahul K.', 'Rahul S.'])
  })
})
