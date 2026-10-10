/**
 * Storage rules for payment screenshots attached in Settle up (settleproofs/{groupId}/{file}),
 * read by the payee and the server's AI check. Needs both emulators: npm run test:rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'groups/g1'), {
      id: 'g1',
      name: 'Flat',
      emoji: '🏠',
      type: 'home',
      currency: 'INR',
      simplify: true,
      memberUids: ['alice', 'bob'],
      members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, bob: { name: 'Bob', uid: 'bob', color: '#111' } },
      inviteCode: 'FLAT2345',
      createdBy: 'alice',
      createdAt: 1,
      updatedAt: 1,
    }),
  )
})

const img = (n = 1024) => new Uint8Array(n)
const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
const put = (uid: string | undefined, path: string, bytes = img(), contentType = 'image/jpeg') => Promise.resolve(st(uid).ref(path).put(bytes, { contentType }))

describe('settleproofs/{groupId}', () => {
  it('members upload a JPEG under 5 MB, named after the payment', async () => {
    await assertSucceeds(put('bob', 'settleproofs/g1/s_abc123.jpg'))
    await assertSucceeds(put('alice', 'settleproofs/g1/s_big.jpg', img(5 * 1024 * 1024 - 1)))
  })
  it('refuses other types, sizes and names, outsiders, and overwriting', async () => {
    await assertFails(put('bob', 'settleproofs/g1/s1.png', img(), 'image/png'))
    await assertFails(put('bob', 'settleproofs/g1/s1.jpg', img(5 * 1024 * 1024)))
    await assertFails(put('bob', 'settleproofs/g1/../s1.jpg'))
    await assertFails(put('bob', 'settleproofs/g1/s 1.jpg'))
    await assertFails(put('carol', 'settleproofs/g1/s2.jpg'))
    await assertFails(put(undefined, 'settleproofs/g1/s3.jpg'))
    await assertSucceeds(put('bob', 'settleproofs/g1/s4.jpg'))
    await assertFails(put('alice', 'settleproofs/g1/s4.jpg'))
  })
  it('members read and delete; outsiders can’t', async () => {
    await assertSucceeds(put('bob', 'settleproofs/g1/s5.jpg'))
    await assertSucceeds(Promise.resolve(st('alice').ref('settleproofs/g1/s5.jpg').getMetadata()))
    await assertFails(Promise.resolve(st('carol').ref('settleproofs/g1/s5.jpg').getMetadata()))
    await assertFails(Promise.resolve(st('carol').ref('settleproofs/g1/s5.jpg').delete()))
    await assertSucceeds(Promise.resolve(st('alice').ref('settleproofs/g1/s5.jpg').delete()))
  })
})
