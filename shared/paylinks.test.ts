import { describe, expect, it } from 'vitest'
import {
  canMarkPaid,
  claimStatus,
  claimSummary,
  needsHostConfirm,
  triggerAction,
  isPayLinkCode,
  isProofPath,
  linkHandles,
  markPaidPatch,
  PAY_LINK_NOTE,
  payLinkSettlementId,
  payLinkState,
  planRecord,
  shouldHandle,
  type PayLinkDoc,
} from './paylinks'

const CODE = 'abcdefghijkmnpqrstuvwxyz'
const NOW = 1_760_000_000_000
const link: PayLinkDoc = {
  groupId: 'g_goa',
  groupName: 'Goa trip',
  emoji: '🏖️',
  from: 'm_rahul',
  to: 'm_priya',
  amount: 124000,
  currency: 'INR',
  payeeName: 'Priya',
  payerName: 'Rahul',
  payment: { upi: 'priya@okaxis' },
  createdBy: 'u_priya',
  createdAt: NOW - 1000,
  expiresAt: NOW + 86_400_000,
  status: 'open',
}
const group = {
  name: 'Goa trip',
  currency: 'INR',
  memberUids: ['u_priya', 'u_rahul'],
  members: { m_priya: { name: 'Priya', uid: 'u_priya' }, m_rahul: { name: 'Rahul Sharma', uid: 'u_rahul' } },
}
const fmt = (m: number) => `₹${m / 100}`

describe('codes and paths', () => {
  it('accepts 20–40 lowercase letters and digits only', () => {
    expect(isPayLinkCode(CODE)).toBe(true)
    expect(isPayLinkCode('a'.repeat(19))).toBe(false)
    expect(isPayLinkCode('a'.repeat(41))).toBe(false)
    expect(isPayLinkCode('ABCDEFGHIJKMNPQRSTUVWX')).toBe(false)
    expect(isPayLinkCode('abcdefghij/kmnpqrstuvw')).toBe(false)
    expect(isPayLinkCode(42)).toBe(false)
  })
  it('settlement ids are keyed on the code', () => {
    expect(payLinkSettlementId(CODE)).toBe(`pl_${CODE}`)
  })
  it('proof paths must sit in the link’s own folder', () => {
    expect(isProofPath(CODE, `payproofs/${CODE}/p1234.jpg`)).toBe(true)
    expect(isProofPath(CODE, `payproofs/${'z'.repeat(24)}/p1234.jpg`)).toBe(false)
    expect(isProofPath(CODE, `payproofs/${CODE}/../x.jpg`)).toBe(false)
    expect(isProofPath(CODE, `payproofs/${CODE}/p.png`)).toBe(false)
    expect(isProofPath(CODE, `receipts/g/${CODE}.jpg`)).toBe(false)
  })
})

describe('handles a link may carry', () => {
  it('keeps UPI, UPI number, PayID, PayPal and Revolut; never bank account numbers', () => {
    expect(
      linkHandles({ upi: ' priya@okaxis ', phone: '+91 98765 43210', account: '1234567890', ifsc: 'HDFC0001234', bsb: '062000', payid: '', paypal: 'priya' }),
    ).toEqual({
      upi: 'priya@okaxis',
      phone: '+91 98765 43210',
      paypal: 'priya',
    })
    expect(linkHandles(undefined)).toEqual({})
    expect(linkHandles({ upi: 'x'.repeat(150) }).upi).toHaveLength(100)
  })
})

describe('status', () => {
  it('an open link past its expiry reads as expired; paid and cancelled stay as they are', () => {
    expect(payLinkState(link, NOW)).toBe('open')
    expect(payLinkState(link, link.expiresAt)).toBe('expired')
    expect(payLinkState({ ...link, status: 'paid' }, link.expiresAt + 1)).toBe('paid')
    expect(payLinkState({ ...link, status: 'cancelled' }, NOW)).toBe('cancelled')
  })
  it('anyone may mark an open link paid, only its guest when it is locked to one', () => {
    expect(canMarkPaid(link, NOW, undefined)).toBe(true)
    expect(canMarkPaid(link, NOW, 'anon1')).toBe(true)
    expect(canMarkPaid({ ...link, forUid: 'anon1' }, NOW, 'anon1')).toBe(true)
    expect(canMarkPaid({ ...link, forUid: 'anon1' }, NOW, 'anon2')).toBe(false)
    expect(canMarkPaid({ ...link, status: 'paid' }, NOW, 'anon1')).toBe(false)
    expect(canMarkPaid(link, link.expiresAt, 'anon1')).toBe(false)
  })
})

describe('"I’ve paid" patch', () => {
  it('writes status, paidAt and paidBy, plus only the claim fields given', () => {
    expect(markPaidPatch(CODE, {}, 'anon1', NOW)).toEqual({ status: 'paid', paidAt: NOW, paidBy: 'anon1' })
    expect(markPaidPatch(CODE, { method: ' UPI ', proofPath: `payproofs/${CODE}/p1.jpg`, settlementId: 's_1' }, 'u', NOW)).toEqual({
      status: 'paid',
      paidAt: NOW,
      paidBy: 'u',
      method: 'UPI',
      proofPath: `payproofs/${CODE}/p1.jpg`,
      settlementId: 's_1',
    })
  })
  it('refuses a screenshot outside the link’s folder', () => {
    expect(() => markPaidPatch(CODE, { proofPath: 'receipts/g/x.jpg' }, 'u', NOW)).toThrow()
  })
})

