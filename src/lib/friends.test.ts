import { describe, expect, it } from 'vitest'
import { filterFriends, friendBalances, friendKey, parseFriendFilter, type FriendGroup } from './friends'

const members = {
  me: { name: 'Amrit', uid: 'u-me', color: '#111' },
  rohan: { name: 'Rohan', uid: 'u-rohan', color: '#222' },
  priya: { name: 'Priya', color: '#333' },
}
const group = (id: string, debts: FriendGroup['debts'], extra: Partial<FriendGroup['group']> = {}): FriendGroup => ({
  group: { id, type: 'trip', currency: 'INR', members, ...extra },
  me: 'me',
  debts,
})

describe('friendBalances', () => {
  it('sums each person across groups and sorts by size', () => {
    const list = friendBalances([
      group('g1', [{ from: 'rohan', to: 'me', amount: 500 }, { from: 'me', to: 'priya', amount: 300 }]),
      group('g2', [{ from: 'me', to: 'rohan', amount: 200 }]),
    ])
    expect(list.map((f) => [f.name, f.net])).toEqual([['Rohan', 300], ['Priya', -300]])
    expect(list[0].parts.map((p) => [p.d.group.id, p.amount])).toEqual([['g1', 500], ['g2', -200]])
  })

  it('keeps currencies apart and skips personal, archived and third-party debts', () => {
    const list = friendBalances([
      group('inr', [{ from: 'rohan', to: 'me', amount: 100 }]),
      group('aud', [{ from: 'rohan', to: 'me', amount: 100 }], { currency: 'AUD' }),
      group('personal', [{ from: 'rohan', to: 'me', amount: 100 }], { type: 'personal' }),
      group('old', [{ from: 'rohan', to: 'me', amount: 100 }], { archived: true }),
      group('others', [{ from: 'rohan', to: 'priya', amount: 100 }]),
    ])
    expect(list.map((f) => [f.currency, f.net])).toEqual([['INR', 100], ['AUD', 100]])
  })

  it('matches by uid, else by name (case-insensitive)', () => {
    expect(friendKey({ uid: 'x', name: 'A' })).toBe('u:x')
    expect(friendKey({ name: ' Priya ' })).toBe('n:priya')
    const list = friendBalances([
      group('g1', [{ from: 'priya', to: 'me', amount: 100 }]),
      { ...group('g2', [{ from: 'p2', to: 'me', amount: 50 }]), group: { id: 'g2', type: 'trip', currency: 'INR', members: { me: members.me, p2: { name: 'priya', color: '#444' } } } },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].net).toBe(150)
  })

  it('ignores groups where I am not a member', () => {
    expect(friendBalances([{ ...group('g', [{ from: 'rohan', to: 'priya', amount: 1 }]), me: undefined }])).toEqual([])
  })
})

describe('filters', () => {
  const list = [{ net: 10 }, { net: -5 }, { net: 0 }]
  it('parses only the two known values', () => {
    expect(parseFriendFilter('owed')).toBe('owed')
    expect(parseFriendFilter('owe')).toBe('owe')
    expect(parseFriendFilter('all')).toBeNull()
    expect(parseFriendFilter(null)).toBeNull()
  })
  it('keeps the matching direction', () => {
    expect(filterFriends(list, 'owed')).toEqual([{ net: 10 }])
    expect(filterFriends(list, 'owe')).toEqual([{ net: -5 }])
    expect(filterFriends(list, null)).toBe(list)
  })
})
