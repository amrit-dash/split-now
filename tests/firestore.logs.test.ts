/**
 * Error reports from phones for the admin's Logs tab (appErrors): filed by a signed-in person as
 * themselves, about now, short; never edited; read by admins only. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

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
    await setDoc(doc(ctx.firestore(), 'admins/boss'), { note: 'owner' })
    await setDoc(doc(ctx.firestore(), 'appErrors/old'), { uid: 'alice', at: 1, kind: 'crash', message: 'x' })
  })
})
const as = (uid: string) => env.authenticatedContext(uid).firestore()
const report = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  at: Date.now(),
  kind: 'crash',
  message: 'TypeError: x is undefined',
  stack: 'at Foo (GroupDetail.tsx:12)',
  route: '/groups/g1',
  version: '7.2.0',
  ua: 'Mozilla/5.0',
  mode: 'standalone',
  ...extra,
})

describe('app error reports', () => {
  it('a signed-in person files one as themselves', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'appErrors/a1'), report('alice')))
    await assertFails(setDoc(doc(as('alice'), 'appErrors/a2'), report('bob')))
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'appErrors/a3'), report('alice')))
  })
  it('only short fields, a known kind, stamped about now', async () => {
    await assertFails(setDoc(doc(as('alice'), 'appErrors/b1'), report('alice', { message: 'x'.repeat(501) })))
    await assertFails(setDoc(doc(as('alice'), 'appErrors/b2'), report('alice', { kind: 'other' })))
    // a voice problem (src/hooks/useVoice.ts): its own kind
    await assertSucceeds(
      setDoc(doc(as('alice'), 'appErrors/b6'), report('alice', { kind: 'voice', message: 'voice mic: NotReadableError | engine=ai perm=granted' })),
    )
    await assertFails(setDoc(doc(as('alice'), 'appErrors/b3'), report('alice', { at: 5 })))
    await assertFails(setDoc(doc(as('alice'), 'appErrors/b4'), report('alice', { extra: 1 })))
    await assertFails(setDoc(doc(as('alice'), 'appErrors/b5'), report('alice', { stack: 'x'.repeat(3001) })))
  })
  it('never edited or removed by anyone, read by admins only', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'appErrors/old'), { message: 'y' }))
    await assertFails(deleteDoc(doc(as('boss'), 'appErrors/old')))
    await assertFails(getDocs(collection(as('alice'), 'appErrors')))
    await assertSucceeds(getDocs(collection(as('boss'), 'appErrors')))
  })
})