describe('trigger: when to act', () => {
  it('only on open → paid, and not when a member recorded it or it was handled', () => {
    expect(shouldHandle(link, { ...link, status: 'paid' })).toBe(true)
    expect(shouldHandle(link, { ...link, status: 'cancelled' })).toBe(false)
    expect(shouldHandle({ ...link, status: 'paid' }, { ...link, status: 'paid', recordedAt: 1 })).toBe(false)
    expect(shouldHandle(link, { ...link, status: 'paid', settlementId: 's_1' })).toBe(false)
    expect(shouldHandle(link, { ...link, status: 'paid', recordedAt: 1 })).toBe(false)
    expect(shouldHandle(undefined, { ...link, status: 'paid' })).toBe(false)
  })
})

describe('what gets recorded', () => {
  const paid: PayLinkDoc = { ...link, status: 'paid', paidAt: NOW, paidBy: 'anon1', method: 'UPI' }
  it('a settlement from → to for the link’s amount, as the payee, keyed on the code', () => {
    const p = planRecord(CODE, paid, group, '2026-10-09', NOW, fmt)
    expect(p).toEqual({
      kind: 'record',
      settlementId: `pl_${CODE}`,
      payeeUid: 'u_priya',
      settlement: {
        groupId: 'g_goa',
        from: 'm_rahul',
        to: 'm_priya',
        amount: 124000,
        method: 'UPI',
        note: PAY_LINK_NOTE,
        date: '2026-10-09',
        createdBy: 'u_priya',
        createdAt: NOW,
        payLink: CODE,
      },
      summary: 'Rahul Sharma marked ₹1240 paid to Priya with a Pay me link. Not right? Delete the payment.',
    })
  })
  it('mentions the screenshot and falls back to Other without a method', () => {
    const p = planRecord(CODE, { ...paid, method: undefined, proofPath: `payproofs/${CODE}/p.jpg` }, group, '2026-10-09', NOW, fmt)
    expect(p.kind === 'record' && p.settlement.note).toBe(`${PAY_LINK_NOTE}, with a screenshot`)
    expect(p.kind === 'record' && p.settlement.method).toBe('Other')
  })
  it('a link without a group only tells the payee', () => {
    expect(planRecord(CODE, { ...paid, groupId: undefined, tableCode: 'TBL23456' }, undefined, '2026-10-09', NOW, fmt)).toEqual({
      kind: 'notify',
      payeeUid: 'u_priya',
    })
  })
  it('records nothing when the group or the people changed', () => {
    expect(planRecord(CODE, paid, null, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'no_group' })
    expect(planRecord(CODE, { ...paid, from: 'm_gone' }, group, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'not_member' })
    expect(planRecord(CODE, { ...paid, createdBy: 'u_rahul' }, group, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'not_payee' })
    expect(planRecord(CODE, paid, { ...group, memberUids: ['u_rahul'] }, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'not_payee' })
    expect(planRecord(CODE, { ...paid, amount: 12.5 }, group, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'bad_amount' })
    expect(planRecord(CODE, paid, { ...group, currency: 'AUD' }, 'd', NOW, fmt)).toEqual({ kind: 'skip', reason: 'currency' })
  })
})

describe('table links the host confirms', () => {
  it('only a live table link not locked to one guest waits for the host', () => {
    expect(needsHostConfirm({ tableCode: 'TBL23456' })).toBe(true)
    expect(needsHostConfirm({ tableCode: 'TBL23456', forUid: 'anon1' })).toBe(false)
    expect(needsHostConfirm({})).toBe(false)
  })
  it('"I’ve paid" claims those, and pays the rest; a member’s own settlement is always paid', () => {
    expect(claimStatus({ tableCode: 'T' }, {})).toBe('claimed')
    expect(claimStatus({ tableCode: 'T' }, { settlementId: 's_1' })).toBe('paid')
    expect(claimStatus({ tableCode: 'T', forUid: 'a' }, {})).toBe('paid')
    expect(claimStatus({}, { method: 'UPI' })).toBe('paid')
  })
  it('the claim patch carries the same fields with status claimed', () => {
    expect(markPaidPatch(CODE, { method: 'UPI' }, 'anon1', NOW, 'claimed')).toEqual({ status: 'claimed', paidAt: NOW, paidBy: 'anon1', method: 'UPI' })
    expect(() => markPaidPatch(CODE, { settlementId: 's' }, 'u', NOW, 'claimed')).toThrow()
  })
  it('the group line names both people and that it waits', () => {
    expect(claimSummary(link, fmt)).toBe('Rahul says they’ve paid ₹1240 to Priya. Waiting for them to confirm.')
  })
})

describe('trigger decision (no flag involved: a claim is always honoured)', () => {
  const open = link
  const claimed: PayLinkDoc = { ...link, tableCode: 'T', status: 'claimed', paidAt: NOW, paidBy: 'anon1' }
  it('records on → paid from open or from claimed (the host confirming)', () => {
    expect(triggerAction(open, { ...open, status: 'paid' })).toBe('record')
    expect(triggerAction(claimed, { ...claimed, status: 'paid' })).toBe('record')
  })
  it('tells the host on open → claimed, and does nothing on a dismiss or a cancel', () => {
    expect(triggerAction({ ...open, tableCode: 'T' }, claimed)).toBe('claimed')
    expect(triggerAction(claimed, { ...open, tableCode: 'T' })).toBeNull()
    expect(triggerAction(open, { ...open, status: 'cancelled' })).toBeNull()
    expect(triggerAction(claimed, { ...claimed, status: 'paid', recordedAt: 1 })).toBeNull()
  })
  it('claimed stays claimed after the expiry date (the host can still confirm)', () => {
    expect(payLinkState(claimed, link.expiresAt + 1)).toBe('claimed')
    expect(canMarkPaid(claimed, NOW, 'anon2')).toBe(false)
  })
})
