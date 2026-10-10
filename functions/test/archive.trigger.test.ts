/**
 * Archiving is personal (shared/archive.ts), and a new expense or payment brings the group back
 * for the people it involves: onExpenseCreated / onSettlementCreated in the Functions emulator.
 * Run with: npm run test:functions (with both emulators together, so the triggers fire).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice, bob and carol; each test uses its own group id (a cleared database would set off
// onGroupDeleted for the previous test's group while the next one runs).
const group = (over: object) => ({
  name: 'Trip',
  emoji: '✈️',
  type: 'trip',
  currency: 'INR',
  memberUids: ['alice', 'bob', 'carol'],
  members: { m_a: { name: 'Alice', uid: 'alice' }, m_b: { name: 'Bob', uid: 'bob' }, m_c: { name: 'Carol', uid: 'carol' } },
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

async function admin<T>(fn: (db: ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>) => Promise<T>): Promise<T> {
  let out: T | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore())
  })
  return out as T
}

const read = (id: string) => admin(async (db) => (await getDoc(doc(db, `groups/${id}`))).data() ?? {})

/** The trigger runs asynchronously: wait until the group's archive state matches. */
async function until(id: string, ok: (g: Record<string, unknown>) => boolean) {
  for (let i = 0; i < 60; i++) {
    const g = await read(id)
    if (ok(g)) return g
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`group ${id} never got there: ${JSON.stringify(await read(id))}`)
}

const expense = { description: 'Dinner', amount: 900, currency: 'INR', date: '2026-10-10', category: 'food', createdBy: 'alice', createdAt: Date.now() }

describe('a new expense or payment unarchives the group for the people in it (emulator)', () => {
  it('an expense brings it back for the payer and the people with a share, not for anyone else', async () => {
    await admin((db) => setDoc(doc(db, 'groups/arc_a'), group({ archivedBy: ['alice', 'bob', 'carol'] })))
    await admin((db) => setDoc(doc(db, 'groups/arc_a/expenses/e1'), { ...expense, paidBy: { m_a: 900 }, splits: { m_a: 450, m_b: 450 }, splitType: 'equal' }))
    const g = await until('arc_a', (x) => !(x.archivedBy as string[]).includes('alice'))
    expect(g.archivedBy).toEqual(['carol'])
  })

  it('a payment brings it back for the two people in it', async () => {
    await admin((db) => setDoc(doc(db, 'groups/arc_b'), group({ archivedBy: ['bob', 'carol'] })))
    await admin((db) => setDoc(doc(db, 'groups/arc_b/settlements/s1'), { from: 'm_b', to: 'm_a', amount: 450, createdBy: 'bob', createdAt: Date.now() }))
    const g = await until('arc_b', (x) => !(x.archivedBy as string[]).includes('bob'))
    expect(g.archivedBy).toEqual(['carol'])
  })

  it('a group archived the old, group-wide way stays archived for everyone not involved', async () => {
    await admin((db) => setDoc(doc(db, 'groups/arc_c'), group({ archived: true })))
    await admin((db) => setDoc(doc(db, 'groups/arc_c/expenses/e1'), { ...expense, paidBy: { m_a: 900 }, splits: { m_a: 900 }, splitType: 'exact' }))
    const g = await until('arc_c', (x) => x.archived === undefined)
    expect((g.archivedBy as string[]).sort()).toEqual(['bob', 'carol'])
  })
})
