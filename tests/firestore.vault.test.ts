/**
 * Private groups (docs/VAULT.md): `vault` is chosen when the group is made and never changes,
 * and the sealed data key in vaultKeys/{groupId} is out of every client's reach.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'AUD',
  simplify: true,
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
  },
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
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, vault: true })
    await setDoc(doc(ctx.firestore(), 'groups/g2'), { ...group, id: 'g2' })
    await setDoc(doc(ctx.firestore(), 'vaultKeys/g1'), { wrapped: { v: 1, iv: 'x', ct: 'y', tag: 'z' }, pattern: { salt: 's', hash: 'h' } })
  })
})
const db = (uid: string) => env.authenticatedContext(uid).firestore()

describe('private groups', () => {
  it('a group can be made private when it is created', async () => {
    await assertSucceeds(
      setDoc(doc(db('alice'), 'groups/g3'), { ...group, id: 'g3', memberUids: ['alice'], members: { alice: group.members.alice }, vault: true }),
    )
    await assertFails(
      setDoc(doc(db('alice'), 'groups/g4'), { ...group, id: 'g4', memberUids: ['alice'], members: { alice: group.members.alice }, vault: 'yes' }),
    )
  })
  it('and never changes after that, either way', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { vault: false, updatedAt: 2 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { vault: deleteField(), updatedAt: 2 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g2'), { vault: true, updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { name: 'Secret trip', updatedAt: 2 }))
  })
  it('its sealed key is out of reach, even for its members', async () => {
    await assertFails(getDoc(doc(db('alice'), 'vaultKeys/g1')))
    await assertFails(setDoc(doc(db('alice'), 'vaultKeys/g1'), { pattern: { salt: 'a', hash: 'b' } }))
    await assertFails(setDoc(doc(db('bob'), 'vaultKeys/g2'), { pattern: { salt: 'a', hash: 'b' } }))
  })
  it('passkeys live in the server-only secrets', async () => {
    await assertFails(getDoc(doc(db('alice'), 'users/alice/secrets/passkeys')))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/secrets/passkeys'), { credentials: [] }))
    // the universal pattern's hash and the wrong tries, too: no one may read, reset or forge them
    await assertFails(getDoc(doc(db('alice'), 'users/alice/secrets/vault')))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/secrets/vault'), { tries: {} }))
  })
})
