import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import { ownMemberSyncs, sharedPhotoURL } from './memberSync'

const g = (id: string, members: Group['members']): Group => ({
  id, name: id, emoji: '', type: 'trip', currency: 'INR', simplify: false, memberUids: [], members,
  inviteCode: 'X', createdBy: 'u1', createdAt: 0, updatedAt: 0,
})
const photo = 'https://example.com/a.jpg'

describe('sharedPhotoURL', () => {
  it('keeps https, drops others', () => {
    expect(sharedPhotoURL(photo)).toBe(photo)
    expect(sharedPhotoURL('http://x/a.jpg')).toBeUndefined()
    expect(sharedPhotoURL('data:image/jpeg;base64,xx')).toBeUndefined()
    expect(sharedPhotoURL('data:image/jpeg;base64,xx', true)).toBe('data:image/jpeg;base64,xx')
    expect(sharedPhotoURL('https://x/' + 'a'.repeat(3000))).toBeUndefined()
    expect(sharedPhotoURL(undefined)).toBeUndefined()
  })
})

describe('ownMemberSyncs', () => {
  const groups = [
    g('g1', { me: { name: 'Amrit', uid: 'u1', color: '#f00' }, p: { name: 'Priya', color: '#0f0' } }),
    g('g2', { m_x: { name: 'Amrit Singh', uid: 'u1', color: '#f00', photoURL: photo } }),
  ]
  it('patches only my entries that differ', () => {
    const r = ownMemberSyncs(groups, 'u1', { displayName: 'Amrit Singh', photoURL: photo })
    expect(r.map((x) => [x.group.id, x.memberId, x.patch])).toEqual([['g1', 'me', { name: 'Amrit Singh', photoURL: photo }]])
  })
  it('removes a photo the profile no longer has', () => {
    const r = ownMemberSyncs(groups, 'u1', { displayName: 'Amrit Singh' })
    expect(r.map((x) => [x.group.id, x.patch])).toEqual([['g1', { name: 'Amrit Singh' }], ['g2', { name: 'Amrit Singh' }]])
  })
  it('keeps the entry name when the profile name is blank', () => {
    const r = ownMemberSyncs(groups, 'u1', { displayName: '  ', photoURL: photo })
    expect(r.map((x) => [x.group.id, x.patch])).toEqual([['g1', { name: 'Amrit', photoURL: photo }]])
  })
  it('never touches other members', () => {
    expect(ownMemberSyncs(groups, 'u2', { displayName: 'Mallory', photoURL: photo })).toEqual([])
  })
})
