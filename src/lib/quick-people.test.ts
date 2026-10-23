import { describe, expect, it } from 'vitest'
import { parseNlExpense } from './nl-expense'
import { CASE_GROUPS, CASE_UID } from './quick-cases'
import { allNames, namedIn, peopleGroup } from './quick-people'

const pg = (line: string) => peopleGroup(line, CASE_GROUPS, CASE_UID, '2026-10-23')

describe('peopleGroup', () => {
  it('nobody named: the default group stands', () => expect(pg('milk 60')).toEqual({ kind: 'nobody' }))
  it('the smallest group with everyone named wins', () => {
    expect(pg('chai 60 with Meera')).toEqual({ kind: 'one', groupId: 'g_flat' })
    expect(pg('lunch 300 with Rahul')).toEqual({ kind: 'one', groupId: 'g_rahul' })
    expect(pg('dinner 900 with Priya and Rohan')).toEqual({ kind: 'one', groupId: 'g_goa' })
  })
  it('two groups of the same size: ask', () => {
    const r = pg('coffee 200 with Priya')
    expect(r.kind).toBe('several')
    if (r.kind === 'several') expect([...r.groupIds].sort()).toEqual(['g_goa', 'g_office'])
  })
  it('a full name picks the group that has that person, not a namesake', () => {
    expect(pg('dinner 900 with Rahul Verma')).toEqual({ kind: 'one', groupId: 'g_col' })
    expect(pg('dinner 900 with Rahul Kapoor')).toEqual({ kind: 'one', groupId: 'g_office' })
  })
  it('nobody has them all: a new group with the names', () => {
    expect(pg('drinks 2000 with Kabir')).toEqual({ kind: 'none', names: ['Kabir'] })
  })
  it('a group you are not in never counts', () => {
    const notMine = { ...CASE_GROUPS[1], id: 'g_x', members: { a: { name: 'Zoya', color: '#000' } }, memberUids: [] }
    expect(peopleGroup('chai 50 with Zoya', [...CASE_GROUPS, notMine], CASE_UID).kind).toBe('none')
  })
})

describe('namedIn', () => {
  it('everyone named besides you, once each', () => {
    const p = parseNlExpense('cab 600 Priya paid, with Priya and Rohan', {
      members: [
        { id: 'me', name: 'Asha' },
        { id: 'p', name: 'Priya' },
        { id: 'r', name: 'Rohan' },
      ],
      me: 'me',
      currency: 'INR',
    })
    expect(namedIn(p, 'me').sort()).toEqual(['p', 'r'])
  })
})

describe('allNames', () => {
  it('each name once across groups', () => {
    const names = allNames(CASE_GROUPS)
    expect(names.filter((n) => n === 'Asha')).toHaveLength(1)
    expect(names).toContain('Rahul Verma')
  })
})
