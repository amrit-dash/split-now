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

describe('avatars', () => {
  it('only the owner can upload, as an image under 2 MB', async () => {
    await assertSucceeds(st('alice').ref('avatars/alice/a.jpg').put(jpeg(), { contentType: 'image/jpeg' }))
    await assertFails(st('bob').ref('avatars/alice/b.jpg').put(jpeg(), { contentType: 'image/jpeg' }))
    await assertFails(st().ref('avatars/alice/c.jpg').put(jpeg(), { contentType: 'image/jpeg' }))
    await assertFails(st('alice').ref('avatars/alice/d.txt').put(jpeg(), { contentType: 'text/plain' }))
    await assertFails(st('alice').ref('avatars/alice/e.jpg').put(jpeg(2 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }))
  })
  it('any signed-in user can read; signed-out cannot; only the owner deletes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.storage().ref('avatars/alice/a.jpg').put(jpeg(), { contentType: 'image/jpeg' }) })
    await assertSucceeds(st('bob').ref('avatars/alice/a.jpg').getMetadata())
    await assertFails(st().ref('avatars/alice/a.jpg').getMetadata())
    await assertFails(st('bob').ref('avatars/alice/a.jpg').delete())
    await assertSucceeds(st('alice').ref('avatars/alice/a.jpg').delete())
  })
})
