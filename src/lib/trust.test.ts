import { describe, expect, it } from 'vitest'
import type { Expense, Group } from '@/types'
import {
  awaitingMyApproval,
  awaitingMyOk,
  canPurge,
  paymentState,
  paymentsToConfirm,
  countedSettlements,
  countedExpenses,
  daysLeftInTrash,
  expiredTrash,
  flaggableAs,
  isDisputed,
  isPending,
  liveItems,
  expenseEditPatch,
  needsApproval,
  pendingApprovers,
  prepareExpenseSave,
  prepareOccurrence,
  prepareSettlementSave,
  thresholdOf,
  trashedItems,
  waitingSettlements,
  waitingTotal,
} from './trust'

const DAY = 86_400_000
const group: Group = {
  id: 'g',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'AUD',
  simplify: false,
  requireApproval: true,
  approvalThreshold: 10000,
  memberUids: ['ua', 'ub'],
  members: { a: { name: 'A', uid: 'ua', color: '' }, b: { name: 'B', uid: 'ub', color: '' }, c: { name: 'C', color: '' } },
  inviteCode: 'X',
  createdBy: 'ua',
  createdAt: 0,
  updatedAt: 0,
}
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: 'e',
  groupId: 'g',
  description: 'Hotel',
  amount: 30000,
  category: 'stay',
  date: '2026-10-01',
  paidBy: { a: 30000 },
  splits: { a: 10000, b: 10000, c: 10000 },
  splitType: 'equal',
  splitInput: {},
  createdBy: 'ua',
  createdAt: 0,
  updatedAt: 0,
  ...over,
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
    expect(needsApproval({ requireApproval: true, currency: 'AUD' }, 10001)).toBe(true) // default A$100
    expect(needsApproval({ requireApproval: true, currency: 'INR' }, 10001)).toBe(false) // default ₹2,000
    expect(needsApproval({ requireApproval: true, currency: 'INR' }, 200001)).toBe(true)
    expect(needsApproval({ requireApproval: true, currency: 'JPY' }, 10001)).toBe(true) // ¥10,000
    expect(needsApproval({ requireApproval: true, currency: 'XOF' }, 10001)).toBe(true) // off the table: flat fallback
    expect(thresholdOf({ approvalThreshold: 500, currency: 'INR' })).toBe(500)
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
    const o = prepareOccurrence(
      exp({ dispute: flag, approvals: { ub: true }, deletedAt: 1, deletedBy: 'ua', receiptUrl: 'https://x/r.jpg', receiptPath: 'receipts/g/e-1.jpg' }),
      group,
    )
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
    expect(
      expenseEditPatch(prev, prepareExpenseSave(prev, exp({ amount: 33000, paidBy: { a: 33000 }, splits: { a: 11000, b: 11000, c: 11000 } }), group, 'uz'))
        .approvals,
    ).toBeNull()
  })
  it('adds requiresApproval, and drops it when the amount falls to the threshold or below', () => {
    const plain = exp()
    const up = prepareExpenseSave(plain, exp({ amount: 30001, paidBy: { a: 30001 }, splits: { a: 10001, b: 10000, c: 10000 } }), group, 'ua')
    expect(expenseEditPatch(plain, up).set.requiresApproval).toBe(true)
    const down = prepareExpenseSave(prev, exp({ amount: 500, paidBy: { a: 500 }, splits: { a: 500 } }), group, 'ua')
    expect(down.requiresApproval).toBeUndefined()
    const p = expenseEditPatch(prev, down)
    expect(p.set).not.toHaveProperty('requiresApproval')
    expect(p.unset).toContain('requiresApproval')
  })
  it('keeps requiresApproval on an edit that stays above the threshold', () => {
    const still = prepareExpenseSave(prev, exp({ amount: 20000, paidBy: { a: 20000 }, splits: { a: 10000, b: 10000 } }), group, 'ua')
    expect(still.requiresApproval).toBe(true)
    expect(expenseEditPatch(prev, still).unset).not.toContain('requiresApproval')
  })
})

