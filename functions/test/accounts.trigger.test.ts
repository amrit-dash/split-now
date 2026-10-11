/**
 * One account per person (functions/src/accounts.ts) in the emulators: adding another email with
 * Firebase's sign-in link, a guest who signs in to an existing account, and merging an account
 * whose email was proved with a link. Accounts live in the Auth emulator, so this runs in the
 * trigger pass (npm run test:functions starts Firestore, Functions and Auth together).
 */
import { createHash } from 'node:crypto'
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

/** A password account (or, without an email, a guest) in the Auth emulator, with its ID token. */
async function account(email?: string, verified = false): Promise<Account> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(email ? { email, password: 'secret123', returnSecureToken: true } : { returnSecureToken: true }),
  })
  const { localId, idToken } = (await r.json()) as { localId: string; idToken: string }
  if (!verified) return { uid: localId, token: idToken }
  await authAdmin('accounts:update', { localId, emailVerified: true })
  // A fresh token carries email_verified.
  const s = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  })
  return { uid: localId, token: ((await s.json()) as { idToken: string }).idToken }
}
async function authAdmin(path: string, body: object) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  return r.json() as Promise<{ users?: Array<{ localId: string; emailVerified?: boolean; disabled?: boolean }> }>
}
const lookup = async (uid: string) => (await authAdmin('accounts:lookup', { localId: [uid] })).users?.[0]

