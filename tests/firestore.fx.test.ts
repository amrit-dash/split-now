/**
 * Rule tests for multi-currency expenses (the optional `original` amount + locked FX rate).
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1', name: 'Bali', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: true,
  memberUids: ['alice'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, p_bob: { name: 'Bob', color: '#111' } },
  inviteCode: 'ABC234', createdBy: 'alice', createdAt: 1, updatedAt: 1,
}
// ฿1,200.00 at 0.04269 → A$51.23, split in AUD.
const original = { currency: 'THB', amount: 120000, rate: 0.04269, rateDate: '2026-10-07', source: 'ecb' }
const expense = {
  id: 'e1', groupId: 'g1', description: 'Nasi goreng', amount: 5123, paidBy: { alice: 5123 }, splits: { alice: 2562, p_bob: 2561 },
  createdBy: 'alice', original,
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1'), group))
})

const e = (id = 'e1') => doc(env.authenticatedContext('alice').firestore(), `groups/g1/expenses/${id}`)
const withOriginal = (o: Record<string, unknown>) => ({ ...expense, original: { ...original, ...o } })

describe('expense.original', () => {
  it('is optional', async () => {
    const { original: _, ...plain } = expense
    await assertSucceeds(setDoc(e(), plain))
  })
  it('accepts a valid ECB or manual rate', async () => {
    await assertSucceeds(setDoc(e(), expense))
    await assertSucceeds(setDoc(e('e2'), withOriginal({ source: 'manual', rate: 25 }))) // integer rate is a number too
  })
  it('requires a 3-letter currency', async () => {
    await assertFails(setDoc(e(), withOriginal({ currency: 'TH' })))
    await assertFails(setDoc(e(), withOriginal({ currency: 'BAHT' })))
    await assertFails(setDoc(e(), withOriginal({ currency: 764 })))
  })
  it('requires a positive integer amount', async () => {
    await assertFails(setDoc(e(), withOriginal({ amount: 0 })))
    await assertFails(setDoc(e(), withOriginal({ amount: -100 })))
    await assertFails(setDoc(e(), withOriginal({ amount: 1200.5 })))
    await assertFails(setDoc(e(), withOriginal({ amount: '120000' })))
  })
  it('requires a positive numeric rate', async () => {
    await assertFails(setDoc(e(), withOriginal({ rate: 0 })))
    await assertFails(setDoc(e(), withOriginal({ rate: -0.04 })))
    await assertFails(setDoc(e(), withOriginal({ rate: '0.04269' })))
  })
  it('requires rateDate and a known source, and no extra keys', async () => {
    const { rateDate: _, ...noDate } = original
    await assertFails(setDoc(e(), { ...expense, original: noDate }))
    await assertFails(setDoc(e(), withOriginal({ source: 'guess' })))
    await assertFails(setDoc(e(), withOriginal({ note: 'x' })))
    await assertFails(setDoc(e(), { ...expense, original: 'THB 1200' }))
  })
  it('is validated on update too, and can be removed', async () => {
    await assertSucceeds(setDoc(e(), expense))
    await assertFails(updateDoc(e(), { 'original.rate': -1 }))
    await assertSucceeds(updateDoc(e(), { 'original.rate': 0.0425, 'original.source': 'manual', amount: 5100, paidBy: { alice: 5100 }, splits: { alice: 2550, p_bob: 2550 } }))
    await assertSucceeds(updateDoc(e(), { original: deleteField() }))
  })
})
