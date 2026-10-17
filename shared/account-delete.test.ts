import { describe, expect, it } from 'vitest'
import { clearedEntry, DELETED_NAME, type DeletionExpense, type DeletionGroup, ownEntry, planDeletion, planGroup, signedInRecently } from './account-delete'

const group = (over: Partial<DeletionGroup> = {}): DeletionGroup => ({
  id: 'g1',
  type: 'trip',
  createdBy: 'u_bob',
  memberUids: ['u_bob', 'u_me', 'u_cat'],
  members: { m_bob: { uid: 'u_bob' }, m_me: { uid: 'u_me' }, m_cat: { uid: 'u_cat' }, m_pat: {} },
  ...over,
})
const exp = (over: Partial<DeletionExpense> = {}): DeletionExpense => ({
  id: 'e1',
  amount: 900,
  paidBy: { m_bob: 900 },
  splits: { m_bob: 300, m_me: 300, m_cat: 300 },
  ...over,
})

describe('deleting an account, group by group', () => {
  it('finds the person’s own live entry, not one they left', () => {
    expect(ownEntry('u_me', group())).toBe('m_me')
    expect(ownEntry('u_me', group({ members: { m_me: { uid: 'u_me', removedAt: 5 } } }))).toBeNull()
    expect(planGroup('u_me', group({ members: { m_me: { uid: 'u_me', removedAt: 5 }, m_bob: { uid: 'u_bob' } } }), [], [])).toBeNull()
  })
  it('a Personal wallet, or a group nobody else with an account is in, goes with the account', () => {
    expect(planGroup('u_me', group({ type: 'personal', members: { m_me: { uid: 'u_me' } } }), [exp()], [])).toEqual({
      step: { kind: 'delete', groupId: 'g1', why: 'wallet' },
    })
    // others are placeholders, or have left: nobody else could ever see it
    const alone = group({ members: { m_me: { uid: 'u_me' }, m_pat: {}, m_old: { uid: 'u_old', removedAt: 1 } }, memberUids: ['u_me'] })
    expect(planGroup('u_me', alone, [exp({ splits: { m_me: 450, m_pat: 450 }, paidBy: { m_me: 900 } })], [])).toEqual({
      step: { kind: 'delete', groupId: 'g1', why: 'alone' },
    })
  })
  it('a shared group with a settled balance: they leave it, and the creator’s role passes on in joining order', () => {
    expect(planGroup('u_me', group(), [], [])).toEqual({ step: { kind: 'leave', groupId: 'g1', memberId: 'm_me' } })
    const mine = group({ createdBy: 'u_me', memberUids: ['u_me', 'u_cat', 'u_bob'] })
    expect(planGroup('u_me', mine, [], [])).toEqual({ step: { kind: 'leave', groupId: 'g1', memberId: 'm_me', newCreator: 'u_cat' } })
  })
  it('money still owed either way stops it, with how much', () => {
    expect(planGroup('u_me', group(), [exp()], [])).toEqual({ blockers: [{ groupId: 'g1', reason: 'unsettled', owes: true, amount: 300 }] })
    expect(planGroup('u_me', group(), [exp({ paidBy: { m_me: 900 } })], [])).toEqual({
      blockers: [{ groupId: 'g1', reason: 'unsettled', owes: false, amount: 600 }],
    })
    // paid back: settled
    expect(planGroup('u_me', group(), [exp()], [{ from: 'm_me', to: 'm_bob', amount: 300 }])).toEqual({
      step: { kind: 'leave', groupId: 'g1', memberId: 'm_me' },
    })
    // deleted expenses don't count
    expect('step' in (planGroup('u_me', group(), [exp({ deletedAt: 1 })], []) ?? {})).toBe(true)
  })
  it('an expense waiting for an OK, or a repeating expense still running with them, stops it too', () => {
    const pending = exp({ requiresApproval: true, approvals: {}, createdBy: 'u_bob' })
    const p = planGroup('u_me', group(), [pending], [])
    expect(p && 'blockers' in p && p.blockers.map((b) => b.reason)).toEqual(['pending'])
    const rent = exp({ description: 'Rent', recurrence: { nextDate: '2026-11-01' }, paidBy: { m_me: 900 }, splits: { m_me: 900 } })
    const r = planGroup('u_me', group(), [rent], [])
    expect(r).toEqual({ blockers: [{ groupId: 'g1', reason: 'repeating', description: 'Rent' }] })
    // one that has ended doesn't
    const ended = { ...rent, recurrence: { nextDate: '2026-11-01', until: '2026-10-01' } }
    expect(planGroup('u_me', group(), [ended], [])).toEqual({ step: { kind: 'leave', groupId: 'g1', memberId: 'm_me' } })
  })
  it('a group in Recently deleted can be left whatever is owed in it', () => {
    expect(planGroup('u_me', group({ deletedAt: 1 }), [exp()], [])).toEqual({ step: { kind: 'leave', groupId: 'g1', memberId: 'm_me' } })
  })
  it('puts every group’s plan together', () => {
    const p = planDeletion('u_me', [
      { group: group({ id: 'a' }), expenses: [exp()], settlements: [] },
      { group: group({ id: 'b', type: 'personal', members: { m_me: { uid: 'u_me' } } }), expenses: [], settlements: [] },
      { group: group({ id: 'c' }), expenses: [], settlements: [] },
      { group: group({ id: 'd', members: { m_bob: { uid: 'u_bob' } } }), expenses: [], settlements: [] },
    ])
    expect(p.steps.map((s) => `${s.kind}:${s.groupId}`)).toEqual(['delete:b', 'leave:c'])
    expect(p.blockers.map((b) => `${b.reason}:${b.groupId}`)).toEqual(['unsettled:a'])
  })
})

describe('what is left of them in a group', () => {
  it('only the colour stays, under the deleted-account name', () => {
    expect(clearedEntry({ name: 'Asha Rao', email: 'a@x.com', uid: 'u_me', photoURL: 'https://p', formerUids: ['u_old'], color: 'violet' }, 99)).toEqual({
      name: DELETED_NAME,
      removedAt: 99,
      color: 'violet',
    })
    expect(clearedEntry({ name: 'v1:abc', removedAt: 5 }, 99)).toEqual({ name: DELETED_NAME, removedAt: 5 })
  })
})

describe('a recent sign-in', () => {
  it('within five minutes, and not from the future', () => {
    const now = 1_000_000_000_000
    expect(signedInRecently(now / 1000 - 60, now)).toBe(true)
    expect(signedInRecently(now / 1000 - 301, now)).toBe(false)
    expect(signedInRecently(undefined, now)).toBe(false)
    expect(signedInRecently(now / 1000 + 3600, now)).toBe(false)
  })
})
