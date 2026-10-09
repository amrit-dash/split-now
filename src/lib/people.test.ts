import { describe, expect, it } from 'vitest'
import type { Group, Member } from '@/types'
import { isEmail, knownPeople, nameFromEmail, recentPeople, searchPeople } from './people'

const me: Member = { name: 'Me', uid: 'me', color: '#000' }
const g = (id: string, updatedAt: number, people: Array<Partial<Member> & { name: string }>, type: Group['type'] = 'trip') =>
  ({ id, type, updatedAt, members: Object.fromEntries([['me', me], ...people.map((p, i) => [`${id}${i}`, { color: '#000', ...p }])]) }) as unknown as Group

const groups = [
  g('a', 1, [{ name: 'Old Pal' }, { name: 'Riya Sharma', uid: 'r', email: 'riya@x.com' }]),
  g('b', 5, [{ name: 'Riya Sharma', uid: 'r' }, { name: 'Kabir' }]),
  g('c', 4, [{ name: 'Dev' }]),
  g('d', 3, [{ name: 'Meera' }], 'direct'),
  g('e', 2, [{ name: 'Sam' }]),
  g('p', 9, [], 'personal'),
]

describe('people', () => {
  it('knownPeople merges everyone, most shared first', () => {
    const k = knownPeople(groups, 'me')
    expect(k[0]).toMatchObject({ name: 'Riya Sharma', n: 2, email: 'riya@x.com' })
    expect(k.map((p) => p.name)).toContain('Old Pal')
  })

  it('recentPeople only looks at the 4 latest groups and 1:1s', () => {
    expect(recentPeople(groups, 'me').map((p) => p.name)).toEqual(['Riya Sharma', 'Kabir', 'Dev', 'Meera', 'Sam'])
    expect(recentPeople(groups, 'me', 'b').map((p) => p.name)).toEqual(['Dev', 'Meera', 'Sam', 'Old Pal', 'Riya Sharma'])
  })

  it('searchPeople matches name or email, name starts first', () => {
    const k = knownPeople(groups, 'me')
    expect(searchPeople(k, 'kab').map((p) => p.name)).toEqual(['Kabir'])
    expect(searchPeople(k, 'sha').map((p) => p.name)).toEqual(['Riya Sharma'])
    expect(searchPeople(k, 'RIYA@').map((p) => p.name)).toEqual(['Riya Sharma'])
    expect(searchPeople(k, 'm').map((p) => p.name)).toEqual(['Meera', 'Riya Sharma', 'Sam'])
    expect(searchPeople(k, '  ')).toEqual([])
    expect(searchPeople(k, 'a', 2)).toHaveLength(2)
  })

  it('emails', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('riya')).toBe(false)
    expect(nameFromEmail('riya.sharma@x.com')).toBe('Riya Sharma')
    expect(nameFromEmail('42@x.com')).toBe('42')
  })
})
