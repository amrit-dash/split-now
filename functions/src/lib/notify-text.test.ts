import { describe, expect, it } from 'vitest'
import { addedToGroupNote, groupDeletedNote, groupTitle, mentionNote, mergeAskNote, mergeDecidedNote, payLinkClaimedNote, payLinkPaidNote } from './notify-text'

describe('Pay me link push to the payee', () => {
  const base = { code: 'abcdefghijkmnpqrstuvwxyz', groupName: 'Goa trip', emoji: '🏖️', payerName: 'Rahul', amount: 124000, currency: 'INR' }
  it('recorded in the group: says so and how to undo it, opens the link', () => {
    expect(payLinkPaidNote({ ...base, recorded: true })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Rahul marked ₹1,240 paid · Goa trip. It’s recorded as a payment; not right? Delete it in the group.',
      url: '/r/abcdefghijkmnpqrstuvwxyz',
      tag: 'paylink-abcdefghijkmnpqrstuvwxyz',
    })
  })
  it('a table without a group, with a screenshot', () => {
    expect(payLinkPaidNote({ ...base, groupName: 'Pho', emoji: undefined, amount: 25050, recorded: false, withProof: true }).body).toBe(
      'Rahul marked ₹250.50 paid · Pho. Screenshot attached.',
    )
  })
})

describe('claim push to a live table host', () => {
  it('asks the host to confirm, says it counts only then', () => {
    expect(
      payLinkClaimedNote({ code: 'abcdefghijkmnpqrstuvwxyz', groupName: 'Pho', payerName: 'Gran', amount: 25000, currency: 'INR', withProof: true }),
    ).toEqual({
      title: 'Pho',
      body: 'Gran says they’ve paid ₹250 · confirm. Screenshot attached. It counts once you confirm it.',
      url: '/r/abcdefghijkmnpqrstuvwxyz',
      tag: 'paylink-abcdefghijkmnpqrstuvwxyz',
    })
  })
})

describe('groupDeletedNote', () => {
  it('says who deleted it and that it can be restored, and opens the group', () => {
    const n = groupDeletedNote({ groupId: 'g1', groupName: 'Goa', emoji: '🏖️', byName: 'Amrit', days: 30 })
    expect(n).toMatchObject({ title: '🏖️ Goa', url: '/groups/g1', tag: 'group-deleted-g1' })
    expect(n.body).toBe('Amrit deleted this group. You can restore it within 30 days.')
  })
})

describe('payLinkPaidNote when the server couldn’t record it', () => {
  it('says why instead of “recorded”', () => {
    const n = payLinkPaidNote({
      code: 'c',
      groupName: 'Goa',
      payerName: 'Rahul',
      amount: 124000,
      currency: 'INR',
      recorded: false,
      skipped: 'It isn’t recorded in Goa because the group is in Recently deleted.',
    })
    expect(n.body).toContain('Recently deleted')
    expect(n.body).not.toContain('It’s recorded')
  })
})

describe('addedToGroupNote', () => {
  it('names who added you, and opens the group', () => {
    expect(addedToGroupNote({ groupId: 'g1', groupName: 'Goa trip', emoji: '🏖️', byName: 'Priya' })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Priya added you to this group.',
      url: '/groups/g1',
      tag: 'group-added-g1',
    })
    expect(addedToGroupNote({ groupId: 'g1', groupName: 'Flat' }).body).toBe('You were added to this group.')
  })
})

describe('mentions and merges', () => {
  const g = { groupId: 'g1', groupName: 'Goa trip', emoji: '🏖️' }
  it('a mention says who, with the words, and opens the chat', () => {
    expect(mentionNote({ ...g, authorName: 'Rahul', text: ' @Priya  did you pay\nthe cab? ' })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Rahul mentioned you: @Priya did you pay the cab?',
      url: '/groups/g1/chat',
      tag: 'chat-g1',
    })
    expect(mentionNote({ ...g, authorName: 'Rahul', text: '' }).body).toBe('Rahul mentioned you: in the chat')
  })
  it('the creator is asked to OK a merge; the asker hears the answer', () => {
    expect(mergeAskNote({ ...g, byName: 'Rahul', fromName: 'Priya', intoName: 'Priya S.' }).body).toBe(
      'Rahul asks to make Priya and Priya S. one person. Your OK is needed',
    )
    expect(mergeDecidedNote({ ...g, ok: true, fromName: 'Priya', intoName: 'Priya S.' }).body).toBe('Priya and Priya S. are one person now')
    expect(mergeDecidedNote({ ...g, ok: false, fromName: 'Priya', intoName: 'Priya S.' }).body).toBe('Making Priya and Priya S. one person was declined')
  })
})

describe('group titles', () => {
  it('the icon first for a group; a 1:1 is the person, then 🤝', () => {
    expect(groupTitle('Goa trip', '🏖️')).toBe('🏖️ Goa trip')
    expect(groupTitle('Meera', '🤝')).toBe('Meera 🤝')
    expect(groupTitle('Goa trip')).toBe('Goa trip')
  })
})
