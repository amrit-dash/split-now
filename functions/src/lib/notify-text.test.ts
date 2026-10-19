import { describe, expect, it } from 'vitest'
import {
  addedToGroupNote,
  expenseDeletedNote,
  expenseNote,
  groupDeletedNote,
  joinAskedNote,
  joinDecidedNote,
  mentionNote,
  mergeAskNote,
  mergeDecidedNote,
  payLinkClaimedNote,
  payLinkPaidNote,
} from './notify-text'

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

describe('asking to join a group that needs its creator’s OK', () => {
  const g = { groupId: 'g1', groupName: 'Goa trip', emoji: '🏖️' }
  it('the creator hears who asked, and the Inbox opens', () => {
    expect(joinAskedNote({ ...g, name: 'Carol Singh', uid: 'u9' })).toEqual({
      title: '🏖️ Goa trip',
      body: 'Carol Singh asked to join. Open the Inbox to let them in or decline.',
      url: '/inbox',
      tag: 'join-g1-u9',
    })
  })
  it('the asker hears the answer; a decline opens Home, not the group', () => {
    expect(joinDecidedNote({ ...g, ok: true })).toMatchObject({ body: 'You’re in. Open the group to see its expenses.', url: '/groups/g1' })
    const no = joinDecidedNote({ ...g, ok: false })
    expect(no).toMatchObject({ url: '/', tag: 'join-declined-g1' })
    expect(no.body).toBe('Your request to join wasn’t accepted. You can ask again tomorrow.')
  })
})

describe('expenseDeletedNote', () => {
  it('says who deleted what, that it can be restored, and opens the expense', () => {
    const n = expenseDeletedNote({
      groupId: 'g1',
      expenseId: 'e1',
      groupName: 'Goa',
      emoji: '🏖️',
      actorName: 'Amrit',
      description: 'Dinner',
      amount: 50000,
      currency: 'INR',
      days: 30,
    })
    expect(n).toEqual({
      title: '🏖️ Goa',
      body: 'Amrit deleted Dinner · ₹500. You can restore it within 30 days.',
      url: '/groups/g1/expenses/e1',
      tag: 'expense-deleted-e1',
    })
  })
  it('names an untitled expense', () => {
    expect(
      expenseDeletedNote({ groupId: 'g', expenseId: 'e', groupName: 'G', actorName: 'A', description: '', amount: 100, currency: 'INR', days: 7 }).body,
    ).toBe('A deleted an expense · ₹1. You can restore it within 7 days.')
  })
})

describe('new money received push', () => {
  const base = { groupId: 'g1', expenseId: 'e1', groupName: 'Goa', actorName: 'Amrit', description: 'Flight refund', amount: 100000, currency: 'INR' }
  it('tells each sharer their share, and the receiver what they received', () => {
    expect(expenseNote({ ...base, received: true, paid: 25000, share: 0 }).body).toBe('Amrit added money received: Flight refund · ₹1,000 · your share ₹250')
    expect(expenseNote({ ...base, received: true, paid: 0, share: 100000 }).body).toBe(
      'Amrit added money received: Flight refund · ₹1,000 · you received ₹1,000',
    )
  })
  it('an expense reads as before', () => {
    expect(expenseNote({ ...base, description: 'Dinner', paid: 0, share: 25000 }).body).toBe('Amrit added Dinner · ₹1,000 · your share ₹250')
  })
})

describe('pushes about a private group', () => {
  it('find the group from the link, and say nothing about what happened', async () => {
    const { groupOfUrl, privateGroupNote } = await import('./notify-text')
    expect(groupOfUrl('/groups/g_1/expenses/e1')).toBe('g_1')
    expect(groupOfUrl('/groups/g_1')).toBe('g_1')
    expect(groupOfUrl('/groups/g_1?tab=balances')).toBe('g_1')
    expect(groupOfUrl('/settle/with/u1')).toBeUndefined()
    expect(groupOfUrl(undefined)).toBeUndefined()
    expect(groupOfUrl('/insights?group=g_2')).toBe('g_2')
    expect(groupOfUrl('/insights?x=1&group=g_3')).toBe('g_3')
    const n = privateGroupNote({ title: '🏖️ Goa', body: 'Amrit added Hotel · ₹5,000', url: '/groups/g/expenses/e', tag: 't' })
    expect(n).toEqual({ title: 'Split Now', body: 'Something new in a private group. Open it to see.', url: '/groups/g/expenses/e', tag: 't' })
  })
  it('say what kind of thing happened, and nothing more', async () => {
    const { budgetNote, nudgeNote, privateGroupNote, reminderNote } = await import('./notify-text')
    const say = (n: Parameters<typeof privateGroupNote>[0]) => {
      const out = privateGroupNote(n)
      expect(out.title).toBe('Split Now')
      expect(out.body).not.toMatch(/Goa|₹|Hotel/)
      return out.body
    }
    expect(say(reminderNote({ groupId: 'g', groupName: 'Goa', owed: 120000, currency: 'INR' }))).toBe('You have a balance to settle in a private group.')
    expect(say(budgetNote({ groupId: 'g', groupName: 'Goa', threshold: 80, spent: 8000, budget: 10000, currency: 'INR' }))).toBe(
      'A private group has reached 80% of its budget.',
    )
    expect(say(budgetNote({ groupId: 'g', groupName: 'Goa', threshold: 100, spent: 12000, budget: 10000, currency: 'INR' }))).toBe(
      'A private group is over its budget.',
    )
    expect(
      say(nudgeNote({ groupId: 'g', groupName: 'Goa', fromName: 'Rahul', owed: 120000, currency: 'INR', debtorMemberId: 'm1', senderMemberId: 'm2' })),
    ).toBe('Rahul sent you a nudge about a private group. Open it to settle up.')
    expect(say({ title: 'x', body: 'Hotel', url: '/groups/g/chat', tag: 'chat-g' })).toBe('New message in a private group.')
  })
})
