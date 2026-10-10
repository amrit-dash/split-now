/**
 * Safe delete (shared/group-trash.ts): a group goes to Recently deleted (deletedAt, deletedBy)
 * instead of disappearing; any member may restore it; while deleted it's read-only and nobody
 * joins. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayUnion, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group; bob has joined; p_cat is a placeholder.
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
    p_cat: { name: 'Cat', color: '#222' },
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
    await setDoc(doc(ctx.firestore(), 'groups/g1'), group)
    await setDoc(doc(ctx.firestore(), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_cat: 'Cat' } })
  })
})

const g1 = (uid: string) => doc(env.authenticatedContext(uid).firestore(), 'groups/g1')
const asAdmin = (data: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'groups/g1'), data))
const deleted = { deletedAt: 5, deletedBy: 'alice' }
// carol claims the placeholder p_cat through the invite (isJoining)
const carolJoins = {
  memberUids: ['alice', 'bob', 'carol'],
  members: { ...group.members, p_cat: { name: 'Cat', color: '#222', uid: 'carol' } },
  joinCode: 'ABCD2345',
  joinMemberId: 'p_cat',
  updatedAt: 2,
}

describe('deleting a group moves it to Recently deleted', () => {
  it('the creator deletes it: deletedAt and deletedBy (themselves) only', async () => {
    await assertFails(updateDoc(g1('alice'), { deletedAt: 5, deletedBy: 'bob' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: 5, deletedBy: 'alice', name: 'Gone' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: 'now', deletedBy: 'alice' }))
    await assertSucceeds(updateDoc(g1('alice'), deleted))
  })

  it('another member can’t while the creator is in the group', async () => {
    await assertFails(updateDoc(g1('bob'), { deletedAt: 5, deletedBy: 'bob' }))
  })

  it('once the creator has left, any member can', async () => {
    await asAdmin({ memberUids: ['bob'] })
    await assertSucceeds(updateDoc(g1('bob'), { deletedAt: 5, deletedBy: 'bob' }))
  })

  it('(control) the same join that a deleted group refuses works on a live one', async () => {
    await assertSucceeds(updateDoc(doc(env.authenticatedContext('carol').firestore(), 'groups/g1'), carolJoins))
  })

  it('nobody sets deletedBy without deleting', async () => {
    await assertFails(updateDoc(g1('alice'), { deletedBy: 'alice' }))
  })
})

describe('a deleted group', () => {
  beforeEach(() => asAdmin(deleted))

  it('is still readable by its members', async () => {
    await assertSucceeds(getDoc(g1('bob')))
  })

  it('is read-only: no renames, archiving or anything else', async () => {
    await assertFails(updateDoc(g1('alice'), { name: 'Renamed' }))
    await assertFails(updateDoc(g1('bob'), { archivedBy: arrayUnion('bob') }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: 9 }))
  })

  it('any member restores it, by removing just the two fields', async () => {
    await assertFails(updateDoc(g1('bob'), { deletedAt: deleteField(), deletedBy: deleteField(), name: 'Back' }))
    await assertFails(updateDoc(g1('bob'), { deletedAt: deleteField() }))
    await assertSucceeds(updateDoc(g1('bob'), { deletedAt: deleteField(), deletedBy: deleteField() }))
  })

  it('nobody joins it through the invite', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext('carol').firestore(), 'groups/g1'), carolJoins))
  })

  it('only the creator removes it for good before the purge does', async () => {
    await assertFails(deleteDoc(g1('bob')))
    await assertSucceeds(deleteDoc(g1('alice')))
  })
})
