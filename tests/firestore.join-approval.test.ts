/**
 * "New people need my OK" (group.approveJoins): only the creator turns it on or off, nobody joins
 * such a group from its invite (old links included), and its join requests are the server's
 * (functions/src/join.ts), read by the asker and the creator alone.
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
  currency: 'INR',
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    p_x: { name: 'Placeholder', color: '#222' },
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
    await setDoc(doc(ctx.firestore(), 'groups/g1'), { ...group, approveJoins: true })
    await setDoc(doc(ctx.firestore(), 'groups/g2'), { ...group, id: 'g2', inviteCode: 'EFGH2345' })
  })
})
const db = (uid: string) => env.authenticatedContext(uid).firestore()

const join = (gid: string, code: string, who = 'carol') =>
  updateDoc(doc(db(who), `groups/${gid}`), {
    memberUids: ['alice', 'bob', who],
    'members.p_x': { name: 'Carol', uid: who, color: '#222' },
    joinCode: code,
    joinMemberId: 'p_x',
    updatedAt: 9,
  })

describe('new people need the creator’s OK', () => {
  it('nobody joins from the invite while it is on; with it off they do', async () => {
    await assertFails(join('g1', 'ABCD2345'))
    // a new entry instead of the placeholder: refused the same
    await assertFails(
      updateDoc(doc(db('carol'), 'groups/g1'), {
        memberUids: ['alice', 'bob', 'carol'],
        'members.carol': { name: 'Carol', uid: 'carol', color: '#333' },
        joinCode: 'ABCD2345',
        joinMemberId: 'carol',
        updatedAt: 9,
      }),
    )
    await assertSucceeds(join('g2', 'EFGH2345'))
  })
  it('turned off by the creator, the same invite works again', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { approveJoins: deleteField(), updatedAt: 2 }))
    await assertSucceeds(join('g1', 'ABCD2345'))
  })
  it('only the creator turns it on or off', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'groups/g2'), { approveJoins: true, updatedAt: 2 }))
    await assertFails(updateDoc(doc(db('bob'), 'groups/g1'), { approveJoins: false, updatedAt: 2 }))
    await assertFails(updateDoc(doc(db('bob'), 'groups/g1'), { approveJoins: deleteField(), updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g2'), { approveJoins: true, updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { approveJoins: false, updatedAt: 2 }))
    // other members still change the other settings of a group that has it on
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g2'), { name: 'Trip 2', updatedAt: 3 }))
    // and someone joining can't turn it off on the way in
    await assertFails(updateDoc(doc(db('carol'), 'groups/g2'), { approveJoins: false, updatedAt: 4 }))
  })
  it('is a yes or no, and a new group may start with it on', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { approveJoins: 'yes', updatedAt: 2 }))
    await assertSucceeds(
      setDoc(doc(db('alice'), 'groups/g3'), {
        ...group,
        id: 'g3',
        inviteCode: 'JKLM2345',
        memberUids: ['alice'],
        members: { alice: group.members.alice },
        approveJoins: true,
      }),
    )
  })
  it('requests to join are the server’s: read by the asker and the creator alone; the asker reads nothing else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1/joinRequests/carol'), { uid: 'carol', name: 'Carol', status: 'pending', createdAt: 1 })
    })
    await assertSucceeds(getDoc(doc(db('carol'), 'groups/g1/joinRequests/carol')))
    await assertSucceeds(getDoc(doc(db('alice'), 'groups/g1/joinRequests/carol')))
    await assertFails(getDoc(doc(db('bob'), 'groups/g1/joinRequests/carol')))
    await assertFails(getDoc(doc(db('dave'), 'groups/g1/joinRequests/carol')))
    await assertFails(getDoc(doc(db('carol'), 'groups/g1')))
    await assertFails(setDoc(doc(db('carol'), 'groups/g1/joinRequests/carol'), { uid: 'carol', name: 'Carol', status: 'approved', createdAt: 1 }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1/joinRequests/carol'), { status: 'approved' }))
  })
  it('its invite may say so, as a yes or no', async () => {
    await assertSucceeds(
      setDoc(doc(db('alice'), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', placeholders: { p_x: 'Placeholder' }, approveJoins: true }),
    )
    await assertFails(setDoc(doc(db('alice'), 'invites/ABCD2345'), { groupId: 'g1', groupName: 'Trip', emoji: '🏝️', approveJoins: 'yes' }))
  })
})
