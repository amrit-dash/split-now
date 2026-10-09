/**
 * Rule tests for the shared exchange rates (fxRates/*), written only by Cloud Functions.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const rates = { date: '2026-10-07', base: 'EUR', rates: { EUR: 1, INR: 108.1165, USD: 1.1177 }, fetchedAt: 1_791_400_000_000, source: 'ecb' }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'fxRates/2026-10-07'), rates)
    await setDoc(doc(ctx.firestore(), 'fxRates/latest'), rates)
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
// Firebase anonymous sign-in (a guest at a live table)
const guest = () => env.authenticatedContext('guest1', { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const nobody = () => env.unauthenticatedContext().firestore()

describe('fxRates', () => {
  it('is readable by any signed-in user, anonymous included', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'fxRates/latest')))
    await assertSucceeds(getDoc(doc(alice(), 'fxRates/2026-10-07')))
    await assertSucceeds(getDoc(doc(guest(), 'fxRates/latest')))
    await assertSucceeds(getDocs(collection(guest(), 'fxRates')))
    await assertSucceeds(getDoc(doc(alice(), 'fxRates/2026-10-04'))) // a date not stored yet
  })
  it('is not readable signed out', async () => {
    await assertFails(getDoc(doc(nobody(), 'fxRates/latest')))
    await assertFails(getDocs(collection(nobody(), 'fxRates')))
  })
  it('cannot be written by any client', async () => {
    for (const db of [alice(), guest(), nobody()]) {
      await assertFails(setDoc(doc(db, 'fxRates/2026-10-08'), { ...rates, date: '2026-10-08' }))
      await assertFails(setDoc(doc(db, 'fxRates/latest'), { ...rates, rates: { EUR: 1, INR: 1 } }))
      await assertFails(updateDoc(doc(db, 'fxRates/latest'), { fetchedAt: 0 }))
      await assertFails(deleteDoc(doc(db, 'fxRates/2026-10-07')))
    }
  })
})
