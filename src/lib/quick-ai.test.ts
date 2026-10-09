import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import { buildQuickRequest, listNames, matchKnown, newGroupPrefill, parsePeopleParam, planQuickAi, quickGroupName } from './quick-ai'
import type { KnownPerson } from './people'

const group = (id: string, name: string, members: Group['members'], extra: Partial<Group> = {}): Group => ({
  id,
  name,
  emoji: '✈️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: Object.values(members)
    .map((m) => m.uid)
    .filter((x): x is string => !!x),
  members,
  inviteCode: 'X',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})
const flat = group('g_flat', 'Indiranagar Flat', {
  u1: { name: 'Asha', uid: 'u1', color: '#000' },
  m_rohan: { name: 'Rohan Mehta', color: '#000' },
  m_dev: { name: 'Dev', color: '#000' },
})
const goa = group('g_goa', 'Goa Trip', { me1: { name: 'Asha', uid: 'u1', color: '#000' }, m_rahul: { name: 'Rahul Sharma', color: '#000' } })
const known: KnownPerson[] = [
  { name: 'Rahul Sharma', email: 'rahul@example.com', n: 2 },
  { name: 'Priya', n: 1 },
  { name: 'Rohan Mehta', n: 1 },
  { name: 'Rohan Das', n: 1 },
]
let n = 0
const makeId = () => `p_${++n}`
const opts = {
  line: 'the line',
  groups: [flat, goa],
  uid: 'u1',
  me: { name: 'Asha', email: 'asha@example.com' },
  currency: 'INR',
  today: '2026-10-09',
  known,
  makeId,
}

describe('buildQuickRequest', () => {
  it('puts the picked group first and leaves the caller out of every member list', () => {
    const r = buildQuickRequest({ text: '  dinner 2400  ', groups: [flat, goa], uid: 'u1', me: 'Asha', target: goa, today: '2026-10-09' })
    expect(r).toEqual({
      text: 'dinner 2400',
      today: '2026-10-09',
      currency: 'INR',
      me: 'Asha',
      groupId: 'g_goa',
      groups: [
        { id: 'g_goa', name: 'Goa Trip', type: 'trip', members: [{ id: 'm_rahul', name: 'Rahul Sharma' }] },
        {
          id: 'g_flat',
          name: 'Indiranagar Flat',
          type: 'trip',
          members: [
            { id: 'm_rohan', name: 'Rohan Mehta' },
            { id: 'm_dev', name: 'Dev' },
          ],
        },
      ],
    })
  })
})

describe('matchKnown', () => {
  it('a full name, else a first name only one person has', () => {
    expect(matchKnown('rahul', known)?.name).toBe('Rahul Sharma')
    expect(matchKnown('Rohan', known)).toBeUndefined()
    expect(matchKnown('rohan das', known)?.name).toBe('Rohan Das')
    expect(matchKnown('Zoya', known)).toBeUndefined()
  })
})

