/**
 * One account per person (functions/src/accounts.ts) in the emulators: confirming an email with a
 * code, adding another email, a guest who signs in to an existing account, and merging an account
 * whose email was proved with a code. Accounts live in the Auth emulator, so this runs in the
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

/** A code waiting for `email`, as sendEmailCode leaves it (the emulator sends no mail). */
const seedCode = (uid: string, email: string, purpose: 'verify' | 'add', code = '123456') =>
  admin((db) =>
    setDoc(doc(db, `emailCodes/${uid}`), {
      email,
      purpose,
      salt: 's',
      hash: sha(`s:${code}`),
      expiresAt: Date.now() + 600_000,
      attempts: 0,
      sentAt: Date.now(),
    }),
  )

const group = (over: object) => ({
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('email codes (emulator)', () => {
  it('confirm an email-and-password account, and a wrong code counts as a try', async () => {
    const me = await account('code.verify@x.com')
    await seedCode(me.uid, 'code.verify@x.com', 'verify')
    const wrong = await call('confirmEmailCode', { email: 'code.verify@x.com', purpose: 'verify', code: '000000' }, me)
    expect(wrong.error?.message).toMatch(/isn’t right/)
    expect((await read(`emailCodes/${me.uid}`)).attempts).toBe(1)
    const ok = await call<{ verified: boolean }>('confirmEmailCode', { email: 'code.verify@x.com', purpose: 'verify', code: '123 456' }, me)
    expect(ok.result?.verified).toBe(true)
    expect((await lookup(me.uid))?.emailVerified).toBe(true)
    // Used once.
    const again = await call('confirmEmailCode', { email: 'code.verify@x.com', purpose: 'verify', code: '123456' }, me)
    expect(again.error).toBeDefined()
  })

  it('add another email: it joins the account and a group waiting for it is linked', async () => {
    const me = await account('code.add@x.com', true)
    await admin(async (db) => {
      await setDoc(
        doc(db, 'groups/acc_add'),
        group({ memberUids: ['someone'], createdBy: 'someone', members: { o: { name: 'O', uid: 'someone' }, p1: { name: 'Asha', email: 'asha@work.com' } } }),
      )
      await setDoc(doc(db, `emailInvites/${sha('asha@work.com')}`), { entries: { acc_add__p1: { groupId: 'acc_add', memberId: 'p1', at: 1 } } })
    })
    await seedCode(me.uid, 'asha@work.com', 'add')
    const r = await call<{ added: boolean; linked: number }>('confirmEmailCode', { email: 'asha@work.com', purpose: 'add', code: '123456' }, me)
    expect(r.result).toEqual({ added: true, linked: 1 })
    expect((await read(`emailIndex/${sha('asha@work.com')}`)).uid).toBe(me.uid)
    const list = (await read(`users/${me.uid}/account/emails`)).list as Record<string, { email: string }>
    expect(Object.values(list).map((e) => e.email)).toEqual(['asha@work.com'])
    const g = await read('groups/acc_add')
    expect((g.members as Record<string, { uid?: string }>).p1.uid).toBe(me.uid)
    expect(g.memberUids).toContain(me.uid)
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
      await setDoc(doc(db, `emailCodes/${me.uid}`), { merge: { email: 'old.self@x.com', uid: old.uid, until: Date.now() + 600_000 } })
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

  it('merging needs a code first', async () => {
    const me = await account('no.code@x.com', true)
    const r = await call('mergeAccount', {}, me)
    expect(r.error?.status).toBe('FAILED_PRECONDITION')
  })
})
