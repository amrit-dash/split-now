import { describe, expect, it } from 'vitest'
import { expensePref, newlyWaiting, paymentOkPref, reapprovalRecipients } from './approval-push'
import { reapprovalNote } from './notify-text'

const members = { a: { uid: 'ua' }, b: { uid: 'ub' }, c: { uid: 'uc' }, gone: { uid: 'ug', removedAt: 1 } }
const base = { requiresApproval: true, createdBy: 'ua', splits: { a: 100, b: 100, c: 100, gone: 100 } }
const ok = (...uids: string[]): Record<string, true> => Object.fromEntries(uids.map((u) => [u, true as const]))

describe('which switch an approval push answers to', () => {
  it('asks go to Needs your OK, news to the everyday switches', () => {
    expect(expensePref(true)).toBe('approvals')
    expect(expensePref(false)).toBe('expenses')
    expect(paymentOkPref(false)).toBe('approvals')
    expect(paymentOkPref(true)).toBe('settlements')
  })
})

describe('newlyWaiting', () => {
  it('an edit that takes OKs away makes those people wait again', () => {
    const before = { ...base, approvals: ok('ub', 'uc') }
    const after = { ...base, approvals: {} }
    expect(newlyWaiting(before, after, members)).toEqual(['b', 'c'])
  })
  it('an edit inside the small-edit allowance keeps the OKs: nobody new waits', () => {
    const e = { ...base, approvals: ok('ub') }
    expect(newlyWaiting(e, { ...e }, members)).toEqual([])
  })
  it('approving never pushes', () => {
    expect(newlyWaiting({ ...base, approvals: {} }, { ...base, approvals: ok('ub') }, members)).toEqual([])
  })
  it('approval switched on for an expense makes the charged people wait (not the author, not someone who left)', () => {
    expect(newlyWaiting({ ...base, requiresApproval: false }, base, members)).toEqual(['b', 'c'])
  })
  it('nothing for a trashed expense or a missing side', () => {
    expect(newlyWaiting({ ...base, approvals: ok('ub') }, { ...base, approvals: {}, deletedAt: 5 }, members)).toEqual([])
    expect(newlyWaiting(undefined, base, members)).toEqual([])
  })
})

describe('reapprovalRecipients', () => {
  it('never the editor, each account once, nobody without an account', () => {
    expect(reapprovalRecipients(['ub', 'uc', 'ub', undefined], 'uc')).toEqual(['ub'])
    expect(reapprovalRecipients(['ub', 'uc'], undefined)).toEqual(['ub', 'uc'])
    expect(reapprovalRecipients(['ub'], 'ub')).toEqual([])
  })
})

describe('reapprovalNote', () => {
  it('says who changed it when the expense names its editor', () => {
    const n = reapprovalNote({ groupId: 'g', expenseId: 'e', groupName: 'Goa', description: 'Dinner', amount: 250000, currency: 'INR', editorName: 'Rahul' })
    expect(n.body).toBe('Rahul changed Dinner · ₹2,500 · needs your OK again')
    expect(reapprovalNote({ groupId: 'g', expenseId: 'e', groupName: 'Goa', description: '', amount: 100, currency: 'INR' }).body).toBe(
      'An expense changed · ₹1 · needs your OK again',
    )
  })
  it('names the expense and opens it', () => {
    const n = reapprovalNote({ groupId: 'g', expenseId: 'e', groupName: 'Goa', emoji: '🏖️', description: 'Dinner', amount: 250000, currency: 'INR' })
    expect(n.title).toBe('🏖️ Goa')
    expect(n.body).toBe('Dinner changed · ₹2,500 · needs your OK again')
    expect(n.url).toBe('/groups/g/expenses/e')
  })
})
