import { describe, expect, it } from 'vitest'
import { sharedProfileCopy } from '../../../shared/profile-share'
import { chunks, joinedUids, planMemberWrites, profileCopyGroups, staleProfileCopies, type SyncGroup } from './profile-sync'

const photo = 'https://example.com/a.jpg'
const asha = { displayName: 'Asha Rao', photoURL: photo, proAt: 5, payment: { upi: 'asha@ok' } }

const groups: SyncGroup[] = [
  { id: 'g1', memberUids: ['u1', 'u2'], members: { a: { name: 'Asha', uid: 'u1' }, b: { name: 'Ben', uid: 'u2' } } },
  { id: 'g2', memberUids: ['u1'], members: { a: { name: 'Asha Rao', uid: 'u1', photoURL: photo, pro: true } } },
  { id: 'g3', deletedAt: 9, memberUids: ['u1'], members: { a: { name: 'Asha', uid: 'u1' } } },
  { id: 'g4', memberUids: [], members: { a: { name: 'Asha', uid: 'u1', removedAt: 3 }, c: { name: 'Asha', uid: 'u1' } } },
  { id: 'v1', vault: true, memberUids: ['u1'], members: { a: { name: 'SEALED', uid: 'u1', photoURL: 'SEALEDPHOTO' } } },
]

describe('planMemberWrites', () => {
  it('writes only entries that differ, in live groups, never removed ones', () => {
    const w = planMemberWrites(groups, 'u1', asha, false)
    expect(w).toEqual([
      { groupId: 'g1', memberId: 'a', fields: { name: 'Asha Rao', photoURL: photo, pro: true, dev: null } },
      { groupId: 'g4', memberId: 'c', fields: { name: 'Asha Rao', photoURL: photo, pro: true, dev: null } },
      { groupId: 'v1', memberId: 'a', fields: { pro: true } },
    ])
  })
  it('never puts a name or photo into a private group, only the marks', () => {
    const w = planMemberWrites(groups, 'u1', { ...asha, proHidden: true }, true).filter((x) => x.groupId === 'v1')
    expect(w).toEqual([{ groupId: 'v1', memberId: 'a', fields: { dev: true } }])
    const off = planMemberWrites([{ id: 'v', vault: true, members: { a: { name: 'S', uid: 'u1', pro: true, dev: true } } }], 'u1', { displayName: 'A' }, false)
    expect(off).toEqual([{ groupId: 'v', memberId: 'a', fields: { pro: null, dev: null } }])
  })
  it('nothing when everything already matches (no loop with the app)', () => {
    const done = [{ id: 'g', members: { a: { name: 'Asha Rao', uid: 'u1', photoURL: photo, pro: true } } }]
    expect(planMemberWrites(done, 'u1', asha, false)).toEqual([])
  })
  it('a photo that is not https is removed, not copied', () => {
    const w = planMemberWrites(
      [{ id: 'g', members: { a: { name: 'A', uid: 'u1', photoURL: photo } } }],
      'u1',
      { displayName: 'A', photoURL: 'http://x/a.jpg' },
      false,
    )
    expect(w[0]?.fields).toEqual({ name: 'A', photoURL: null, pro: null, dev: null })
  })
})

describe('profileCopyGroups', () => {
  it('live, not private, still a member', () => {
    expect(profileCopyGroups(groups, 'u1')).toEqual(['g1', 'g2'])
  })
})

describe('staleProfileCopies', () => {
  const copy = sharedProfileCopy(asha)
  it('missing or different copies only, whatever the key order', () => {
    const stored = new Map<string, unknown>([
      ['g1', { collect: true, pro: true, currency: undefined, photoURL: photo, payment: { upi: 'asha@ok' }, displayName: 'Asha Rao' }],
      ['g2', { ...copy, displayName: 'Asha' }],
    ])
    expect(staleProfileCopies(['g1', 'g2', 'g3'], stored, copy)).toEqual(['g2', 'g3'])
  })
  it('no name, no copy', () => {
    expect(staleProfileCopies(['g1'], new Map(), sharedProfileCopy({ photoURL: photo }))).toEqual([])
  })
})

describe('joinedUids', () => {
  it('the newcomers only', () => {
    expect(joinedUids(['a', 'b'], ['a', 'b', 'c'])).toEqual(['c'])
    expect(joinedUids(['a', 'b'], ['a'])).toEqual([])
    expect(joinedUids(undefined, ['a', 'a'])).toEqual(['a'])
    expect(joinedUids(['a'], undefined)).toEqual([])
  })
})

describe('chunks', () => {
  it('splits into batches', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunks(Array.from({ length: 1000 }, (_, i) => i)).map((c) => c.length)).toEqual([450, 450, 100])
  })
})
