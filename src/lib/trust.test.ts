import { describe, expect, it } from 'vitest'
import type { Expense, Group } from '@/types'
import {
  awaitingMyApproval, canPurge, countedExpenses, daysLeftInTrash, expiredTrash, flaggableAs, isDisputed, isPending, liveItems,
  expenseEditPatch, needsApproval, pendingApprovers, prepareExpenseSave, prepareOccurrence, trashedItems,
} from './trust'

const DAY = 86_400_000
const group: Group = {
  id: 'g', name: 'Trip', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: false, requireApproval: true, approvalThreshold: 10000,
  memberUids: ['ua', 'ub'], members: { a: { name: 'A', uid: 'ua', color: '' }, b: { name: 'B', uid: 'ub', color: '' }, c: { name: 'C', color: '' } },
  inviteCode: 'X', createdBy: 'ua', createdAt: 0, updatedAt: 0,
}
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: 'e', groupId: 'g', description: 'Hotel', amount: 30000, category: 'stay', date: '2026-10-01',
  paidBy: { a: 30000 }, splits: { a: 10000, b: 10000, c: 10000 }, splitType: 'equal', splitInput: {},
  createdBy: 'ua', createdAt: 0, updatedAt: 0, ...over,
})

describe('trash', () => {
  const now = 100 * DAY
  const items = [exp({ id: '1' }), exp({ id: '2', deletedAt: now - DAY, deletedBy: 'ub' }), exp({ id: '3', deletedAt: now - 31 * DAY, deletedBy: 'ub' })]
  it('separates live, restorable and expired items', () => {
    expect(liveItems(items).map((e) => e.id)).toEqual(['1'])
    expect(trashedItems(items, now).map((e) => e.id)).toEqual(['2'])
    expect(expiredTrash(items, now).map((e) => e.id)).toEqual(['3'])
    expect(daysLeftInTrash(items[1], now)).toBe(29)
  })
  it('only the deleter or the group creator may purge', () => {
    expect(canPurge(items[1], group, 'ub')).toBe(true)
    expect(canPurge(items[1], group, 'ua')).toBe(true) // creator
    expect(canPurge(items[1], { createdBy: 'ua' }, 'uz')).toBe(false)
  })
})

describe('approval', () => {
  it('only above the threshold and when the group asks for it', () => {
    expect(needsApproval(group, 10000)).toBe(false)
    expect(needsApproval(group, 10001)).toBe(true)
    expect(needsApproval({ ...group, requireApproval: false }, 50000)).toBe(false)
    expect(needsApproval({ requireApproval: true }, 10001)).toBe(true) // default A$100
  })
  it('waits for charged members with accounts, other than the author', () => {
    const e = exp({ requiresApproval: true })
    expect(pendingApprovers(e, group)).toEqual(['b']) // a is the author, c is a placeholder
    expect(isPending(e, group)).toBe(true)
    expect(awaitingMyApproval(e, group, 'ub')).toBe(true)
    expect(awaitingMyApproval(e, group, 'ua')).toBe(false)
    const ok = { ...e, approvals: { ub: true as const } }
    expect(isPending(ok, group)).toBe(false)
    expect(isPending(exp(), group)).toBe(false) // not flagged as requiring approval
  })
  it('pending and trashed expenses are left out of balances', () => {
    const list = [exp({ id: '1' }), exp({ id: '2', requiresApproval: true }), exp({ id: '3', deletedAt: 1, deletedBy: 'ua' })]
    expect(countedExpenses(list, group).map((e) => e.id)).toEqual(['1'])
  })
})

describe('disputes', () => {
  it('a member can flag only expenses they are part of', () => {
    expect(flaggableAs(exp(), group, 'ub')).toBe('b')
    expect(flaggableAs(exp({ splits: { a: 30000 } }), group, 'ub')).toBeUndefined()
    expect(isDisputed(exp({ dispute: { ub: { byUid: 'ub', memberId: 'b', reason: 'no', at: 1 } } }))).toBe(true)
    expect(isDisputed(exp({ dispute: {} }))).toBe(false)
  })
})

