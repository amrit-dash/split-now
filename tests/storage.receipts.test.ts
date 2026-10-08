/**
 * Storage rules for receipt images (receipts/{groupId}/{file}). Membership comes from a
 * cross-service lookup of groups/{groupId}.memberUids in Firestore, so this needs both
 * emulators: npm run test:rules (firestore + storage).
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
      name: 'Goa',
      emoji: '🏖️',
      type: 'trip',
      currency: 'INR',
      simplify: true,
      memberUids: ['alice', 'bob'],
      members: { alice: { name: 'Alice', uid: 'alice', color: '#000' }, bob: { name: 'Bob', uid: 'bob', color: '#111' } },
      inviteCode: 'GOA23456',
      createdBy: 'alice',
      createdAt: 1,
      updatedAt: 1,
    }),
  )
})

const img = (n = 1024) => new Uint8Array(n)
const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
/** UploadTask is thenable but not a Promise; adopt it so assertSucceeds/assertFails type-check. */
const put = (uid: string | undefined, path: string, bytes = img(), contentType = 'image/jpeg') => Promise.resolve(st(uid).ref(path).put(bytes, { contentType }))
const seed = (path: string) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(path).put(img(), { contentType: 'image/jpeg' })
  })

describe('receipts/{groupId}', () => {
  it('members upload photos under 10 MB into an existing group', async () => {
    await assertSucceeds(put('alice', 'receipts/g1/r.jpg'))
    await assertSucceeds(put('bob', 'receipts/g1/r.png', img(), 'image/png'))
    await assertSucceeds(put('bob', 'receipts/g1/r.webp', img(), 'image/webp'))
    await assertSucceeds(put('alice', 'receipts/g1/r.heic', img(), 'image/heic'))
    await assertSucceeds(put('alice', 'receipts/g1/big-but-ok.jpg', img(10 * 1024 * 1024 - 1)))
  })
  it('outsiders, signed-out users and unknown groups are refused', async () => {
    await assertFails(put('carol', 'receipts/g1/r2.jpg')) // not in memberUids
    await assertFails(put(undefined, 'receipts/g1/r3.jpg')) // signed out
    await assertFails(put('alice', 'receipts/missing/r.jpg')) // firestore.get on a group that does not exist
  })
  it('only images, and under 10 MB', async () => {
    await assertFails(put('alice', 'receipts/g1/r.pdf', img(), 'application/pdf'))
    await assertFails(put('alice', 'receipts/g1/r.txt', img(), 'text/plain'))
    await assertFails(put('alice', 'receipts/g1/big.jpg', img(10 * 1024 * 1024)))
  })
  it('rejects image types that are not photos (the rule lists jpeg, png, webp, heic, heif)', async () => {
    await assertFails(put('alice', 'receipts/g1/r.svg', img(), 'image/svg+xml'))
    await assertFails(put('alice', 'receipts/g1/r.gif', img(), 'image/gif'))
  })
  it('members read and delete; outsiders cannot; overwriting an existing receipt is not allowed', async () => {
    await seed('receipts/g1/r.jpg')
    await assertSucceeds(st('bob').ref('receipts/g1/r.jpg').getMetadata())
    await assertFails(st('carol').ref('receipts/g1/r.jpg').getMetadata())
    await assertFails(st().ref('receipts/g1/r.jpg').getMetadata())
    await assertFails(put('alice', 'receipts/g1/r.jpg')) // rules allow create and delete, never update
    await assertFails(st('carol').ref('receipts/g1/r.jpg').delete())
    await assertSucceeds(st('bob').ref('receipts/g1/r.jpg').delete())
  })
  it('a member of one group cannot touch another group’s receipts', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'groups/g2'), {
        id: 'g2',
        name: 'Flat',
        emoji: '🏠',
        type: 'home',
        currency: 'INR',
        simplify: false,
        memberUids: ['carol'],
        members: { carol: { name: 'Carol', uid: 'carol', color: '#222' } },
        inviteCode: 'FLAT2345',
        createdBy: 'carol',
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    await seed('receipts/g2/r.jpg')
    await assertFails(put('alice', 'receipts/g2/x.jpg'))
    await assertFails(st('alice').ref('receipts/g2/r.jpg').getMetadata())
    await assertFails(st('alice').ref('receipts/g2/r.jpg').delete())
    await assertSucceeds(st('carol').ref('receipts/g2/r.jpg').getMetadata())
  })
  it('nothing outside receipts/ and avatars/ is reachable', async () => {
    await assertFails(put('alice', 'other/g1/x.jpg'))
    await assertFails(put('alice', 'receipts.jpg'))
    await assertFails(st('alice').ref('other/g1/x.jpg').getMetadata())
  })
})
