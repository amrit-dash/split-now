import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import { personalView } from './personalView'

const base: Group = {
  id: 'g',
  name: 'Priya',
  emoji: '🤝',
  type: 'direct',
  currency: 'INR',
  simplify: true,
  members: { a: { name: 'Asha', uid: 'u1', color: '#000' }, p: { name: 'Priya Nair', uid: 'u2', color: '#111' } },
  memberUids: ['u1', 'u2'],
  inviteCode: 'X',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
}

describe('personalView', () => {
  it('a 1:1 is the other person, on each side', () => {
    expect(personalView(base, 'u1')).toMatchObject({ name: 'Priya Nair', peer: 'p', archived: false })
    expect(personalView(base, 'u2')).toMatchObject({ name: 'Asha', peer: 'a' })
  })
  it('other groups keep their name and get no peer; archived is per person', () => {
    const g = personalView({ ...base, type: 'trip', name: 'Goa', archivedBy: ['u1'] }, 'u1')
    expect(g.name).toBe('Goa')
    expect(g.peer).toBeUndefined()
    expect(g.archived).toBe(true)
  })
})
