/**
 * Delete my account (functions/src/delete-account.ts) in the emulators: the plan it shows first,
 * what stops it, and what it does. The account lives in the Auth emulator, so this runs in the
 * trigger pass (npm run test:functions starts Firestore, Functions and Auth together).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const AUTH = 'http://127.0.0.1:9099'
const PROJECT = 'demo-splitit'
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`

interface Account {
  uid: string
  token: string
}

/** A password account in the Auth emulator, just signed in (so auth_time is now). */
async function account(email: string): Promise<Account> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  })
  const { localId, idToken } = (await r.json()) as { localId: string; idToken: string }
  return { uid: localId, token: idToken }
}
const lookup = async (uid: string) => {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: [uid] }),
  })
  return ((await r.json()) as { users?: unknown[] }).users?.[0]
}

async function call<T>(data: unknown, as: Account): Promise<{ result?: T; error?: { status: string; message: string } }> {
  const res = await fetch(`${FN}/deleteAccount`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${as.token}` },
    body: JSON.stringify({ data }),
  })
  return (await res.json()) as { result?: T; error?: { status: string; message: string } }
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
const read = (path: string) => admin(async (db) => (await getDoc(doc(db, path))).data())

const group = (over: object) => ({ name: 'Goa', emoji: '🏖️', type: 'trip', currency: 'INR', createdAt: 1, updatedAt: 1, ...over })

type Plan = { steps: Array<{ kind: string; groupId: string; newCreator?: string }>; blockers: Array<{ groupId: string; reason: string }>; admin: boolean }

describe('deleteAccount (emulator)', () => {
  it('shows the plan, refuses while money is owed, then leaves shared groups, deletes the rest and the sign-in', async () => {
    const me = await account('leaving@x.com')
    const other = 'friend_uid'
    await admin(async (db) => {
      await setDoc(doc(db, `users/${me.uid}`), { name: 'Leah' })
      await setDoc(doc(db, `users/${me.uid}/captures/c1`), { amount: 100 })
      await setDoc(doc(db, 'groups/del_wallet'), group({ type: 'personal', memberUids: [me.uid], createdBy: me.uid, members: { a: { name: 'Leah', uid: me.uid } } }))
      await setDoc(
        doc(db, 'groups/del_shared'),
        group({
          memberUids: [me.uid, other],
          createdBy: me.uid,
          archivedBy: [me.uid],
          members: { a: { name: 'Leah', uid: me.uid, email: 'leaving@x.com', color: '#123456' }, b: { name: 'Fran', uid: other } },
        }),
      )
      await setDoc(doc(db, `groups/del_shared/profiles/${me.uid}`), { upiId: 'leah@upi' })
      // Fran paid ₹600 for both of them: Leah owes ₹300.
      await setDoc(doc(db, 'groups/del_shared/expenses/e1'), { description: 'Dinner', amount: 60000, paidBy: { b: 60000 }, splits: { a: 30000, b: 30000 }, createdAt: 1 })
      await setDoc(doc(db, 'captureTokens/tok_leaving_0123456789abcdef'), { uid: me.uid, createdAt: 1 })
      await setDoc(doc(db, 'payLinks/PAYLEAH1'), { createdBy: me.uid, groupId: 'del_shared', status: 'open' })
    })

    const plan = (await call<Plan>({}, me)).result
    expect(plan?.admin).toBe(false)
    expect(plan?.blockers).toEqual([{ groupId: 'del_shared', reason: 'unsettled', owes: true, amount: 30000 }])
    expect(plan?.steps).toEqual([{ kind: 'delete', groupId: 'del_wallet', why: 'wallet' }])
    expect((await call({ confirm: true }, me)).error?.status).toBe('FAILED_PRECONDITION')
    expect(await read('groups/del_wallet')).toBeDefined()

    // Settled up: now it can go.
    await admin((db) => setDoc(doc(db, 'groups/del_shared/settlements/s1'), { from: 'a', to: 'b', amount: 30000, createdAt: 2 }))
    expect((await call<Plan>({}, me)).result?.steps).toContainEqual({ kind: 'leave', groupId: 'del_shared', memberId: 'a', newCreator: other })
    expect((await call({ confirm: true }, me)).result).toEqual({ deleted: true })

    const shared = await read('groups/del_shared')
    expect(shared?.members.a).toEqual({ name: 'Deleted account', removedAt: expect.any(Number), color: '#123456' })
    expect(shared?.members.b).toEqual({ name: 'Fran', uid: other })
    expect(shared?.memberUids).toEqual([other])
    expect(shared?.archivedBy).toEqual([])
    expect(shared?.createdBy).toBe(other)
    expect(await read(`groups/del_shared/profiles/${me.uid}`)).toBeUndefined()
    expect(await read('groups/del_shared/expenses/e1')).toBeDefined()
    expect(await read('groups/del_wallet')).toBeUndefined()
    expect(await read(`users/${me.uid}`)).toBeUndefined()
    expect(await read(`users/${me.uid}/captures/c1`)).toBeUndefined()
    expect(await read('captureTokens/tok_leaving_0123456789abcdef')).toBeUndefined()
    expect(await read('payLinks/PAYLEAH1')).toBeUndefined()
    expect(await lookup(me.uid)).toBeUndefined()
  })

  it('an admin is asked to remove their admin access first', async () => {
    const me = await account('boss.leaving@x.com')
    await admin((db) => setDoc(doc(db, `admins/${me.uid}`), { by: 'console' }))
    expect((await call<Plan>({}, me)).result?.admin).toBe(true)
    expect((await call({ confirm: true }, me)).error?.status).toBe('FAILED_PRECONDITION')
    expect(await lookup(me.uid)).toBeDefined()
  })
})
