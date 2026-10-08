/**
 * Storage rules for profile photos (avatars/{uid}/{file}). Run with: npm run test:rules
 * (needs the storage emulator alongside firestore).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearStorage())

const jpeg = (n = 1024) => new Uint8Array(n)
const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
/** UploadTask is thenable but not a Promise; adopt it so assertSucceeds/assertFails type-check. */
const put = (uid: string | undefined, path: string, bytes = jpeg(), contentType = 'image/jpeg') =>
  Promise.resolve(st(uid).ref(path).put(bytes, { contentType }))

describe('avatars', () => {
  it('only the owner can upload, as an image under 2 MB', async () => {
    await assertSucceeds(put('alice', 'avatars/alice/a.jpg'))
    await assertFails(put('bob', 'avatars/alice/b.jpg'))
    await assertFails(put(undefined, 'avatars/alice/c.jpg'))
    await assertFails(put('alice', 'avatars/alice/d.txt', jpeg(), 'text/plain'))
    await assertFails(put('alice', 'avatars/alice/e.jpg', jpeg(2 * 1024 * 1024 + 1)))
  })
  it('any signed-in user can read; signed-out cannot; only the owner deletes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('avatars/alice/a.jpg').put(jpeg(), { contentType: 'image/jpeg' })
    })
    await assertSucceeds(st('bob').ref('avatars/alice/a.jpg').getMetadata())
    await assertFails(st().ref('avatars/alice/a.jpg').getMetadata())
    await assertFails(st('bob').ref('avatars/alice/a.jpg').delete())
    await assertSucceeds(st('alice').ref('avatars/alice/a.jpg').delete())
  })
})
