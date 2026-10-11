import { describe, expect, it } from 'vitest'
import { directPeer, firstNameOf, groupNameFor, groupNameForRecipient, inviteNameFor, labelForUid, labelOf, shortNames } from './names'

const m = (...names: string[]) => Object.fromEntries(names.map((name, i) => [`m${i}`, { name }]))

describe('shortNames', () => {
  it('uses first names', () => {
    expect(shortNames(m('Priya Sharma', 'Rohan', 'Ananya K Iyer'))).toEqual({ m0: 'Priya', m1: 'Rohan', m2: 'Ananya' })
  })
  it('labels me as You', () => {
    expect(shortNames(m('Amrit Singh', 'Priya'), 'm0')).toEqual({ m0: 'You', m1: 'Priya' })
  })
  it('adds a last initial when first names clash', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Kumar', 'Zoë'))).toEqual({ m0: 'Rahul S.', m1: 'Rahul K.', m2: 'Zoë' })
  })
  it('matches first names case- and accent-insensitively', () => {
    expect(shortNames(m('José Ruiz', 'jose Alba'))).toEqual({ m0: 'José R.', m1: 'jose A.' })
  })
  it('a single-word name next to a clash keeps its first name', () => {
    expect(shortNames(m('Rahul', 'Rahul Kumar'))).toEqual({ m0: 'Rahul', m1: 'Rahul K.' })
  })
  it('falls back to the full name when the initial clashes too', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Singh', 'Rahul Kumar'))).toEqual({ m0: 'Rahul Sharma', m1: 'Rahul Singh', m2: 'Rahul K.' })
  })
  it('does not disambiguate against me (shown as You)', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Kumar'), 'm0')).toEqual({ m0: 'You', m1: 'Rahul' })
  })
  it('handles email-like and blank names', () => {
    expect(shortNames(m('priya.s@gmail.com', '  '))).toEqual({ m0: 'priya.s', m1: '?' })
  })
})

describe('the owner’s rule (Oct 2026)', () => {
  it('first names; a last initial only where first names clash', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Kumar', 'Priya Iyer'))).toEqual({ m0: 'Rahul S.', m1: 'Rahul K.', m2: 'Priya' })
  })
  it('initials clash too: full names for those two', () => {
    expect(shortNames(m('Rahul Sharma', 'Rahul Singh'))).toEqual({ m0: 'Rahul Sharma', m1: 'Rahul Singh' })
  })
  it('one has a last name, one doesn’t: "Rahul K." and "Rahul"', () => {
    expect(shortNames(m('Rahul Kumar', 'Rahul'))).toEqual({ m0: 'Rahul K.', m1: 'Rahul' })
  })
  it('neither has a last name: both stay "Rahul"', () => {
    expect(shortNames(m('Rahul', 'rahul'))).toEqual({ m0: 'Rahul', m1: 'rahul' })
  })
})

describe('labelOf / labelForUid / firstNameOf', () => {
  const members = {
    a: { name: 'Rahul Sharma', uid: 'u1' },
    b: { name: 'Rahul Kumar' },
    c: { name: 'Old Rahul S', uid: 'u2', removedAt: 1 },
    d: { name: 'Priya' },
  }
  it('labels one member, with a fallback for someone not there', () => {
    expect(labelOf(members, 'd')).toBe('Priya')
    expect(labelOf(members, 'zz', 'Former member')).toBe('Former member')
    expect(labelOf(undefined, 'd')).toBe('Someone')
  })
  it('finds a member by account', () => {
    expect(labelForUid(members, 'u1')).toBe('Rahul S.')
    expect(labelForUid(members, 'nobody')).toBeUndefined()
  })
  it('first names', () => {
    expect(firstNameOf('  Venkat Raman ')).toBe('Venkat')
    expect(firstNameOf('priya@x.com')).toBe('priya')
    expect(firstNameOf('  ')).toBe('?')
  })
})

describe('1:1 friends: directPeer / groupNameFor', () => {
  const members = {
    me: { name: 'Asha Rao', uid: 'u1' },
    p: { name: 'Priya Nair', uid: 'u2' },
  }
  it('each side sees the other person, whatever the group was called', () => {
    const g = { type: 'direct', name: 'Priya', members }
    expect(directPeer(members, 'u1')).toBe('p')
    expect(directPeer(members, 'u2')).toBe('me')
    expect(groupNameFor(g, 'u1')).toBe('Priya Nair')
    expect(groupNameFor(g, 'u2')).toBe('Asha Rao')
  })
  it('a friend who has not joined yet (no account) is still the other person', () => {
    expect(directPeer({ me: members.me, p: { name: 'Priya' } }, 'u1')).toBe('p')
  })
  it('someone still in it comes before someone who left', () => {
    expect(directPeer({ ...members, old: { name: 'Old', removedAt: 1 } }, 'u1')).toBe('p')
    expect(directPeer({ me: members.me, old: { name: 'Old', removedAt: 1 } }, 'u1')).toBe('old')
  })
  it('other groups keep their name; a viewer who is not in it gets the stored name', () => {
    expect(groupNameFor({ type: 'trip', name: 'Goa', members }, 'u1')).toBe('Goa')
    expect(groupNameFor({ type: 'direct', name: 'Priya', members }, 'zz')).toBe('Priya')
    expect(directPeer(undefined, 'u1')).toBeUndefined()
  })
})

describe('1:1 invites and notifications', () => {
  const members = { me: { name: 'Amrit Dash', uid: 'u1' }, p: { name: 'Meera' } }
  it('the invite names the person who is already in it, not the friend it is for', () => {
    expect(inviteNameFor({ type: 'direct', name: 'Meera', createdBy: 'u1', members })).toBe('Amrit Dash')
    expect(inviteNameFor({ type: 'trip', name: 'Goa', members })).toBe('Goa')
    expect(inviteNameFor({ type: 'direct', name: 'Meera', members: { p: { name: 'Meera' } } })).toBe('Meera')
  })
  it('a 1:1 notification is titled with the other person, for each of them', () => {
    const g = { type: 'direct', name: 'Meera', members: { me: members.me, p: { name: 'Meera Iyer', uid: 'u2' } } }
    expect(groupNameForRecipient(g, 'u1')).toBe('Meera Iyer')
    expect(groupNameForRecipient(g, 'u2')).toBe('Amrit Dash')
    expect(groupNameForRecipient({ type: 'trip', name: 'Goa' }, 'u2')).toBe('Goa')
    expect(groupNameForRecipient(undefined, 'u2', 'your group')).toBe('your group')
  })
})
