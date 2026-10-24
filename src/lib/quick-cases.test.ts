import { describe, expect, it } from 'vitest'
import { activeMembers } from './members'
import { CASE_GROUPS, CASE_UID, QUICK_CASES, type QuickExpect } from './quick-cases'
import { quickLocal } from './quick-local'

const TODAY = '2026-10-23'

/** 'me' in a case is your own member id in that group. */
function meIn(groupId: string): string {
  const g = CASE_GROUPS.find((x) => x.id === groupId)
  return Object.entries(g?.members ?? {}).find(([, m]) => m.uid === CASE_UID)?.[0] ?? ''
}
const idIn = (groupId: string, id: string) => (id === 'me' ? meIn(groupId) : id)

function run(line: string, from: string) {
  const home = from === 'home'
  return quickLocal({ line, groups: CASE_GROUPS, uid: CASE_UID, groupId: home ? 'g_goa' : from, sure: !home, today: TODAY, openItems: true })
}

function check(got: ReturnType<typeof run>, want: QuickExpect) {
  if (want.kind === 'ai') {
    expect(got.kind).toBe('ai')
    return
  }
  expect(got.kind).toBe(want.kind)
  switch (want.kind) {
    case 'askGroup':
      if (got.kind === 'askGroup') expect([...got.groupIds].sort()).toEqual([...want.groups].sort())
      return
    case 'newGroup':
      if (got.kind === 'newGroup') expect(got.names).toEqual(want.names)
      return
    case 'openItem':
      if (got.kind === 'openItem') expect(got.groupId).toBe(want.group)
      return
    case 'askWho':
      if (got.kind === 'askWho') {
        expect(got.groupId).toBe(want.group)
        expect([...got.ids].sort()).toEqual([...want.ids].sort())
      }
      return
    case 'askUnknown':
      if (got.kind === 'askUnknown') {
        expect(got.groupId).toBe(want.group)
        expect(got.names).toEqual(want.names)
      }
      return
    case 'askPayer':
      if (got.kind === 'askPayer') {
        expect(got.groupId).toBe(want.group)
        expect([...got.choices].sort()).toEqual(want.choices.map((c) => idIn(want.group, c)).sort())
      }
      return
    case 'payment':
      if (got.kind === 'payment') {
        expect(got.groupId).toBe(want.group)
        expect(got.from).toBe(idIn(want.group, want.from))
        expect(got.to).toBe(idIn(want.group, want.to))
        if (want.amount !== undefined) expect(got.amount).toBe(want.amount)
      }
      return
    case 'expense': {
      if (got.kind !== 'expense') return
      const gid = want.group
      expect(got.groupId).toBe(gid)
      const p = got.parse
      if (want.amount !== undefined) expect(p.amount).toBe(want.amount)
      if (want.description !== undefined) expect(p.description).toBe(want.description)
      if (want.payer !== undefined) expect(p.payer).toBe(idIn(gid, want.payer))
      if (want.date !== undefined) expect(p.date).toBe(want.date)
      if (want.sharers === 'all') {
        const all = Object.keys(activeMembers(CASE_GROUPS.find((g) => g.id === gid)?.members ?? {}))
        expect(p.participants === undefined || [...p.participants].sort().join() === [...all].sort().join()).toBe(true)
      } else if (want.sharers) expect([...(p.participants ?? [])].sort()).toEqual(want.sharers.map((s) => idIn(gid, s)).sort())
      if (want.exact) {
        const exact = Object.fromEntries(Object.entries(want.exact).map(([k, v]) => [idIn(gid, k), v]))
        expect(p.exact).toEqual(exact)
      }
    }
  }
}

describe('Quick add on the phone: the case set', () => {
  for (const c of QUICK_CASES) {
    it(`${c.from === 'home' ? 'Home' : c.from}: “${c.line}” → ${c.expect.kind}`, () => {
      check(run(c.line, c.from), c.expect)
    })
  }
})