describe('approval on edit', () => {
  const pending = exp({ requiresApproval: true, approvals: { ub: true } })
  const small = { amount: 10000, paidBy: { a: 10000 }, splits: { a: 5000, b: 5000 } }
  it('an edit to exactly the threshold clears the mark (only amounts above it need an OK)', () => {
    const out = prepareExpenseSave(pending, exp(small), group, 'ua')
    expect(out.requiresApproval).toBeUndefined()
    expect(isPending(out, group)).toBe(false)
    expect(countedExpenses([out], group)).toHaveLength(1)
  })
  it('clears the mark when the group no longer asks for approval, even with the same amount', () => {
    const out = prepareExpenseSave(pending, exp({ description: 'Villa' }), { ...group, requireApproval: false }, 'ua')
    expect(out.requiresApproval).toBeUndefined()
    expect(expenseEditPatch(pending, out).unset).toEqual(['requiresApproval'])
  })
  it('keeps the mark on an unchanged amount still above the threshold', () => {
    expect(prepareExpenseSave(pending, exp({ description: 'Villa' }), group, 'ua').requiresApproval).toBe(true)
  })
  it('never clears it when the group is not known on this device', () => {
    expect(prepareExpenseSave(pending, exp(small), undefined, 'ua').requiresApproval).toBe(true)
    expect(prepareExpenseSave(undefined, exp(), undefined, 'ua').requiresApproval).toBeUndefined()
  })
  it('an amount change above the threshold asks again', () => {
    const plain = exp()
    expect(prepareExpenseSave(plain, exp({ amount: 40000, paidBy: { a: 40000 }, splits: { a: 40000 } }), group, 'ua').requiresApproval).toBe(true)
    // same amount, never marked: an unrelated edit doesn't start asking
    expect(prepareExpenseSave(plain, exp({ description: 'Villa' }), group, 'ua').requiresApproval).toBeUndefined()
  })
})

describe('edit auto-approve', () => {
  const g = { ...group, editAutoApprove: 1000 } // A$100 threshold, edits within A$10 keep approval
  const pending = exp({ requiresApproval: true, approvals: { ub: true } })
  const by = (amount: number) => exp({ amount, paidBy: { a: amount }, splits: { a: amount - 20000, b: 10000, c: 10000 } })
  it('a change within the limit keeps the mark and every approval', () => {
    const out = prepareExpenseSave(pending, by(30800), g, 'ua')
    expect(out.requiresApproval).toBe(true)
    expect(out.approvals).toEqual({ ub: true })
    const p = expenseEditPatch(pending, out, { keepApprovals: true })
    expect(p.approvals).toBeUndefined()
    expect(p.unset).not.toContain('requiresApproval')
  })
  it('a bigger change asks again: approvals reset to the editor’s own', () => {
    const out = prepareExpenseSave(pending, by(31001), g, 'ua')
    expect(out.requiresApproval).toBe(true)
    expect(out.approvals).toBeUndefined()
    expect(expenseEditPatch(pending, out).approvals).toBeNull()
  })
  it('with auto-approve off any amount change asks again', () => {
    const out = prepareExpenseSave(pending, by(30100), group, 'ub')
    expect(out.requiresApproval).toBe(true)
    expect(out.approvals).toEqual({ ub: true })
  })
  it('a still-pending expense stays pending after a small edit', () => {
    const out = prepareExpenseSave(exp({ requiresApproval: true }), by(29500), g, 'ua')
    expect(out.requiresApproval).toBe(true)
    expect(isPending(out, g)).toBe(true)
  })
})

describe('expenseEditPatch (more)', () => {
  const prev = exp({ notes: 'old', approvals: { ub: true, ua: true }, requiresApproval: true })
  it('is empty when nothing changed', () => {
    const next = prepareExpenseSave(prev, exp({ notes: 'old' }), group, 'ua')
    expect(expenseEditPatch(prev, next)).toEqual({ set: {}, unset: [] })
  })
})

