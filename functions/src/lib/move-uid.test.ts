import { describe, expect, it } from 'vitest'
import { memberOf, planGroupMove, planGuestClaim, type MoveGroup } from './move-uid'

const group = (over: Partial<MoveGroup> = {}): MoveGroup => ({
  createdBy: 'old',
  memberUids: ['old', 'bob'],
  archivedBy: ['old'],
  members: { old: { name: 'Priya', uid: 'old' }, m_b: { name: 'Bob', uid: 'bob' }, p_1: { name: 'Sam' } },
  ...over,
})

describe('planGroupMove', () => {
  it('moves the entry, the member list, the creator and the archive to the account that stays', () => {
    expect(planGroupMove(group(), 'old', 'new')).toEqual({
      members: { old: { uid: 'new', formerUids: ['old'] } },
      memberUids: ['bob', 'new'],
      archivedBy: ['new'],
      createdBy: 'new',
    })
  })
  it('when both are in the group, the old entry becomes a placeholder and a merge is suggested', () => {
    const g = group({ memberUids: ['old', 'bob', 'new'], members: { old: { name: 'Priya', uid: 'old' }, m_n: { name: 'Priya S', uid: 'new' } } })
    expect(planGroupMove(g, 'old', 'new')).toEqual({
      members: { old: { uid: null, formerUids: ['old'] } },
      memberUids: ['bob', 'new'],
      archivedBy: ['new'],
      createdBy: 'new',
      suggest: { from: 'old', into: 'm_n' },
    })
  })
  it('a removed entry keeps its history under the new account but gets no access back', () => {
    const g = group({ memberUids: ['bob'], members: { old: { name: 'Priya', uid: 'old', removedAt: 5 } }, createdBy: 'bob', archivedBy: [] })
    expect(planGroupMove(g, 'old', 'new')).toEqual({ members: { old: { uid: 'new', formerUids: ['old'] } }, memberUids: ['bob'] })
  })
  it('nothing for a group the old account was never in, or the same account', () => {
    expect(planGroupMove(group({ createdBy: 'bob', memberUids: ['bob'], members: {} }), 'old', 'new')).toBeNull()
    expect(planGroupMove(group(), 'old', 'old')).toBeNull()
  })
  it('keeps earlier former uids', () => {
    const g = group({ members: { old: { name: 'Priya', uid: 'old', formerUids: ['older'] } } })
    expect(planGroupMove(g, 'old', 'new')?.members.old?.formerUids).toEqual(['older', 'old'])
  })
  it('finds an entry by its account', () => {
    expect(memberOf(group().members, 'bob')).toBe('m_b')
    expect(memberOf(group().members, 'nobody')).toBeUndefined()
  })
})

describe('planGuestClaim', () => {
  it('a guest’s locked link gives its entry the new account', () => {
    expect(planGuestClaim(group(), { groupId: 'g', from: 'p_1' }, 'new')).toEqual({ link: 'p_1' })
  })
  it('suggests a merge when the account is already in the group under another entry', () => {
    expect(planGuestClaim(group(), { groupId: 'g', from: 'p_1' }, 'bob')).toEqual({ suggest: { from: 'p_1', into: 'm_b' } })
  })
  it('leaves entries with an account, removed entries, deleted and personal groups alone', () => {
    expect(planGuestClaim(group(), { from: 'm_b' }, 'new')).toBeNull()
    expect(planGuestClaim(group({ members: { p_1: { name: 'Sam', removedAt: 1 } } }), { from: 'p_1' }, 'new')).toBeNull()
    expect(planGuestClaim(group({ deletedAt: 1 }), { from: 'p_1' }, 'new')).toBeNull()
    expect(planGuestClaim(group({ type: 'personal' }), { from: 'p_1' }, 'new')).toBeNull()
    expect(planGuestClaim(group(), {}, 'new')).toBeNull()
  })
  it('stops at 60 accounts', () => {
    expect(planGuestClaim(group({ memberUids: Array.from({ length: 60 }, (_, i) => `u${i}`) }), { from: 'p_1' }, 'new')).toBeNull()
  })
})
