import { describe, expect, it } from 'vitest'
import { type Archivable, archiveWrite, expenseMemberIds, isArchivedFor, uidsOfMembers, unarchiveInvolved } from './archive'

const g = (over: Archivable = {}) => ({ memberUids: ['a', 'b', 'c'], ...over })

describe('isArchivedFor', () => {
  it('is personal: only the people in archivedBy', () => {
    const grp = g({ archivedBy: ['a'] })
    expect(isArchivedFor(grp, 'a')).toBe(true)
    expect(isArchivedFor(grp, 'b')).toBe(false)
    expect(isArchivedFor(g(), 'a')).toBe(false)
  })
  it('treats the old group-wide flag as archived for everyone', () => {
    expect(isArchivedFor(g({ archived: true }), 'b')).toBe(true)
  })
  it('is never archived for nobody', () => {
    expect(isArchivedFor(g({ archivedBy: ['a'] }), undefined)).toBe(false)
  })
})

describe('archiveWrite', () => {
  it('adds or removes only you', () => {
    expect(archiveWrite(g(), 'a', true)).toEqual({ add: 'a' })
    expect(archiveWrite(g({ archivedBy: ['a', 'b'] }), 'a', false)).toEqual({ remove: 'a' })
  })
  it('does nothing when you are already in that state', () => {
    expect(archiveWrite(g({ archivedBy: ['a'] }), 'a', true)).toBeNull()
    expect(archiveWrite(g(), 'a', false)).toBeNull()
    expect(archiveWrite(g({ archived: true }), 'a', true)).toBeNull()
  })
  it('turns the old flag into everyone else when you unarchive, so only you see it again', () => {
    expect(archiveWrite(g({ archived: true }), 'b', false)).toEqual({ convert: { archivedBy: ['a', 'c'] } })
    // anyone already listed stays listed
    expect(archiveWrite(g({ archived: true, archivedBy: ['x'] }), 'a', false)).toEqual({ convert: { archivedBy: ['x', 'b', 'c'] } })
  })
})

describe('unarchiveInvolved', () => {
  it('brings the group back only for the people the new expense involves', () => {
    expect(unarchiveInvolved(g({ archivedBy: ['a', 'b', 'c'] }), ['a', 'c'])).toEqual({ remove: ['a', 'c'] })
  })
  it('does nothing when none of them had it archived', () => {
    expect(unarchiveInvolved(g({ archivedBy: ['b'] }), ['a'])).toBeNull()
    expect(unarchiveInvolved(g(), ['a'])).toBeNull()
  })
  it('turns the old flag into everyone not involved', () => {
    expect(unarchiveInvolved(g({ archived: true }), ['a'])).toEqual({ convert: { archivedBy: ['b', 'c'] } })
  })
})

describe('who a new expense involves', () => {
  it('is whoever paid and whoever has a share', () => {
    expect(expenseMemberIds({ paidBy: { p1: 500, p2: 0 }, splits: { p1: 250, p3: 250, p4: 0 } }).sort()).toEqual(['p1', 'p3'])
  })
  it('maps them to accounts that really are in the group', () => {
    const members = { p1: { uid: 'a' }, p2: {}, p3: { uid: 'mallory' } }
    expect(uidsOfMembers(members, ['p1', 'p2', 'p3'], ['a', 'b'])).toEqual(['a'])
  })
})
