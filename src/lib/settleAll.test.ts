import { describe, expect, it } from 'vitest'
import type { Debt, Group } from '@/types'
import { pendingSettlements, personSummaries, settleHref, totalsByCurrency } from './settleAll'

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

  it('summarises people across groups, per currency', () => {
    expect(personSummaries(rows)).toEqual([{ key: 'u:u_rohan|INR', name: 'Rohan', color: '#f00', currency: 'INR', net: -3500, groups: 2 }])
  })
})