describe('planQuickAi', () => {
  it('an expense in an existing group: me becomes your member id, unknown ids are dropped', () => {
    const plan = planQuickAi(
      {
        action: 'expense',
        group: { existingId: 'g_flat' },
        expense: {
          description: 'groceries',
          amount: 64000,
          currency: 'INR',
          paidBy: 'm_rohan',
          split: 'equal',
          participants: ['me', 'm_dev', 'm_ghost'],
          date: '2026-10-08',
        },
      },
      opts,
    )
    expect(plan).toEqual({
      kind: 'expense',
      groupId: 'g_flat',
      prefill: {
        text: 'the line',
        description: 'Groceries',
        amount: 64000,
        currency: 'INR',
        payer: 'm_rohan',
        participants: ['u1', 'm_dev'],
        date: '2026-10-08',
      },
    })
  })
  it('exact amounts map onto member ids, and are dropped when someone can’t be placed', () => {
    const base = { action: 'expense' as const, group: { existingId: 'g_goa' } }
    const ok = planQuickAi({ ...base, expense: { description: 'Hotel', amount: 1000, currency: 'INR', paidBy: 'me', split: { me: 600, m_rahul: 400 } } }, opts)
    expect(ok.kind === 'expense' && ok.prefill.exact).toEqual({ me1: 600, m_rahul: 400 })
    expect(ok.kind === 'expense' && ok.prefill.payer).toBe('me1')
    const odd = planQuickAi({ ...base, expense: { description: 'Hotel', amount: 1000, currency: 'INR', paidBy: 'me', split: { me: 600, ghost: 400 } } }, opts)
    expect(odd.kind === 'expense' && odd.prefill.exact).toBeUndefined()
  })
  it('a group you’re not in, or an unknown answer, falls back to the phone’s reading', () => {
    expect(
      planQuickAi({ action: 'expense', group: { existingId: 'g_x' }, expense: { description: 'x', currency: 'INR', paidBy: 'me', split: 'equal' } }, opts),
    ).toEqual({
      kind: 'fallback',
    })
    expect(planQuickAi({ action: 'unknown' }, opts)).toEqual({ kind: 'fallback' })
  })
  it('a new group: you plus the named people (known ones by full name and email), the expense on their ids', () => {
    n = 0
    const plan = planQuickAi(
      {
        action: 'group_and_expense',
        group: { name: 'Goa trip', members: ['Rahul', 'priya', 'Kiran', 'rahul sharma'] },
        expense: { description: 'Dinner', amount: 240000, currency: 'INR', paidBy: 'me', split: 'equal', participants: ['me', 'Rahul', 'priya'] },
      },
      opts,
    )
    expect(plan.kind).toBe('create')
    if (plan.kind !== 'create') return
    expect(plan.people).toEqual(['Rahul Sharma', 'Priya', 'Kiran'])
    expect(plan.group).toMatchObject({ name: 'Goa trip', type: 'trip', currency: 'INR', simplify: true, memberUids: ['u1'], createdBy: 'u1' })
    expect(plan.group.members).toEqual({
      u1: { name: 'Asha', uid: 'u1', email: 'asha@example.com', color: expect.any(String) },
      p_1: { name: 'Rahul Sharma', email: 'rahul@example.com', color: expect.any(String) },
      p_2: { name: 'Priya', color: expect.any(String) },
      p_3: { name: 'Kiran', color: expect.any(String) },
    })
    expect(plan.prefill).toMatchObject({ description: 'Dinner', amount: 240000, payer: 'u1', participants: ['u1', 'p_1', 'p_2'] })
    expect(plan.group.startDate).toBeUndefined()
  })
  it('a dinner group gets today’s date like the form gives it', () => {
    const plan = planQuickAi(
      {
        action: 'group_and_expense',
        group: { name: 'Friday dinner', type: 'outing', members: ['Dev'] },
        expense: { description: 'Pizza', currency: 'INR', paidBy: 'Dev', split: 'equal' },
      },
      opts,
    )
    expect(plan.kind === 'create' && plan.group).toMatchObject({ type: 'outing', startDate: '2026-10-09', endDate: '2026-10-09' })
    expect(plan.kind === 'create' && plan.prefill.payer).toMatch(/^p_/)
  })
})

describe('the New group prefill', () => {
  it('names the group from the line', () => {
    expect(quickGroupName('create a group Goa trip with Rahul and Priya and add dinner 2400')).toBe('Goa trip')
    expect(quickGroupName('Make a new group called Flat 4B and add rent 30000')).toBe('Flat 4B')
    expect(quickGroupName('goa trip dinner 2400 with Rahul')).toBe('Goa trip')
    expect(quickGroupName('dinner 2400 on the trip')).toBe('')
    expect(quickGroupName('dinner 2400 with Rahul')).toBe('')
  })
  it('takes the people the line names, matched to people you know, and skips grammar leftovers', () => {
    expect(newGroupPrefill({ text: 'create a group Goa trip with Rahul and Priya and add dinner 2400', unmatched: ['Rahul', 'Priya', 'add'], known })).toEqual({
      name: 'Goa trip',
      type: 'trip',
      people: ['Rahul Sharma', 'Priya'],
    })
    expect(newGroupPrefill({ text: 'Cab 300 in a new group Bali trip with kiran', freshName: 'Bali trip', unmatched: ['kiran'], known })).toEqual({
      name: 'Bali trip',
      type: 'trip',
      people: ['Kiran'],
    })
    expect(newGroupPrefill({ text: 'cab 300', unmatched: [], known })).toEqual({ name: '', people: [] })
  })
  it('GroupForm reads ?people= safely', () => {
    expect(parsePeopleParam('Rahul Sharma, Priya,,priya,\u0000Dev')).toEqual(['Rahul Sharma', 'Priya', 'Dev'])
    expect(parsePeopleParam(null)).toEqual([])
    expect(parsePeopleParam(Array.from({ length: 30 }, (_, i) => `P${i}`).join(','))).toHaveLength(20)
    expect(parsePeopleParam('x'.repeat(60))[0]).toHaveLength(40)
  })
  it('lists names for the confirm sheet', () => {
    expect(listNames(['Rahul'])).toBe('Rahul')
    expect(listNames(['Rahul', 'Priya', 'Kiran'])).toBe('Rahul, Priya and Kiran')
    expect(listNames([])).toBe('')
  })
})
