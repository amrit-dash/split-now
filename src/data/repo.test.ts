import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import { changedSettings, groupPurgeBlocker, memberProfileOf, type GroupSettings } from './repo'

const base = { id: 'g', name: 'Trip', archived: true, archivedBy: ['me'] } as unknown as Group

describe('changedSettings', () => {
  it('keeps only what changed', () => {
    expect(changedSettings(base, { name: 'Trip', emoji: '🏖️' })).toEqual({ emoji: '🏖️' })
  })
  it("never writes the personal archive fields, so one person can't archive the group for everyone", () => {
    const patch = { archived: false, archivedBy: [] } as unknown as GroupSettings
    expect(changedSettings(base, patch)).toEqual({})
  })
})

describe('groupPurgeBlocker', () => {
  const DAY = 86_400_000
  const g = {
    name: 'Goa',
    createdBy: 'ua',
    memberUids: ['ua', 'ub'],
    members: { a: { name: 'Asha', uid: 'ua' }, b: { name: 'Bala', uid: 'ub' } },
  } as unknown as Pick<Group, 'name' | 'createdBy' | 'members' | 'memberUids' | 'deletedAt'>
  it('lets only the creator delete it for good, from Recently deleted, after its first week', () => {
    const now = 100 * DAY
    expect(groupPurgeBlocker({ ...g, deletedAt: now - 8 * DAY }, 'ua', now)).toBeNull()
    expect(groupPurgeBlocker({ ...g, deletedAt: now - 8 * DAY }, 'ub', now)).toMatch(/^Only Asha/)
    expect(groupPurgeBlocker({ ...g, deletedAt: now - 2 * DAY }, 'ua', now)).toMatch(/can be deleted for good from/)
    expect(groupPurgeBlocker(g, 'ua', now)).toMatch(/^Delete “Goa” first/)
    expect(groupPurgeBlocker({ ...g, memberUids: ['ub'], deletedAt: 0 }, 'ua', now)).toMatch(/no longer in/)
  })
})

describe('memberProfileOf: the Pro mark', () => {
  const p = { displayName: 'Asha', payment: {}, currency: 'INR' }
  it('shares pro: true only while the badge shows', () => {
    expect(memberProfileOf({ ...p, proAt: 5 }).pro).toBe(true)
    expect('pro' in memberProfileOf(p)).toBe(false)
    // turned off in Preferences: gone for everyone (the shared doc is replaced, so absent clears it)
    expect('pro' in memberProfileOf({ ...p, proAt: 5, proHidden: true })).toBe(false)
  })
})
