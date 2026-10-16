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
  it('a private group’s sealed name, emoji and people fit; a plain group keeps the short caps', async () => {
    const token = (n: number) => `v1:${'A'.repeat(n - 3)}`
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { name: token(200), emoji: token(80), updatedAt: 2 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { name: token(201), updatedAt: 3 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { emoji: token(81), updatedAt: 3 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g2'), { name: token(81), updatedAt: 3 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g2'), { emoji: token(17), updatedAt: 3 }))
    // one's own name in the group, sealed: up to 200 in a private group, 100 elsewhere
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1'), { 'members.bob.name': token(200), memberOpId: 'bob', updatedAt: 4 }))
    await assertFails(updateDoc(doc(db('bob'), 'groups/g2'), { 'members.bob.name': token(150), memberOpId: 'bob', updatedAt: 4 }))
    // and one's photo link, sealed: a token only in a private group, an https link anywhere
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1'), { 'members.bob.photoURL': token(300), memberOpId: 'bob', updatedAt: 5 }))
    await assertFails(updateDoc(doc(db('bob'), 'groups/g2'), { 'members.bob.photoURL': token(300), memberOpId: 'bob', updatedAt: 5 }))
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g2'), { 'members.bob.photoURL': 'https://lh3.example/b.jpg', memberOpId: 'bob', updatedAt: 5 }))
  })
  it('nobody joins a private group from its invite; a plain group still takes them', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, vault: true, members: { ...group.members, p_x: { name: 'Placeholder', color: '#222' } } })
      await setDoc(doc(ctx.firestore(), 'groups/g2'), { ...group, id: 'g2', members: { ...group.members, p_x: { name: 'Placeholder', color: '#222' } } })
    })
    const join = (gid: string) =>
      updateDoc(doc(db('carol'), `groups/${gid}`), {
        memberUids: ['alice', 'bob', 'carol'],
        'members.p_x': { name: 'Carol', uid: 'carol', color: '#222' },
        joinCode: 'ABCD2345',
        joinMemberId: 'p_x',
        updatedAt: 9,
      })
    await assertFails(join('g1'))
    await assertSucceeds(join('g2'))
  })
  it('in a private group only its creator adds people', async () => {
    const add = (who: string, gid: string) =>
      updateDoc(doc(db(who), `groups/${gid}`), { 'members.p_new': { name: 'New', color: '#333' }, memberOpId: 'p_new', updatedAt: 10 })
    await assertFails(add('bob', 'g1'))
    await assertSucceeds(add('alice', 'g1'))
    await assertSucceeds(add('bob', 'g2'))
  })
  it('requests to join are the server’s: read by the asker and the creator alone', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1/joinRequests/carol'), { uid: 'carol', name: 'v1:x', status: 'pending', createdAt: 1 })
    })
    await assertSucceeds(getDoc(doc(db('carol'), 'groups/g1/joinRequests/carol')))
    await assertSucceeds(getDoc(doc(db('alice'), 'groups/g1/joinRequests/carol')))
    await assertFails(getDoc(doc(db('bob'), 'groups/g1/joinRequests/carol')))
    await assertFails(setDoc(doc(db('carol'), 'groups/g1/joinRequests/carol'), { uid: 'carol', name: 'x', status: 'approved', createdAt: 1 }))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/joinRequests/carol'), { uid: 'carol', name: 'x', status: 'approved', createdAt: 1 }))
  })
  it('a private group’s invite may say so', async () => {
    await assertSucceeds(
      setDoc(doc(db('alice'), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'A private group', emoji: '🔒', placeholders: {}, vault: true }),
    )
    await assertFails(setDoc(doc(db('alice'), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'A private group', vault: 'yes' }))
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
