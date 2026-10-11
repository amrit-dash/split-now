/**
 * Two entries that are one person become one (functions/src/merge-members.ts) in the emulators:
 * money moves, a payment between the two goes, and a group that needs its creator's OK waits for
 * it. Runs in the trigger pass (Auth emulator for real ID tokens): npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const AUTH = 'http://127.0.0.1:9099'
const PROJECT = 'demo-splitit'
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`

async function account(email: string): Promise<{ uid: string; token: string }> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  })
  const { localId, idToken } = (await r.json()) as { localId: string; idToken: string }
  return { uid: localId, token: idToken }
}
async function call<T>(name: string, data: unknown, as: { token: string }): Promise<{ result?: T; error?: { status: string; message: string } }> {
  const res = await fetch(`${FN}/${name}`, {
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
const list = (path: string) =>
  admin(async (db) => (await getDocs(collection(db, path))).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>))

async function seed(gid: string, alice: string, bob: string, over: object = {}) {
  await admin(async (db) => {
    await setDoc(doc(db, `groups/${gid}`), {
      name: 'Goa',
      emoji: '🏖️',
      type: 'trip',
      currency: 'INR',
      createdBy: alice,
      createdAt: 1,
      updatedAt: 1,
      memberUids: [alice, bob],
      members: {
        a: { name: 'Asha', uid: alice, color: '#000' },
        b: { name: 'Bob', uid: bob, color: '#111' },
        p: { name: 'Asha (work)', email: 'asha.merge@nowhere.example', color: '#222' },
      },
      ...over,
    })
    await setDoc(doc(db, `groups/${gid}/expenses/e1`), {
      groupId: gid,
      description: 'Cab',
      amount: 600,
      category: 'transport',
      date: '2026-10-10',
      paidBy: { p: 600 },
      splits: { p: 200, a: 200, b: 200 },
      splitType: 'equal',
      splitInput: { selected: ['p', 'a', 'b'] },
      createdBy: alice,
      createdAt: 1,
      updatedAt: 1,
    })
    await setDoc(doc(db, `groups/${gid}/settlements/s1`), { groupId: gid, from: 'p', to: 'a', amount: 200, date: '2026-10-10', createdBy: alice, createdAt: 1 })
    await setDoc(doc(db, `groups/${gid}/settlements/s2`), { groupId: gid, from: 'b', to: 'p', amount: 100, date: '2026-10-10', createdBy: bob, createdAt: 1 })
  })
}

describe('merging two people in a group (emulator)', () => {
  it('money moves to the one who stays and a payment between them goes', async () => {
    const alice = await account('merge.a1@x.com')
    const bob = await account('merge.b1@x.com')
    await seed('mg_1', alice.uid, bob.uid)
    // Picked the other way round: the entry with an account stays anyway.
    const r = await call<{ status: string; expenses: number; payments: number }>('mergeMembers', { groupId: 'mg_1', from: 'a', into: 'p' }, alice)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ status: 'done', expenses: 1, payments: 2 })
    const e = await read('groups/mg_1/expenses/e1')
    expect(e?.paidBy).toEqual({ a: 600 })
    expect(e?.splits).toEqual({ a: 400, b: 200 })
    expect(e?.splitInput).toEqual({ selected: ['a', 'b'] })
    const pays = await list('groups/mg_1/settlements')
    expect(pays.map((p) => p.id)).toEqual(['s2'])
    expect(pays[0]!.to).toBe('a')
    const g = await read('groups/mg_1')
    const m = g?.members as Record<string, { email?: string; mergedInto?: string; removedAt?: number }>
    expect(m.p!.mergedInto).toBe('a')
    expect(typeof m.p!.removedAt).toBe('number')
    expect(m.a!.email).toBe('asha.merge@nowhere.example')
    expect((await list('groups/mg_1/activity')).some((x) => x.type === 'member.merged')).toBe(true)
  })

  it('two accounts are never one entry; non-members can’t merge', async () => {
    const alice = await account('merge.a2@x.com')
    const bob = await account('merge.b2@x.com')
    const carol = await account('merge.c2@x.com')
    await seed('mg_2', alice.uid, bob.uid)
    expect((await call('mergeMembers', { groupId: 'mg_2', from: 'a', into: 'b' }, alice)).error?.status).toBe('FAILED_PRECONDITION')
    expect((await call('mergeMembers', { groupId: 'mg_2', from: 'p', into: 'a' }, carol)).error?.status).toBe('PERMISSION_DENIED')
  })

  it('with "needs my OK", someone else’s merge waits for the creator, who approves it', async () => {
    const alice = await account('merge.a3@x.com')
    const bob = await account('merge.b3@x.com')
    await seed('mg_3', alice.uid, bob.uid, { mergeNeedsOk: true })
    const asked = await call<{ status: string }>('mergeMembers', { groupId: 'mg_3', from: 'p', into: 'a' }, bob)
    expect(asked.result).toEqual({ status: 'pending' })
    const req = await read('groups/mg_3/mergeRequests/r_p__a')
    expect(req).toMatchObject({ from: 'p', into: 'a', status: 'pending', by: bob.uid, approverUid: alice.uid })
    const card = (await list('groups/mg_3/chat')).find((c) => c.kind === 'merge')
    expect(card).toMatchObject({ ref: 'r_p__a', mentions: ['a'], authorUid: bob.uid })
    expect((await read('groups/mg_3/expenses/e1'))?.paidBy).toEqual({ p: 600 })
    // Only the creator decides.
    expect((await call('decideMerge', { groupId: 'mg_3', requestId: 'r_p__a', approve: true }, bob)).error?.status).toBe('PERMISSION_DENIED')
    const ok = await call<{ status: string }>('decideMerge', { groupId: 'mg_3', requestId: 'r_p__a', approve: true }, alice)
    expect(ok.result?.status).toBe('done')
    expect((await read('groups/mg_3/expenses/e1'))?.paidBy).toEqual({ a: 600 })
    expect((await read('groups/mg_3/mergeRequests/r_p__a'))?.status).toBe('done')
  })

  it('merging onto someone with an account waits for them; onto yourself happens at once', async () => {
    const alice = await account('merge.a5@x.com')
    const bob = await account('merge.b5@x.com')
    await seed('mg_5', alice.uid, bob.uid)
    const asked = await call<{ status: string }>('mergeMembers', { groupId: 'mg_5', from: 'p', into: 'a' }, bob)
    expect(asked.result).toEqual({ status: 'pending' })
    expect((await read('groups/mg_5/mergeRequests/r_p__a'))?.approverUid).toBe(alice.uid)
    const own = await call<{ status: string }>('mergeMembers', { groupId: 'mg_5', from: 'p', into: 'b' }, bob)
    expect(own.result?.status).toBe('done')
    expect((await read('groups/mg_5/expenses/e1'))?.paidBy).toEqual({ b: 600 })
  })

  it('a suggestion can be dismissed by any member', async () => {
    const alice = await account('merge.a4@x.com')
    const bob = await account('merge.b4@x.com')
    await seed('mg_4', alice.uid, bob.uid)
    await admin((db) => setDoc(doc(db, 'groups/mg_4/mergeRequests/s_p__a'), { from: 'p', into: 'a', status: 'suggested', by: 'system', createdAt: 1 }))
    const r = await call<{ status: string }>('decideMerge', { groupId: 'mg_4', requestId: 's_p__a', approve: false }, bob)
    expect(r.result?.status).toBe('declined')
    expect((await read('groups/mg_4/expenses/e1'))?.paidBy).toEqual({ p: 600 })
  })
})
