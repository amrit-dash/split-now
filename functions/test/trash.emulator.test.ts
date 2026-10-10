/**
 * The daily purge of Recently deleted (functions/src/trash.ts purgeDue) against the Firestore
 * emulator: groups deleted 30 days ago go (with their invite), newer ones and live ones stay.
 * Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { purgeDue } from '../src/trash'

const DAY = 86_400_000
let env: RulesTestEnvironment

beforeAll(async () => {
  process.env.GCLOUD_PROJECT ??= 'demo-splitit'
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
const exists = (path: string) => admin(async (db) => (await getDoc(doc(db, path))).exists())
const group = (id: string, code: string, deletedAt?: number) => ({
  name: id,
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  memberUids: ['alice'],
  members: { a: { name: 'Alice', uid: 'alice' } },
  inviteCode: code,
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
  ...(deletedAt === undefined ? {} : { deletedAt, deletedBy: 'alice' }),
})

describe('purgeDue (emulator)', () => {
  it('removes groups whose 30 days are up, with their invite, and keeps the rest', async () => {
    await admin(async (db) => {
      await setDoc(doc(db, 'groups/old'), group('old', 'OLDCODE1', 0))
      await setDoc(doc(db, 'invites/OLDCODE1'), { groupId: 'old', groupName: 'old', emoji: '🏝️' })
      await setDoc(doc(db, 'groups/recent'), group('recent', 'RECENT01', 29 * DAY))
      await setDoc(doc(db, 'groups/live'), group('live', 'LIVECODE'))
    })
    const removed = await purgeDue(30 * DAY)
    expect(removed).toBe(1)
    expect(await exists('groups/old')).toBe(false)
    expect(await exists('invites/OLDCODE1')).toBe(false)
    expect(await exists('groups/recent')).toBe(true)
    expect(await exists('groups/live')).toBe(true)
  })
})
