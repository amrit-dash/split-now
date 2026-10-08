/**
 * Rule tests for the Splitwise / CSV bulk import (repo.bulkImport): a fresh group plus
 * full 450-write batches of expenses and settlements must pass. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, writeBatch } from 'firebase/firestore'

/** The compat Firestore handed out by the rules harness (not the modular `Firestore`, which the helper used to claim). */
type Db = ReturnType<RulesTestContext['firestore']>

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const members = {
  alice: { name: 'Alice', uid: 'alice', color: '#000' },
  p_bob: { name: 'Bob Smith', color: '#111' },
  p_cara: { name: 'Cara Lee', color: '#222' },
}
const newGroup = {
  id: 'gi', name: 'Imported', emoji: '🏝️', type: 'trip', currency: 'AUD', simplify: true,
  memberUids: ['alice'], members, inviteCode: 'IMPT2345', createdBy: 'alice', createdAt: 1, updatedAt: 1,
}

const expense = (i: number, extra: object = {}) => ({
  id: `e${i}`, groupId: 'gi', description: `Row ${i}`, amount: 9000, category: 'food', date: '2024-03-01',
  paidBy: { alice: 9000 }, splits: { alice: 3000, p_bob: 3000, p_cara: 3000 }, splitType: 'exact',
  splitInput: { exact: { alice: 3000, p_bob: 3000, p_cara: 3000 } }, createdBy: 'alice', createdAt: i, updatedAt: i,
  importedFrom: 'splitwise', ...extra,
})

async function createGroup(db: Db) {
  const b = writeBatch(db)
  b.set(doc(db, 'groups/gi'), newGroup)
  b.set(doc(db, 'invites/IMPT2345'), { groupId: 'gi', groupName: 'Imported', emoji: '🏝️', placeholders: { p_bob: 'Bob Smith', p_cara: 'Cara Lee' } })
  await b.commit()
}

describe('bulk import', () => {
  it('creates the group with placeholders, then a full batch of expenses + a group bump', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertSucceeds(createGroup(db))
    const b = writeBatch(db)
    for (let i = 0; i < 440; i++) b.set(doc(db, `groups/gi/expenses/e${i}`), expense(i))
    for (let i = 0; i < 9; i++) {
      b.set(doc(db, `groups/gi/settlements/s${i}`), { id: `s${i}`, groupId: 'gi', from: 'p_bob', to: 'alice', amount: 3000, method: 'Splitwise', date: '2024-03-05', createdBy: 'alice', createdAt: 1000 + i, importedFrom: 'splitwise' })
    }
    b.update(doc(db, 'groups/gi'), { updatedAt: 2 })
    await assertSucceeds(b.commit())
  })
  it('still rejects imported rows that reference non-members', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await createGroup(db)
    const b = writeBatch(db)
    b.set(doc(db, 'groups/gi/expenses/ok'), expense(1))
    b.set(doc(db, 'groups/gi/expenses/bad'), expense(2, { splits: { alice: 3000, p_bob: 3000, p_ghost: 3000 } }))
    await assertFails(b.commit())
  })
  it('a non-member cannot import into someone else’s group', async () => {
    await createGroup(env.authenticatedContext('alice').firestore())
    const db = env.authenticatedContext('mallory').firestore()
    const b = writeBatch(db)
    b.set(doc(db, 'groups/gi/expenses/e1'), expense(1, { createdBy: 'mallory' }))
    await assertFails(b.commit())
  })
})
