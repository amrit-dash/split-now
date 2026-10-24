import { describe, expect, it } from 'vitest'
import { CASE_GROUPS, CASE_UID } from './quick-cases'
import { canAddPeople, leaveOut, newMembersFor, quickLocal, quickNext, swapPerson, withPayer } from './quick-local'

const run = (line: string, groupId: string, sure = true) =>
  quickLocal({ line, groups: CASE_GROUPS, uid: CASE_UID, groupId, sure, today: '2026-10-23', openItems: true })

describe('quickLocal: answers carry the line on', () => {
  it('“Which Rahul?” then the form, with the chosen Rahul everywhere', () => {
    const first = run('cab 300 Rahul paid, with Rahul and Neha', 'g_col')
    expect(first.kind).toBe('askWho')
    if (first.kind !== 'askWho') return
    const next = quickNext('cab 300 Rahul paid, with Rahul and Neha', 'g_col', swapPerson(first.parse, first.ids[0], 'p_rv'))
    expect(next.kind).toBe('expense')
    if (next.kind !== 'expense') return
    expect(next.parse.payer).toBe('p_rv')
    expect(next.parse.participants).toContain('p_rv')
    expect(next.parse.participants).not.toContain('p_rs')
  })
  it('“Which Rahul?” for a payment back moves the payment', () => {
    const first = run('paid Rahul 500 back', 'g_col')
    if (first.kind !== 'askWho') throw new Error(first.kind)
    const next = quickNext('paid Rahul 500 back', 'g_col', swapPerson(first.parse, first.ids[0], 'p_rv'))
    expect(next).toMatchObject({ kind: 'payment', from: 'me5', to: 'p_rv', amount: 50000 })
  })
  it('choosing the Rahul it already read just clears the question', () => {
    const first = run('dinner 1200 with Rahul', 'g_col')
    if (first.kind !== 'askWho') throw new Error(first.kind)
    expect(quickNext('dinner 1200 with Rahul', 'g_col', swapPerson(first.parse, first.ids[0], first.ids[0]))).toMatchObject({ kind: 'expense' })
  })
  it('“he paid” with two people: Who paid? then the form', () => {
    const line = 'dinner with Priya and Rohan 3000 he paid'
    const first = run(line, 'g_goa')
    if (first.kind !== 'askPayer') throw new Error(first.kind)
    const next = quickNext(line, 'g_goa', withPayer(first.parse, 'p_rohan'))
    expect(next.kind).toBe('expense')
    if (next.kind === 'expense') expect(next.parse.payer).toBe('p_rohan')
  })
  it('leaving someone out goes on without them', () => {
    const line = 'dinner 1500 with Kabir and Priya'
    const first = run(line, 'g_goa')
    if (first.kind !== 'askUnknown') throw new Error(first.kind)
    expect(first.names).toEqual(['Kabir'])
    const next = quickNext(line, 'g_goa', leaveOut(first.parse))
    expect(next.kind).toBe('expense')
    if (next.kind === 'expense') expect(next.parse.participants).toEqual(['me', 'p_priya'])
  })
  it('a payment from Home goes to the group with that person', () => {
    expect(run('paid Meera 300 back', 'g_goa', false)).toMatchObject({ kind: 'payment', groupId: 'g_flat', from: 'me2', to: 'p_meera' })
  })
  it('a person nobody has, from Home: a new group with them', () => {
    expect(run('lunch 400 with Zoya', 'g_goa', false)).toEqual({ kind: 'newGroup', names: ['Zoya'] })
  })
  it('a group page with nobody named stays in that group', () => {
    expect(run('milk 60', 'g_flat')).toMatchObject({ kind: 'expense', groupId: 'g_flat' })
  })
  it('a group that no longer exists falls back to making one', () => {
    expect(run('milk 60', 'g_gone')).toEqual({ kind: 'newGroup', names: [] })
  })
})

describe('swapPerson', () => {
  const base = {
    description: 'X',
    currency: 'INR',
    payer: 'a',
    payerExplicit: true,
    unmatched: [],
    confidence: 'medium' as const,
    participants: ['me', 'a'],
    exact: { a: 100, me: 50 },
    ambiguous: [{ token: 'Rahul', ids: ['a', 'b'] }],
  }
  it('moves payer, sharers and exact parts, and drops the question', () => {
    const p = swapPerson(base, 'a', 'b')
    expect(p.payer).toBe('b')
    expect(p.participants).toEqual(['me', 'b'])
    expect(p.exact).toEqual({ b: 100, me: 50 })
    expect(p.ambiguous).toEqual([])
  })
})

describe('adding the people a line names', () => {
  it('only where Members would add them straight away', () => {
    expect(canAddPeople({ type: 'trip', createdBy: 'u' }, 'u')).toBe(true)
    expect(canAddPeople({ type: 'trip', createdBy: 'x' }, 'u')).toBe(true)
    expect(canAddPeople({ type: 'trip', createdBy: 'x', approveJoins: true }, 'u')).toBe(false)
    expect(canAddPeople({ type: 'trip', createdBy: 'u', approveJoins: true }, 'u')).toBe(true)
    expect(canAddPeople({ type: 'trip', createdBy: 'u', vault: true }, 'u')).toBe(false)
    expect(canAddPeople({ type: 'direct', createdBy: 'u' }, 'u')).toBe(false)
    expect(canAddPeople({ type: 'personal', createdBy: 'u' }, 'u')).toBe(false)
  })
  it('new entries, named properly; someone who left comes back into their entry', () => {
    let n = 0
    const members = { me: { name: 'Asha', color: '#000' }, old: { name: 'Kabir', color: '#111', removedAt: 5 } }
    const out = newMembersFor({ members }, ['kabir', 'zoya'], () => `p_${++n}`)
    expect(Object.keys(out)).toEqual(['old', 'p_1'])
    expect(out.old.name).toBe('Kabir')
    expect(out.p_1.name).toBe('Zoya')
  })
})
