/**
 * Someone added to a group by email gets the group when that email has a verified account:
 * onGroupMembersLink in the Functions emulator, with accounts in the Auth emulator.
 * Run with: npm run test:functions (the trigger pass starts Firestore, Functions and Auth).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const AUTH = 'http://127.0.0.1:9099'
const PROJECT = 'demo-splitit'

/** An account in the Auth emulator; `verified` marks its email as checked. */
async function account(email: string, verified: boolean): Promise<string> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  })
  const { localId } = (await r.json()) as { localId: string }
  if (verified)
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ localId, emailVerified: true }),
    })
  return localId
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
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
const settle = () => new Promise((r) => setTimeout(r, 2500))

const group = (members: Record<string, object>) => ({
  name: 'Bali trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  inviteCode: 'BALI2345',
  memberUids: ['asha'],
  members: { me: { name: 'Asha', uid: 'asha', email: 'asha@x.com' }, ...members },
  createdBy: 'asha',
  createdAt: 1,
  updatedAt: 1,
})

describe('people added by email are linked to their accounts (emulator)', () => {
  it('a verified account gets the group straight away; the invite spot closes', async () => {
    const priya = await account('priya.link@x.com', true)
    await admin(async (db) => {
      await setDoc(doc(db, 'invites/BALI2345'), { groupId: 'lk_1', groupName: 'Bali trip', placeholders: { p1: 'Priya' } })
      await setDoc(doc(db, 'groups/lk_1'), group({ p1: { name: 'Priya', email: 'Priya.Link@x.com' } }))
    })
    const g = await until('groups/lk_1', (d) => (d.memberUids as string[]).includes(priya))
    expect((g.members as Record<string, { uid?: string }>).p1.uid).toBe(priya)
    expect(((await read('invites/BALI2345')).placeholders as Record<string, string>).p1).toBeUndefined()
  })

  it('an unverified account is never linked; a name with no email stays a placeholder', async () => {
    await account('rahul.link@x.com', false)
    await admin((db) => setDoc(doc(db, 'groups/lk_2'), group({ p1: { name: 'Rahul', email: 'rahul.link@x.com' }, p2: { name: 'Sam' } })))
    await settle()
    const g = await read('groups/lk_2')
    expect(g.memberUids).toEqual(['asha'])
    expect((g.members as Record<string, { uid?: string }>).p1.uid).toBeUndefined()
  })

  it('someone added later by an edit is linked too', async () => {
    const dev = await account('dev.link@x.com', true)
    await admin((db) => setDoc(doc(db, 'groups/lk_3'), group({})))
    await admin((db) => updateDoc(doc(db, 'groups/lk_3'), { 'members.p9': { name: 'Dev', email: 'dev.link@x.com' } }))
    await until('groups/lk_3', (d) => (d.memberUids as string[]).includes(dev))
  })
})
