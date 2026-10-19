import { describe, expect, it } from 'vitest'
import { approveJoinsShown, decidesJoins, invitePath, joinsOffBlocker, waitingRequests } from './join-approval'

describe('approveJoinsShown', () => {
  const trip = { type: 'trip' }
  it('shows to the creator of a group others join', () => {
    expect(approveJoinsShown(trip, { flag: true, creator: true })).toBe(true)
    expect(approveJoinsShown(trip, { flag: true, creator: false })).toBe(false)
  })
  it('not in a 1:1, a wallet or a private group', () => {
    expect(approveJoinsShown({ type: 'direct' }, { flag: true, creator: true })).toBe(false)
    expect(approveJoinsShown({ type: 'personal' }, { flag: true, creator: true })).toBe(false)
    expect(approveJoinsShown({ type: 'trip', vault: true }, { flag: true, creator: true })).toBe(false)
  })
  it('switched off by the admin: only where it is on, so it can be turned off', () => {
    expect(approveJoinsShown(trip, { flag: false, creator: true })).toBe(false)
    expect(approveJoinsShown({ ...trip, approveJoins: true }, { flag: false, creator: true })).toBe(true)
  })
})

describe('decidesJoins', () => {
  it('live groups you made that are private or need your OK', () => {
    const gs = [
      { id: 'a', createdBy: 'me', approveJoins: true },
      { id: 'b', createdBy: 'me', vault: true },
      { id: 'c', createdBy: 'me' },
      { id: 'd', createdBy: 'you', approveJoins: true },
      { id: 'e', createdBy: 'me', approveJoins: true, deletedAt: 5 },
    ]
    expect(decidesJoins(gs, 'me').map((g) => g.id)).toEqual(['a', 'b'])
  })
})

describe('waitingRequests', () => {
  it('drops requests from people already in the group', () => {
    const groups = [{ id: 'g', memberUids: ['me', 'carol'] }]
    const rs = [
      { groupId: 'g', uid: 'carol' },
      { groupId: 'g', uid: 'dev' },
      { groupId: 'other', uid: 'carol' },
    ]
    expect(waitingRequests(rs, groups)).toEqual([
      { groupId: 'g', uid: 'dev' },
      { groupId: 'other', uid: 'carol' },
    ])
  })
})

describe('invitePath', () => {
  it('private groups ask in their own way; ordinary ones ask while the setting is on', () => {
    expect(invitePath({ vault: true }, false)).toBe('private')
    expect(invitePath({ vault: true, approveJoins: true }, false)).toBe('private')
    expect(invitePath({ approveJoins: true }, false)).toBe('ask')
    expect(invitePath({ approveJoins: true }, true)).toBe('join')
    expect(invitePath({}, false)).toBe('join')
  })
})

describe('turning New people need my OK off', () => {
  it('waits until nobody is waiting', () => {
    expect(joinsOffBlocker(0)).toBeNull()
    expect(joinsOffBlocker(1)).toBe('1 person is waiting to be let in. Let them in or decline them in the Inbox first.')
    expect(joinsOffBlocker(3)).toMatch(/^3 people are waiting/)
  })
})
