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
const deleted = { deletedAt: Date.now(), deletedBy: 'alice' }
const DAY = 86_400_000
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
    await assertFails(updateDoc(g1('alice'), { deletedAt: Date.now(), deletedBy: 'bob' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: Date.now(), deletedBy: 'alice', name: 'Gone' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: 'now', deletedBy: 'alice' }))
    await assertSucceeds(updateDoc(g1('alice'), deleted))
  })

  it('the delete date is the real time: not 0, not long ago, not in the future', async () => {
    // The hole: deletedAt 0 hid the group from Recently deleted and the purge took it that night.
    await assertFails(updateDoc(g1('alice'), { deletedAt: 0, deletedBy: 'alice' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: Date.now() - 3_600_000, deletedBy: 'alice' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: Date.now() + 3_600_000, deletedBy: 'alice' }))
    await assertFails(updateDoc(g1('alice'), { deletedAt: Date.now() + 100 * 86_400_000, deletedBy: 'alice' }))
  })

  it('another member can’t while the creator is in the group', async () => {
    await assertFails(updateDoc(g1('bob'), { deletedAt: Date.now(), deletedBy: 'bob' }))
  })

  it('once the creator has left, any member can', async () => {
    await asAdmin({ memberUids: ['bob'] })
    await assertSucceeds(updateDoc(g1('bob'), { deletedAt: Date.now(), deletedBy: 'bob' }))
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

  it('nothing inside it can be added or edited (the hole: only the group record was locked)', async () => {
    const ctx = env.authenticatedContext('bob').firestore()
    const expense = {
      id: 'e1',
      groupId: 'g1',
      description: 'Dinner',
      amount: 900,
      paidBy: { alice: 900 },
      splits: { alice: 300, bob: 300, p_cat: 300 },
      createdBy: 'bob',
    }
    await assertFails(setDoc(doc(ctx, 'groups/g1/expenses/e1'), expense))
    await assertFails(
      setDoc(doc(ctx, 'groups/g1/settlements/s1'), {
        id: 's1',
        groupId: 'g1',
        from: 'bob',
        to: 'alice',
        amount: 100,
        date: '2026-10-10',
        createdBy: 'bob',
        createdAt: 1,
      }),
    )
    await assertFails(
      setDoc(doc(ctx, 'groups/g1/activity/a1'), { type: 'expense.created', actorUid: 'bob', actorName: 'Bob', targetId: 'e1', summary: 'x', createdAt: 1 }),
    )
    await assertFails(setDoc(doc(ctx, 'groups/g1/profiles/bob'), { name: 'Bob' }))
  })

  it('(control) the same expense is accepted once it is restored', async () => {
    await asAdmin({ deletedAt: deleteField(), deletedBy: deleteField() })
    const ctx = env.authenticatedContext('bob').firestore()
    const expense = {
      id: 'e1',
      groupId: 'g1',
      description: 'Dinner',
      amount: 900,
      paidBy: { alice: 900 },
      splits: { alice: 300, bob: 300, p_cat: 300 },
      createdBy: 'bob',
    }
    await assertSucceeds(setDoc(doc(ctx, 'groups/g1/expenses/e1'), expense))
  })

  it('things already in it can still be removed, so Delete forever works once its first 7 days are over', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'groups/g1/expenses/e1'), { id: 'e1', groupId: 'g1', createdBy: 'bob', amount: 1 }))
    const e1 = (uid: string) => doc(env.authenticatedContext(uid).firestore(), 'groups/g1/expenses/e1')
    await assertFails(deleteDoc(e1('alice'))) // deleted just now
    await asAdmin({ deletedAt: Date.now() - 8 * DAY })
    await assertFails(deleteDoc(e1('bob'))) // only the creator empties it
    await assertSucceeds(deleteDoc(e1('alice')))
  })

  it('a member may leave it without restoring it, and change nothing else while leaving', async () => {
    const leave = { memberUids: ['alice'], 'members.bob.removedAt': Date.now(), memberOpId: 'bob', updatedAt: 9 }
    await assertFails(updateDoc(g1('bob'), { ...leave, name: 'Mine now' }))
    await assertFails(updateDoc(g1('bob'), { memberUids: ['bob'], 'members.alice.removedAt': Date.now(), memberOpId: 'alice', updatedAt: 9 }))
    await assertSucceeds(updateDoc(g1('bob'), leave))
  })

  it('only the creator removes it for good before the purge does, and not in its first 7 days', async () => {
    await assertFails(deleteDoc(g1('alice')))
    await asAdmin({ deletedAt: Date.now() - 6 * DAY })
    await assertFails(deleteDoc(g1('alice')))
    await asAdmin({ deletedAt: Date.now() - 8 * DAY })
    await assertFails(deleteDoc(g1('bob')))
    await assertSucceeds(deleteDoc(g1('alice')))
  })
})
