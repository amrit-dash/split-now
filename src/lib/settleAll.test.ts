import { describe, expect, it } from 'vitest'
import type { Debt, Group } from '@/types'
import { groupCount, pendingSettlements, personBalances, settleHref, totalsByCurrency } from './settleAll'

const g = (id: string, currency: string, members: Group['members'], type: Group['type'] = 'trip') =>
  ({ id, name: `G ${id}`, emoji: '🏖️', type, currency, members })
const members = {
  me: { name: 'Me', uid: 'u_me', color: '#111' },
  r: { name: 'Rohan', uid: 'u_rohan', color: '#f00' },
  p: { name: 'Priya', color: '#0f0' },
  x: { name: 'Xavier', color: '#00f' },
}

describe('settleAll', () => {
  const data: Array<{ group: ReturnType<typeof g>; me?: string; debts: Debt[] }> = [
    { group: g('a', 'INR', members), me: 'me', debts: [{ from: 'me', to: 'r', amount: 5000 }, { from: 'p', to: 'me', amount: 2000 }, { from: 'x', to: 'r', amount: 999 }] },
    // Rohan has a different member id in this group; matched by uid.
    { group: g('b', 'INR', { m1: members.me, m2: { name: 'Rohan K', uid: 'u_rohan', color: '#f00' } }), me: 'm1', debts: [{ from: 'm2', to: 'm1', amount: 1500 }] },
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
    expect(people[0].parts.map((r) => [r.me, r.memberId, r.dir])).toEqual([['me', 'r', 'owe'], ['m1', 'm2', 'owed']])
  })

  it('keeps people whose groups cancel out exactly', () => {
    const even = pendingSettlements([
      { group: g('a', 'INR', members), me: 'me', debts: [{ from: 'me', to: 'p', amount: 300 }] },
      { group: g('b', 'INR', members), me: 'me', debts: [{ from: 'p', to: 'me', amount: 300 }] },
    ])
    expect(personBalances(even).map((p) => [p.name, p.net, p.parts.length])).toEqual([['Priya', 0, 2]])
  })
})