async function call<T>(name: string, data: unknown, as: Account): Promise<{ result?: T; error?: { status: string; message: string } }> {
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
const read = (path: string) => admin(async (db) => (await getDoc(doc(db, path))).data() ?? {})
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const group = (over: object) => ({
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('adding an email with Firebase’s sign-in link (emulator)', () => {
  // Opening the link signs in to that address in a side session; its ID token is the proof. Here a
  // freshly made, verified account for the address stands in for that session.
  it('a brand-new account the link made: the email joins this one, it is deleted, a waiting group is linked', async () => {
    const me = await account('link.add@x.com', true)
    await admin(async (db) => {
      await setDoc(
        doc(db, 'groups/acc_add'),
        group({
          memberUids: ['someone'],
          createdBy: 'someone',
          members: { o: { name: 'O', uid: 'someone' }, p1: { name: 'Asha', email: 'asha@work.example' } },
        }),
      )
      await setDoc(doc(db, `emailInvites/${sha('asha@work.example')}`), { entries: { acc_add__p1: { groupId: 'acc_add', memberId: 'p1', at: 1 } } })
    })
    const proof = await account('asha@work.example', true)
    const r = await call<{ added: boolean; linked: number }>('claimEmail', { token: proof.token }, me)
    expect(r.result).toEqual({ added: true, linked: 1 })
    expect(await lookup(proof.uid)).toBeUndefined()
    expect((await read(`emailIndex/${sha('asha@work.example')}`)).uid).toBe(me.uid)
    const list = (await read(`users/${me.uid}/account/emails`)).list as Record<string, { email: string }>
    expect(Object.values(list).map((e) => e.email)).toEqual(['asha@work.example'])
    const g = await read('groups/acc_add')
    expect((g.members as Record<string, { uid?: string }>).p1.uid).toBe(me.uid)
    expect(g.memberUids).toContain(me.uid)
  })

  it('an address that is a real account of its own is offered as a merge, not taken', async () => {
    const me = await account('link.keeper@x.com', true)
    const other = await account('link.other@x.com', true)
    await admin((db) =>
      setDoc(doc(db, 'groups/acc_other'), group({ memberUids: [other.uid], createdBy: other.uid, members: { o: { name: 'Other', uid: other.uid } } })),
    )
    const r = await call<{ otherAccount: { groups: number } }>('claimEmail', { token: other.token }, me)
    expect(r.result?.otherAccount.groups).toBe(1)
    expect(await lookup(other.uid)).toBeDefined()
    expect((await read(`pendingMerges/${me.uid}`)).uid).toBe(other.uid)
  })

  it('an unverified token, or your own address, adds nothing', async () => {
    const me = await account('link.self@x.com', true)
    const unverified = await account('link.unverified@x.com')
    expect((await call('claimEmail', { token: unverified.token }, me)).error?.status).toBe('PERMISSION_DENIED')
    expect((await call<{ already: boolean }>('claimEmail', { token: me.token }, me)).result).toEqual({ already: true })
  })
})

describe('guests and second accounts move into the account that stays (emulator)', () => {
  it('a guest who signs in to an existing account: their locked Pay me link’s group entry gets the account', async () => {
    const guest = await account()
    const me = await account('guest.adopt@x.com', true)
    await admin(async (db) => {
      await setDoc(
        doc(db, 'groups/acc_guest'),
        group({ memberUids: ['host'], createdBy: 'host', members: { h: { name: 'Host', uid: 'host' }, p_g: { name: 'Gran' } } }),
      )
      await setDoc(doc(db, 'payLinks/guestlinkcode000000000'), {
        groupId: 'acc_guest',
        from: 'p_g',
        to: 'h',
        amount: 250,
        currency: 'INR',
        forUid: guest.uid,
        createdBy: 'host',
        status: 'open',
        createdAt: 1,
      })
    })
    const r = await call<{ linked: number }>('adoptGuest', { guestToken: guest.token }, me)
    expect(r.result?.linked).toBe(1)
    const g = await read('groups/acc_guest')
    expect((g.members as Record<string, { uid?: string }>).p_g.uid).toBe(me.uid)
    expect(g.memberUids).toContain(me.uid)
    expect((await read('payLinks/guestlinkcode000000000')).forUid).toBe(me.uid)
    expect(await lookup(guest.uid)).toBeUndefined()
  })

  it('a real account’s token is not a guest', async () => {
    const other = await account('not.guest@x.com', true)
    const me = await account('adopter@x.com', true)
    const r = await call('adoptGuest', { guestToken: other.token }, me)
    expect(r.error?.status).toBe('PERMISSION_DENIED')
  })

  it('merging a proved account moves its groups; where both were in, a merge of the two entries is suggested', async () => {
    const me = await account('keeper@x.com', true)
    const old = await account('old.self@x.com', true)
    await admin(async (db) => {
      await setDoc(
        doc(db, 'groups/acc_m1'),
        group({
          memberUids: [old.uid, 'bob'],
          createdBy: old.uid,
          archivedBy: [old.uid],
          members: { [old.uid]: { name: 'Asha', uid: old.uid }, b: { name: 'Bob', uid: 'bob' } },
        }),
      )
      await setDoc(
        doc(db, 'groups/acc_m2'),
        group({ memberUids: [old.uid, me.uid], createdBy: me.uid, members: { o: { name: 'Asha old', uid: old.uid }, k: { name: 'Asha', uid: me.uid } } }),
      )
      await setDoc(doc(db, `groups/acc_m1/profiles/${old.uid}`), { displayName: 'Asha', payment: { upi: 'asha@okaxis' } })
      await setDoc(doc(db, `pendingMerges/${me.uid}`), { email: 'old.self@x.com', uid: old.uid, until: Date.now() + 600_000 })
    })
    const r = await call<{ groups: number; suggested: number }>('mergeAccount', {}, me)
    expect(r.result).toMatchObject({ groups: 2, suggested: 1 })
    const g1 = await read('groups/acc_m1')
    const m1 = (g1.members as Record<string, { uid?: string; formerUids?: string[] }>)[old.uid]
    expect(m1.uid).toBe(me.uid)
    expect(m1.formerUids).toEqual([old.uid])
    expect(g1.memberUids).toEqual(['bob', me.uid])
    expect(g1.createdBy).toBe(me.uid)
    expect(g1.archivedBy).toEqual([me.uid])
    expect((await read(`groups/acc_m1/profiles/${me.uid}`)).payment).toEqual({ upi: 'asha@okaxis' })
    const g2 = await read('groups/acc_m2')
    expect((g2.members as Record<string, { uid?: string }>).o.uid).toBeUndefined()
    expect(g2.memberUids).toEqual([me.uid])
    expect((await read('groups/acc_m2/mergeRequests/s_o__k')).status).toBe('suggested')
    expect((await lookup(old.uid))?.disabled).toBe(true)
    expect((await read(`emailIndex/${sha('old.self@x.com')}`)).uid).toBe(me.uid)
  })

  it('merging needs a proved address first', async () => {
    const me = await account('no.code@x.com', true)
    const r = await call('mergeAccount', {}, me)
    expect(r.error?.status).toBe('FAILED_PRECONDITION')
  })
})