describe('payments that need the recipient’s OK', () => {
  const g = {
    members: { me: { name: 'Me', uid: 'u_me', color: '#000' }, b: { name: 'Bob', uid: 'u_b', color: '#111' }, c: { name: 'Cat', color: '#222' } },
    paymentApproval: true,
  }
  const s = { id: 's1', groupId: 'g1', from: 'b', to: 'me', amount: 500, method: 'UPI', date: '2026-10-10', createdBy: 'u_b', createdAt: 1 }

  it('prepareSettlementSave marks a payment someone else records for the payee, and nothing else', () => {
    expect(prepareSettlementSave(s, g, 'u_b').needsOk).toBe(true)
    expect(prepareSettlementSave(s, g, 'u_me').needsOk).toBeUndefined()
    expect(prepareSettlementSave({ ...s, to: 'c' }, g, 'u_b').needsOk).toBeUndefined()
    expect(prepareSettlementSave(s, { ...g, paymentApproval: false }, 'u_b').needsOk).toBeUndefined()
    expect(prepareSettlementSave({ ...s, importedFrom: 'csv' }, g, 'u_b').needsOk).toBeUndefined()
    const sneaky = { ...s, ok: { by: 'u_b', at: 1, via: 'payee' as const }, aiCheck: { verdict: 'match' as const, reasons: [], at: 1 } }
    expect(prepareSettlementSave(sneaky, g, 'u_b')).not.toHaveProperty('ok')
    expect(prepareSettlementSave(sneaky, g, 'u_b')).not.toHaveProperty('aiCheck')
  })
  it('counted, waiting and mine to OK', () => {
    const waiting = { ...s, needsOk: true }
    expect(countedSettlements([waiting, { ...s, id: 's2' }], g).map((x) => x.id)).toEqual(['s2'])
    expect(waitingSettlements([waiting], g)).toHaveLength(1)
    expect(awaitingMyOk(waiting, g, 'u_me')).toBe(true)
    expect(awaitingMyOk(waiting, g, 'u_b')).toBe(false)
    expect(countedSettlements([waiting], { ...g, paymentApproval: false })).toHaveLength(1)
  })
  it('paymentState: the pill and whether I decide', () => {
    const w = { ...s, needsOk: true }
    expect(paymentState(w, g, 'u_me')).toEqual({ pill: 'needs-ok', canDecide: true })
    expect(paymentState(w, g, 'u_b')).toEqual({ pill: 'needs-ok', canDecide: false })
    expect(paymentState({ ...w, flag: { by: 'u_me', at: 2 } }, g, 'u_me')).toEqual({ pill: 'flagged', canDecide: true })
    expect(paymentState({ ...w, ok: { by: 'ai', at: 2, via: 'ai' } }, g, 'u_me')).toEqual({ pill: 'matched', canDecide: true })
    expect(paymentState({ ...w, ok: { by: 'u_me', at: 2, via: 'payee' } }, g, 'u_me')).toEqual({ canDecide: false })
    expect(paymentState(s, g, 'u_me')).toEqual({ canDecide: false })
    expect(paymentState(w, { ...g, paymentApproval: false }, 'u_me')).toEqual({ canDecide: false })
  })
  it('paymentsToConfirm: waiting for me, and cleared by a screenshot this week', () => {
    const now = 10 * 86_400_000
    const waiting = [
      { ...s, needsOk: true, createdAt: 3 },
      { ...s, id: 'flagged', needsOk: true, flag: { by: 'u_me', at: 1 } },
      { ...s, id: 'theirs', from: 'me', to: 'b', needsOk: true },
    ]
    const settlements = [
      { ...s, id: 'matched', needsOk: true, ok: { by: 'ai', at: now - 86_400_000, via: 'ai' as const }, createdAt: 5 },
      { ...s, id: 'old', needsOk: true, ok: { by: 'ai', at: now - 8 * 86_400_000, via: 'ai' as const } },
      { ...s, id: 'mine-ok', needsOk: true, ok: { by: 'u_me', at: now, via: 'payee' as const } },
    ]
    const out = paymentsToConfirm([{ group: g, waiting, settlements }], 'u_me', now)
    expect(out.map((x) => [x.s.id, x.matched])).toEqual([
      ['matched', true],
      ['s1', false],
    ])
    // Bob is the payee of the one recorded to him.
    expect(paymentsToConfirm([{ group: g, waiting, settlements }], 'u_b', now).map((x) => x.s.id)).toEqual(['theirs'])
  })
  it('waitingTotal adds up what one person recorded to another', () => {
    const w = [
      { ...s, needsOk: true },
      { ...s, id: 's2', amount: 250, needsOk: true },
      { ...s, id: 's3', from: 'me', to: 'b', needsOk: true },
    ]
    expect(waitingTotal(w, 'b', 'me')).toBe(750)
    expect(waitingTotal(w, 'me', 'b')).toBe(500)
    expect(waitingTotal([], 'b', 'me')).toBe(0)
  })
})
