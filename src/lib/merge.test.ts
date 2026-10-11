import { describe, expect, it } from 'vitest'
import type { Group, MergeRequest } from '@/types'
import { keptOf, mergeCandidates, mergeCardState, mergeStillPossible, openMergeRequests } from './merge'

const members = {
  me: { name: 'Asha', uid: 'u0', color: '#000' },
  p: { name: 'Priya', color: '#000' },
  k: { name: 'Priya Shah', uid: 'u1', color: '#000' },
  gone: { name: 'Sam', color: '#000', removedAt: 1 },
} as Group['members']

const req = (over: Partial<MergeRequest>): MergeRequest => ({
  id: 'r',
  groupId: 'g',
  from: 'p',
  into: 'k',
  status: 'suggested',
  by: 'system',
  createdAt: 1,
  ...over,
})

describe('merge offers', () => {
  it('open requests are suggestions and ones waiting for an OK', () => {
    expect(
      openMergeRequests([req({ status: 'done' }), req({ id: 'a' }), req({ id: 'b', status: 'pending' }), req({ status: 'declined' })]).map((r) => r.id),
    ).toEqual(['a', 'b'])
    expect(openMergeRequests(null)).toEqual([])
  })
  it('anyone else in the group, never two accounts, never someone who left', () => {
    expect(mergeCandidates(members, 'p')).toEqual(['me', 'k'])
    expect(mergeCandidates(members, 'k')).toEqual(['p'])
  })
  it('the entry with an account stays', () => {
    expect(keptOf(members, 'k', 'p')).toBe('k')
    expect(keptOf(members, 'p', 'k')).toBe('k')
  })
  it('who can decide what', () => {
    expect(mergeCardState({ status: 'suggested' }, 'u9')).toEqual({ kind: 'suggested', canDecide: true })
    expect(mergeCardState({ status: 'pending', approverUid: 'u0' }, 'u0')).toEqual({ kind: 'pending', canDecide: true })
    expect(mergeCardState({ status: 'pending', approverUid: 'u0' }, 'u1')).toEqual({ kind: 'pending', canDecide: false })
    expect(mergeCardState({ status: 'done' }, 'u0')).toEqual({ kind: 'done', canDecide: false })
  })
  it('a suggestion whose people changed is no longer offered', () => {
    expect(mergeStillPossible(members, { from: 'p', into: 'k' })).toBe(true)
    expect(mergeStillPossible(members, { from: 'gone', into: 'k' })).toBe(false)
    expect(mergeStillPossible(members, { from: 'me', into: 'k' })).toBe(false)
  })
})
