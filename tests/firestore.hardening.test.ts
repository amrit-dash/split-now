/**
 * Rule tests for membership integrity, invites, per-group profiles and expense/settlement
 * validation. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group; bob has joined; p_cat is a placeholder.
const group = {
  id: 'g1', name: 'Trip', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: true,
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    p_cat: { name: 'Cat', color: '#222' },
  },
  inviteCode: 'ABCD2345', createdBy: 'alice', createdAt: 1, updatedAt: 1,
}
const invite = { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_cat: 'Cat' } }

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
    await setDoc(doc(ctx.firestore(), 'invites/ABCD2345'), invite)
    await setDoc(doc(ctx.firestore(), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: { payid: 'bob@x' } })
  })
})

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore())
const g1 = (uid: string) => doc(db(uid), 'groups/g1')

describe('membership changes by members', () => {
  it('a member can still edit settings', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { name: 'Renamed', budget: 5000, updatedAt: 2 }))
    await assertSucceeds(updateDoc(g1('bob'), { budget: deleteField() }))
  })
  it('can add a placeholder member', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.p_dan': { name: 'Dan', color: '#333' }, memberOpId: 'p_dan', updatedAt: 2 }))
  })
  it('cannot add a member without naming it in memberOpId', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.p_dan': { name: 'Dan', color: '#333' }, updatedAt: 2 }))
  })
  it('cannot add two members in one write', async () => {
    await assertFails(updateDoc(g1('bob'), {
      'members.p_dan': { name: 'Dan', color: '#333' }, 'members.p_eve': { name: 'Eve', color: '#444' }, memberOpId: 'p_dan',
    }))
  })
  it('cannot add a member entry carrying a uid (no impersonation / duplicates)', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.a_fake': { name: 'Alice', uid: 'alice', color: '#000' }, memberOpId: 'a_fake' }))
    await assertFails(updateDoc(g1('bob'), { 'members.p_dan': { name: 'Dan', uid: 'dan', color: '#333' }, memberOpId: 'p_dan' }))
  })
  it('cannot add uids to memberUids', async () => {
    await assertFails(updateDoc(g1('bob'), { memberUids: arrayUnion('mallory') }))
  })
  it('cannot reassign or edit an existing member', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.alice.uid': 'bob', memberOpId: 'alice' }))
    await assertFails(updateDoc(g1('bob'), { 'members.p_cat': { name: 'Cat', uid: 'bob', color: '#222' }, memberOpId: 'p_cat' }))
    await assertFails(updateDoc(g1('bob'), { 'members.alice.name': 'Hacked', memberOpId: 'alice' }))
  })
  it('cannot rewrite the whole members map', async () => {
    await assertFails(updateDoc(g1('bob'), { members: { bob: group.members.bob }, memberUids: ['bob'] }))
  })
  it('can remove a placeholder', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.p_cat': deleteField(), memberOpId: 'p_cat', updatedAt: 2 }))
  })
  it('a non-creator cannot remove another joined member', async () => {
    await assertFails(updateDoc(g1('bob'), { 'members.alice': deleteField(), memberUids: arrayRemove('alice'), memberOpId: 'alice' }))
    await assertFails(updateDoc(g1('bob'), { memberUids: arrayRemove('alice') }))
  })
  it('a member can leave (remove themselves)', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { 'members.bob': deleteField(), memberUids: arrayRemove('bob'), memberOpId: 'bob' }))
  })
  it('the creator can remove a joined member, but must drop their uid too', async () => {
    await assertFails(updateDoc(g1('alice'), { 'members.bob': deleteField(), memberOpId: 'bob' }))
    await assertSucceeds(updateDoc(g1('alice'), { 'members.bob': deleteField(), memberUids: arrayRemove('bob'), memberOpId: 'bob' }))
  })
})

describe('group shape and settings', () => {
  it('rejects unknown keys, oversized strings, unknown types and bad currencies', async () => {
    await assertFails(updateDoc(g1('bob'), { junk: 'x'.repeat(10) }))
    await assertFails(updateDoc(g1('bob'), { name: 'x'.repeat(81) }))
    await assertFails(updateDoc(g1('bob'), { name: '' }))
    await assertFails(updateDoc(g1('bob'), { type: 'banana' }))
    await assertFails(updateDoc(g1('bob'), { currency: 'rupees' }))
    await assertFails(updateDoc(g1('bob'), { budget: 'lots' }))
    await assertFails(updateDoc(g1('bob'), { startDate: '7 Oct' }))
    await assertSucceeds(updateDoc(g1('bob'), { type: 'outing', currency: 'INR', budget: 500000, startDate: '2026-10-05', endDate: '2026-10-10', updatedAt: 2 }))
  })
  it('any member may archive and unarchive; it must be a boolean', async () => {
    await assertSucceeds(updateDoc(g1('bob'), { archived: true, updatedAt: 2 }))
    await assertSucceeds(updateDoc(g1('alice'), { archived: false, updatedAt: 3 }))
    await assertFails(updateDoc(g1('bob'), { archived: 'yes' }))
  })
  it('only the creator changes the approval policy', async () => {
    await assertFails(updateDoc(g1('bob'), { requireApproval: true, approvalThreshold: 5000 }))
    await assertSucceeds(updateDoc(g1('alice'), { requireApproval: true, approvalThreshold: 5000, updatedAt: 2 }))
    await assertFails(updateDoc(g1('bob'), { requireApproval: false }))
    await assertFails(updateDoc(g1('bob'), { approvalThreshold: 1_000_000_000 }))
    await assertSucceeds(updateDoc(g1('bob'), { name: 'Still editable', updatedAt: 3 }))
    await assertSucceeds(updateDoc(g1('alice'), { requireApproval: deleteField(), approvalThreshold: deleteField(), updatedAt: 4 }))
  })
  it('caps the members map and memberUids at 60 on create', async () => {
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`p${i}`, { name: `P${i}`, color: '#000' }]))
    await assertFails(setDoc(doc(db('carol'), 'groups/big'), { ...group, id: 'big', memberUids: ['carol'], members: { carol: { name: 'C', uid: 'carol', color: '#000' }, ...many }, createdBy: 'carol' }))
    const fewer = Object.fromEntries(Array.from({ length: 58 }, (_, i) => [`p${i}`, { name: `P${i}`, color: '#000' }]))
    await assertSucceeds(setDoc(doc(db('carol'), 'groups/ok'), { ...group, id: 'ok', memberUids: ['carol'], members: { carol: { name: 'C', uid: 'carol', color: '#000' }, ...fewer }, createdBy: 'carol' }))
  })
})

describe('leaving a group', () => {
  it('the whole leave batch commits: group update, invite tidy-up, profile delete and the activity entry', async () => {
    const d = db('bob')
    const b = writeBatch(d)
    b.set(doc(d, 'groups/g1/activity/leave1'), { type: 'member.removed', actorUid: 'bob', actorName: 'Bob', targetId: 'bob', summary: 'Bob left the group', createdAt: 2 })
    b.update(doc(d, 'groups/g1'), { 'members.bob': deleteField(), memberUids: arrayRemove('bob'), memberOpId: 'bob', updatedAt: 2 })
    b.set(doc(d, 'invites/ABCD2345'), { groupId: 'g1', placeholders: { bob: deleteField() } }, { merge: true })
    b.delete(doc(d, 'groups/g1/profiles/bob'))
    await assertSucceeds(b.commit())
  })
  it('the leaver may only remove placeholders from the invite, never add or rename', async () => {
    const d = db('bob')
    const b = writeBatch(d)
    b.update(doc(d, 'groups/g1'), { 'members.bob': deleteField(), memberUids: arrayRemove('bob'), memberOpId: 'bob', updatedAt: 2 })
    b.set(doc(d, 'invites/ABCD2345'), { groupId: 'g1', placeholders: { p_cat: 'Hijacked' } }, { merge: true })
    await assertFails(b.commit())
    const b2 = writeBatch(d)
    b2.update(doc(d, 'groups/g1'), { 'members.bob': deleteField(), memberUids: arrayRemove('bob'), memberOpId: 'bob', updatedAt: 2 })
    b2.set(doc(d, 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Renamed' }, { merge: true })
    await assertFails(b2.commit())
  })
  it('a non-member cannot use the leaver path', async () => {
    await assertFails(setDoc(doc(db('mallory'), 'invites/ABCD2345'), { groupId: 'g1', placeholders: { p_cat: deleteField() } }, { merge: true }))
  })
})

describe('joining', () => {
  const join = (uid: string, memberId: string) =>
    updateDoc(doc(db(uid), 'groups/g1'), {
      memberUids: arrayUnion(uid), [`members.${memberId}`]: { name: 'X', uid, color: '#111' },
      joinCode: 'ABCD2345', joinMemberId: memberId, updatedAt: 2,
    })
  it('an existing member cannot join again (no duplicate entry)', async () => {
    await assertFails(join('bob', 'bob2'))
  })
  it('join + invite update + profile in one batch succeeds', async () => {
    const d = db('dan')
    const b = writeBatch(d)
    b.update(doc(d, 'groups/g1'), {
      memberUids: arrayUnion('dan'), 'members.p_cat': { name: 'Cat', uid: 'dan', color: '#222' },
      joinCode: 'ABCD2345', joinMemberId: 'p_cat', updatedAt: 2,
    })
    b.set(doc(d, 'invites/ABCD2345'), { groupId: 'g1', placeholders: { p_cat: deleteField() } }, { merge: true })
    b.set(doc(d, 'groups/g1/profiles/dan'), { displayName: 'Dan', payment: {} })
    await assertSucceeds(b.commit())
  })
  it('a non-member cannot touch the invite or write a profile without joining', async () => {
    await assertFails(setDoc(doc(db('mallory'), 'invites/ABCD2345'), { groupId: 'g1', placeholders: {} }, { merge: true }))
    await assertFails(setDoc(doc(db('mallory'), 'groups/g1/profiles/mallory'), { displayName: 'M' }))
  })
})

describe('invites', () => {
  it('cannot point an invite at a group whose code differs (hijack)', async () => {
    // mallory owns her own group g2 with a different code and tries to claim ABCD2345 / a new code
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g2'), { ...group, id: 'g2', memberUids: ['mallory'], createdBy: 'mallory', inviteCode: 'MALL0RY2' }))
    await assertFails(setDoc(doc(db('mallory'), 'invites/ABCD2345'), { ...invite, groupId: 'g2' }))
    await assertFails(setDoc(doc(db('mallory'), 'invites/NEWCODE9'), { ...invite, groupId: 'g2' }))
    await assertSucceeds(setDoc(doc(db('mallory'), 'invites/MALL0RY2'), { ...invite, groupId: 'g2' }))
  })
  it('a member cannot retarget their group’s invite at another group', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g2'), { ...group, id: 'g2', inviteCode: 'ABCD2345' }))
    await assertFails(updateDoc(doc(db('alice'), 'invites/ABCD2345'), { groupId: 'g2' }))
  })
  it('restricts invite keys', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'invites/ABCD2345'), invite))
    await assertFails(setDoc(doc(db('bob'), 'invites/ABCD2345'), { ...invite, createdBy: 'bob' }))
  })
  it('group + invite + profile created in one batch', async () => {
    const d = db('carol')
    const b = writeBatch(d)
    b.set(doc(d, 'groups/g3'), { ...group, id: 'g3', memberUids: ['carol'], members: { carol: { name: 'Carol', uid: 'carol', color: '#000' } }, createdBy: 'carol', inviteCode: 'CAROL234' })
    b.set(doc(d, 'invites/CAROL234'), { groupId: 'g3', groupName: 'Trip', emoji: '🏝️', placeholders: {} })
    b.set(doc(d, 'groups/g3/profiles/carol'), { displayName: 'Carol', payment: { payid: 'c@x' } })
    await assertSucceeds(b.commit())
  })
  it('cannot create a group that already includes other signed-up users', async () => {
    await assertFails(setDoc(doc(db('carol'), 'groups/g4'), { ...group, id: 'g4', memberUids: ['carol', 'alice'], createdBy: 'carol' }))
  })
  it('the creator deletes group and invite together', async () => {
    const d = db('alice')
    const b = writeBatch(d)
    b.delete(doc(d, 'groups/g1/profiles/bob'))
    b.delete(doc(d, 'invites/ABCD2345'))
    b.delete(doc(d, 'groups/g1'))
    await assertSucceeds(b.commit())
  })
  it('non-creators cannot delete the group', async () => {
    await assertFails(deleteDoc(doc(db('bob'), 'groups/g1')))
  })
})

describe('per-group profiles', () => {
  it('co-members can read; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'groups/g1/profiles/bob')))
    await assertFails(getDoc(doc(db('mallory'), 'groups/g1/profiles/bob')))
  })
  it('only the owner can write their handles', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: { payid: 'new@x' } }))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/profiles/bob'), { displayName: 'Bob', payment: { payid: 'alice-steals@x' } }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/profiles/bob'), { displayName: 'Bob', email: 'bob@x' }))
  })
  it('may carry an https profile photo URL', async () => {
    const r = doc(db('bob'), 'groups/g1/profiles/bob')
    await assertSucceeds(setDoc(r, { displayName: 'Bob', payment: {}, photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/avatars%2Fbob%2Fa.jpg?alt=media&token=t' }))
    await assertFails(setDoc(r, { displayName: 'Bob', payment: {}, photoURL: 'data:image/jpeg;base64,AAAA' }))
    await assertFails(setDoc(r, { displayName: 'Bob', payment: {}, photoURL: 'https://x/' + 'a'.repeat(2100) }))
    await assertFails(setDoc(r, { displayName: 'Bob', payment: {}, photoURL: 42 }))
    await assertFails(setDoc(r, { displayName: 'Bob', payment: {}, photoSource: 'upload' }))
  })
})

describe('expense & settlement validation', () => {
  const expense = {
    id: 'e1', groupId: 'g1', description: 'Dinner', amount: 900,
    paidBy: { alice: 900 }, splits: { alice: 300, bob: 300, p_cat: 300 }, createdBy: 'bob',
  }
  const e = (uid: string, id = 'e1') => doc(db(uid), `groups/g1/expenses/${id}`)
  it('createdBy must be the writer and cannot change', async () => {
    await assertSucceeds(setDoc(e('bob'), expense))
    await assertFails(setDoc(e('bob', 'e2'), { ...expense, id: 'e2', createdBy: 'alice' }))
    await assertFails(updateDoc(e('alice'), { createdBy: 'alice' }))
    await assertSucceeds(updateDoc(e('alice'), { description: 'Dinner!' }))
  })
  it('paidBy / splits must reference group members', async () => {
    await assertFails(setDoc(e('bob', 'e3'), { ...expense, id: 'e3', paidBy: { ghost: 900 } }))
    await assertFails(setDoc(e('bob', 'e4'), { ...expense, id: 'e4', splits: { alice: 450, ghost: 450 } }))
  })
  it('a receipt must be an https URL and a path inside this group’s folder', async () => {
    await assertSucceeds(setDoc(e('bob', 'r1'), { ...expense, id: 'r1', receiptUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2Fg1%2Fr1-bob.jpg?alt=media&token=t', receiptPath: 'receipts/g1/r1-bob.jpg' }))
    await assertFails(setDoc(e('bob', 'r2'), { ...expense, id: 'r2', receiptUrl: 'javascript:alert(1)' }))
    await assertFails(setDoc(e('bob', 'r3'), { ...expense, id: 'r3', receiptPath: 'avatars/alice/photo.jpg' }))
    await assertFails(setDoc(e('bob', 'r4'), { ...expense, id: 'r4', receiptPath: 'receipts/g2/r4.jpg' }))
    await assertFails(setDoc(e('bob', 'r5'), { ...expense, id: 'r5', receiptPath: 'receipts/g1/../avatars/x.jpg' }))
  })
  it('caps text fields and money maps', async () => {
    await assertFails(setDoc(e('bob', 't1'), { ...expense, id: 't1', description: 'x'.repeat(201) }))
    await assertFails(setDoc(e('bob', 't2'), { ...expense, id: 't2', notes: 'x'.repeat(2001) }))
    await assertFails(setDoc(e('bob', 't3'), { ...expense, id: 't3', description: 42 }))
    await assertSucceeds(setDoc(e('bob', 't4'), { ...expense, id: 't4', notes: 'Tip included' }))
    await assertFails(setDoc(e('bob', 't5'), { ...expense, id: 't5', paidBy: 'alice' }))
  })
  const st = { id: 's1', groupId: 'g1', from: 'bob', to: 'alice', amount: 500, method: 'Cash', date: '2026-01-01', createdBy: 'bob', createdAt: 1 }
  const s = (uid: string, id = 's1') => doc(db(uid), `groups/g1/settlements/${id}`)
  it('settlement parties must be members; author is the writer', async () => {
    await assertSucceeds(setDoc(s('bob'), st))
    await assertFails(setDoc(s('bob', 's2'), { ...st, id: 's2', to: 'ghost' }))
    await assertFails(setDoc(s('bob', 's3'), { ...st, id: 's3', from: 'ghost' }))
    await assertFails(setDoc(s('bob', 's4'), { ...st, id: 's4', createdBy: 'alice' }))
    await assertFails(updateDoc(s('alice'), { createdBy: 'alice' }))
  })
  it('settlement method and note are short strings', async () => {
    await assertSucceeds(setDoc(s('bob', 's5'), { ...st, id: 's5', method: 'waived', note: 'Rounded off the rest' }))
    await assertFails(setDoc(s('bob', 's6'), { ...st, id: 's6', method: 'x'.repeat(41) }))
    await assertFails(setDoc(s('bob', 's7'), { ...st, id: 's7', note: 'x'.repeat(501) }))
  })
})