describe('prepareExpenseSave', () => {
  const flag = { ub: { byUid: 'ub', memberId: 'b', reason: 'too much', at: 1 } }
  it('new expense above the threshold requires approval; form trust fields are ignored', () => {
    const out = prepareExpenseSave(undefined, exp({ dispute: flag, approvals: { ub: true }, deletedAt: 5 }), group, 'ua')
    expect(out.requiresApproval).toBe(true)
    expect(out.dispute).toBeUndefined()
    expect(out.approvals).toBeUndefined()
    expect(out.deletedAt).toBeUndefined()
    expect(prepareExpenseSave(undefined, exp({ amount: 5000, paidBy: { a: 5000 }, splits: { a: 5000 } }), group, 'ua').requiresApproval).toBeUndefined()
  })
  it('an edit keeps flags and approvals when the money is unchanged', () => {
    const prev = exp({ dispute: flag, approvals: { ub: true }, requiresApproval: true })
    const out = prepareExpenseSave(prev, exp({ description: 'Villa' }), group, 'ua')
    expect(out.dispute).toEqual(flag)
    expect(out.approvals).toEqual({ ub: true })
    expect(out.requiresApproval).toBe(true)
  })
  it('changing the money clears other people’s approvals', () => {
    const prev = exp({ approvals: { ub: true, ua: true }, requiresApproval: true })
    const next = exp({ amount: 33000, paidBy: { a: 33000 }, splits: { a: 11000, b: 11000, c: 11000 } })
    expect(prepareExpenseSave(prev, next, group, 'ua').approvals).toEqual({ ua: true })
    expect(prepareExpenseSave(prev, next, group, 'uz').approvals).toBeUndefined()
  })
  it('occurrences never inherit trust fields or the receipt', () => {
    const o = prepareOccurrence(exp({ dispute: flag, approvals: { ub: true }, deletedAt: 1, deletedBy: 'ua', receiptUrl: 'https://x/r.jpg', receiptPath: 'receipts/g/e-1.jpg' }), group)
    expect(o).not.toHaveProperty('dispute')
    expect(o).not.toHaveProperty('approvals')
    expect(o).not.toHaveProperty('deletedAt')
    expect(o).not.toHaveProperty('receiptUrl')
    expect(o).not.toHaveProperty('receiptPath')
    expect(o.requiresApproval).toBe(true)
  })
})

describe('expenseEditPatch', () => {
  const flag = { ub: { byUid: 'ub', memberId: 'b', reason: 'too much', at: 1 } }
  const prev = exp({ notes: 'old', approvals: { ub: true, ua: true }, requiresApproval: true, dispute: flag })
  it('writes only the fields that changed and never the trust fields', () => {
    const next = prepareExpenseSave(prev, exp({ description: 'Hotel (2 nights)', notes: undefined, category: 'travel' }), group, 'ua')
    const p = expenseEditPatch(prev, next)
    expect(p.set).toEqual({ description: 'Hotel (2 nights)', category: 'travel' })
    expect(p.unset).toEqual(['notes'])
    expect(p.approvals).toBeUndefined()
    expect(Object.keys(p.set)).not.toContain('dispute')
  })
  it('replaces approvals when the money changed (own approval kept), clearing ones not seen here', () => {
    const next = prepareExpenseSave(prev, exp({ amount: 33000, paidBy: { a: 33000 }, splits: { a: 11000, b: 11000, c: 11000 } }), group, 'ua')
    const p = expenseEditPatch(prev, next)
    expect(p.set).toMatchObject({ amount: 33000, paidBy: { a: 33000 } })
    expect(p.approvals).toEqual({ ua: true })
    expect(expenseEditPatch(prev, prepareExpenseSave(prev, exp({ amount: 33000, paidBy: { a: 33000 }, splits: { a: 11000, b: 11000, c: 11000 } }), group, 'uz')).approvals).toBeNull()
  })
  it('adds requiresApproval but never drops it', () => {
    const plain = exp()
    const up = prepareExpenseSave(plain, exp({ amount: 30001, paidBy: { a: 30001 }, splits: { a: 10001, b: 10000, c: 10000 } }), group, 'ua')
    expect(expenseEditPatch(plain, up).set.requiresApproval).toBe(true)
    const down = prepareExpenseSave(prev, exp({ amount: 500, paidBy: { a: 500 }, splits: { a: 500 } }), group, 'ua')
    const p = expenseEditPatch(prev, down)
    expect(p.set).not.toHaveProperty('requiresApproval')
    expect(p.unset).not.toContain('requiresApproval')
  })
  it('is empty when nothing changed', () => {
    const next = prepareExpenseSave(prev, exp({ notes: 'old' }), group, 'ua')
    expect(expenseEditPatch(prev, next)).toEqual({ set: {}, unset: [] })
  })
})
