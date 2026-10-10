import { describe, expect, it } from 'vitest'
import { groupDeletedNote } from './notify-text'

describe('groupDeletedNote', () => {
  it('says who deleted it and that it can be restored, and opens the group', () => {
    const n = groupDeletedNote({ groupId: 'g1', groupName: 'Goa', emoji: '🏖️', byName: 'Amrit', days: 30 })
    expect(n).toMatchObject({ title: '🏖️ Goa', url: '/groups/g1', tag: 'group-deleted-g1' })
    expect(n.body).toBe('Amrit deleted this group. You can restore it within 30 days.')
  })
})
