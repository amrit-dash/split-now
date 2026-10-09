/**
 * Rules for the phase-2 features: the merchant → category memory (users/{uid}/settings/merchants)
 * and the activity-type whitelist (`settlement.nudged` is the nudge callable's alone).
 * Run with: npm run test:rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1',
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['alice', 'bob'],
  members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, bob: { name: 'Bob', uid: 'bob', color: '#111' } },
  inviteCode: 'ABCD2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
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

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore())
const path = 'users/alice/settings/merchants'
const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`shop${i}`, 'shopping']))
const manyTouched = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`shop${i}`, i]))

describe('merchant memory (settings/merchants)', () => {
  const memory = { categories: { 'blue tokai': 'food', swiggy: 'food' }, touched: { 'blue tokai': 1, swiggy: 2 }, updatedAt: 3 }
  it('the owner writes and reads it', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), path), memory))
    await assertSucceeds(setDoc(doc(db('alice'), path), { categories: {}, touched: {}, updatedAt: 4 }))
    await assertSucceeds(getDoc(doc(db('alice'), path)))
  })
  it('only the two maps and a timestamp, each map at most 200 entries', async () => {
    await assertFails(setDoc(doc(db('alice'), path), { ...memory, extra: 1 }))
    await assertFails(setDoc(doc(db('alice'), path), { touched: {}, updatedAt: 1 }))
    await assertFails(setDoc(doc(db('alice'), path), { categories: 'food', touched: {}, updatedAt: 1 }))
    await assertFails(setDoc(doc(db('alice'), path), { categories: {}, touched: [], updatedAt: 1 }))
    await assertFails(setDoc(doc(db('alice'), path), { categories: {}, touched: {}, updatedAt: 'now' }))
    await assertSucceeds(setDoc(doc(db('alice'), path), { categories: many(200), touched: manyTouched(200), updatedAt: 1 }))
    await assertFails(setDoc(doc(db('alice'), path), { categories: many(201), touched: manyTouched(201), updatedAt: 1 }))
  })
  it('nobody else can read or write it', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), memory))
    await assertFails(getDoc(doc(db('bob'), path)))
    await assertFails(setDoc(doc(db('bob'), path), memory))
    await assertFails(getDoc(doc(db(), path)))
  })
})

describe('activity types', () => {
  const entry = (type: string) => ({ type, actorUid: 'bob', actorName: 'Bob', targetId: 'x', summary: 'Bob did a thing', createdAt: 2 })
  it('members write the kinds the app produces', async () => {
    for (const t of ['expense.created', 'expense.updated', 'expense.imported', 'settlement.created', 'member.removed'])
      await assertSucceeds(setDoc(doc(db('bob'), `groups/g1/activity/${t}`), entry(t)))
  })
  it('a client can neither invent a kind nor fake a nudge', async () => {
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a1'), entry('settlement.nudged')))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a2'), entry('expense.exploded')))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/activity/a3'), { ...entry('expense.created'), type: 42 }))
  })
  it('members read nudge entries the server wrote', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1/activity/n1'), { ...entry('settlement.nudged'), actorUid: 'alice' }))
    await assertSucceeds(getDoc(doc(db('bob'), 'groups/g1/activity/n1')))
    await assertFails(getDoc(doc(db('mallory'), 'groups/g1/activity/n1')))
  })
})
