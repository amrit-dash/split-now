/**
 * A deleted group's open Pay me links go on hold, and a restore releases them (onGroupTrashed,
 * functions/src/trash.ts), in the Functions emulator. Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

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
const read = (path: string) => admin(async (db) => (await getDoc(doc(db, path))).data() ?? {})
async function until(path: string, ok: (d: Record<string, unknown>) => boolean) {
  for (let i = 0; i < 60; i++) {
    const d = await read(path)
    if (ok(d)) return d
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${path} never got there: ${JSON.stringify(await read(path))}`)
}

const CODE = 'heldlinkcodeabcdefghijk'
const group = {
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  memberUids: ['priya', 'rahul'],
  members: { mp: { name: 'Priya', uid: 'priya' }, mr: { name: 'Rahul', uid: 'rahul' } },
  createdBy: 'priya',
  createdAt: 1,
  updatedAt: 1,
}
const link = {
  groupId: 'held_g',
  groupName: 'Goa',
  from: 'mr',
  to: 'mp',
  amount: 1000,
  currency: 'INR',
  payeeName: 'Priya',
  payerName: 'Rahul',
  payment: {},
  createdBy: 'priya',
  createdAt: 1,
  expiresAt: Date.now() + 86_400_000,
  status: 'open',
}

describe('Pay me links follow their group into Recently deleted and back (emulator)', () => {
  it('holds the open links when the group is deleted, and releases them on restore', async () => {
    await admin((db) => setDoc(doc(db, 'groups/held_g'), group))
    await admin((db) => setDoc(doc(db, `payLinks/${CODE}`), link))
    await admin((db) => updateDoc(doc(db, 'groups/held_g'), { deletedAt: Date.now(), deletedBy: 'priya' }))
    await until(`payLinks/${CODE}`, (l) => l.held === true)
    await admin((db) => updateDoc(doc(db, 'groups/held_g'), { deletedAt: deleteField(), deletedBy: deleteField() }))
    const l = await until(`payLinks/${CODE}`, (x) => x.held === undefined)
    expect(l.status).toBe('open')
  })
})
