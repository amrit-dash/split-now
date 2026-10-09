/**
 * Rule tests for live table split (tables/{code}). Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const CODE = 'TBL23456'
const now = Date.now()
const table = {
  code: CODE,
  hostUid: 'host',
  merchant: 'Pho',
  currency: 'AUD',
  date: '2026-10-07',
  items: { a: { name: 'Pho', amount: 1800, pos: 0 }, b: { name: 'Beer', amount: 900, pos: 1 } },
  extras: { tax: 270, tip: 0, discount: 0 },
  participants: {
    host: { name: 'Hana', uid: 'host', joinedAt: now },
    ben: { name: 'Ben', uid: 'ben', joinedAt: now + 1 },
    p_nophone: { name: 'Gran', joinedAt: now + 2 },
  },
  claims: { host: { b: 1 }, ben: { a: 1 } },
  status: 'open',
  createdAt: now,
  expiresAt: now + 86_400_000,
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
    await setDoc(doc(ctx.firestore(), `tables/${CODE}`), table)
  })
})

// Guests use Firebase anonymous auth; rules only need a signed-in uid.
const db = (uid?: string) =>
  uid ? env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() : env.unauthenticatedContext().firestore()
const t = (uid?: string) => doc(db(uid), `tables/${CODE}`)
const seed = (data: object) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `tables/${CODE}`), { ...table, ...data }))

describe('reading', () => {
  it('anyone signed in (incl. anonymous) with the code can read an open table', async () => {
    await assertSucceeds(getDoc(t('stranger')))
  })
  it('signed-out users cannot', async () => {
    await assertFails(getDoc(t()))
  })
  it('expired or closed tables are readable only by the host and participants', async () => {
    await seed({ expiresAt: now - 1 })
    await assertFails(getDoc(t('stranger')))
    await assertSucceeds(getDoc(t('host')))
    await assertSucceeds(getDoc(t('ben')))
    await seed({ status: 'closed' })
    await assertFails(getDoc(t('stranger')))
    await assertSucceeds(getDoc(t('ben')))
  })
  it('a missing code reads as not-found (code collision check)', async () => {
    await assertSucceeds(getDoc(doc(db('host'), 'tables/NOPE2345')))
  })
})

describe('creating', () => {
  const fresh = (over: object = {}) => ({
    ...table,
    code: 'NEW23456',
    participants: { host: table.participants.host },
    claims: {},
    createdAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
    ...over,
  })
  it('the host can create an open table with themselves at it', async () => {
    await assertSucceeds(setDoc(doc(db('host'), 'tables/NEW23456'), fresh()))
  })
  it('cannot create for someone else, with a mismatched code, closed, or for longer than 24h', async () => {
    await assertFails(setDoc(doc(db('ben'), 'tables/NEW23456'), fresh()))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23456'), fresh({ code: 'OTHER234' })))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23456'), fresh({ status: 'closed' })))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23456'), fresh({ expiresAt: Date.now() + 3 * 86_400_000 })))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23456'), fresh({ evil: true })))
  })
  it('may say how tax and fees are shared: by items or equally, nothing else', async () => {
    await assertSucceeds(setDoc(doc(db('host'), 'tables/NEW23456'), fresh({ taxSplit: 'equal' })))
    await assertSucceeds(setDoc(doc(db('host'), 'tables/NEW23457'), { ...fresh({ taxSplit: 'items' }), code: 'NEW23457' }))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23458'), { ...fresh({ taxSplit: 'tip' }), code: 'NEW23458' }))
    await assertFails(setDoc(doc(db('host'), 'tables/NEW23459'), { ...fresh({ taxSplit: 1 }), code: 'NEW23459' }))
  })
  it('signed-out users cannot create', async () => {
    await assertFails(setDoc(doc(db(), 'tables/NEW23456'), fresh()))
  })
})

describe('guests', () => {
  it('can join with their own entry', async () => {
    await assertSucceeds(updateDoc(t('cleo'), { 'participants.cleo': { name: 'Cleo', uid: 'cleo', joinedAt: Date.now() } }))
  })
  it('cannot join as someone else or with a bad entry', async () => {
    await assertFails(updateDoc(t('cleo'), { 'participants.dan': { name: 'Dan', uid: 'dan', joinedAt: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: 'Cleo', uid: 'host', joinedAt: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: '', uid: 'cleo', joinedAt: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: 'x'.repeat(41), uid: 'cleo', joinedAt: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: 'Cleo', joinedAt: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: 'Cleo', uid: 'cleo', joinedAt: 1, admin: true } }))
  })
  it('can join and claim in one write, then change their own claims', async () => {
    await assertSucceeds(
      updateDoc(t('cleo'), {
        'participants.cleo': { name: 'Cleo', uid: 'cleo', joinedAt: 1 },
        'claims.cleo': { a: 1, b: 2 },
      }),
    )
    await assertSucceeds(updateDoc(t('ben'), { 'claims.ben': { b: 1 } }))
    await assertSucceeds(updateDoc(t('ben'), { 'claims.ben': {} }))
    await assertSucceeds(updateDoc(t('ben'), { 'claims.ben': deleteField() }))
  })
  it('can rename themselves', async () => {
    await assertSucceeds(updateDoc(t('ben'), { 'participants.ben': { name: 'Benjamin', uid: 'ben', joinedAt: 1 } }))
  })
  it('cannot claim without joining', async () => {
    await assertFails(updateDoc(t('cleo'), { 'claims.cleo': { a: 1 } }))
  })
  it('cannot claim items that do not exist', async () => {
    await assertFails(updateDoc(t('ben'), { 'claims.ben': { zz: 1 } }))
  })
  it('cannot touch other people’s claims or entries', async () => {
    await assertFails(updateDoc(t('ben'), { 'claims.host': {} }))
    await assertFails(updateDoc(t('ben'), { 'claims.p_nophone': { a: 1 } }))
    await assertFails(updateDoc(t('ben'), { 'participants.host': deleteField() }))
    await assertFails(updateDoc(t('ben'), { 'participants.host.name': 'Mallory' }))
  })
  it('cannot leave by deleting their entry (their claims would dangle)', async () => {
    await assertFails(updateDoc(t('ben'), { 'participants.ben': deleteField() }))
  })
  it('cannot change how tax and fees are shared', async () => {
    await assertFails(updateDoc(t('ben'), { taxSplit: 'equal' }))
  })
  it('cannot edit the bill, close it or change the host', async () => {
    await assertFails(updateDoc(t('ben'), { 'items.a.amount': 1 }))
    await assertFails(updateDoc(t('ben'), { extras: { tax: 0, tip: 0, discount: 5000 } }))
    await assertFails(updateDoc(t('ben'), { status: 'closed' }))
    await assertFails(updateDoc(t('ben'), { hostUid: 'ben' }))
    await assertFails(updateDoc(t('ben'), { expiresAt: now + 10 * 86_400_000 }))
  })
  it('cannot write once the table is closed or expired', async () => {
    await seed({ status: 'closed' })
    await assertFails(updateDoc(t('ben'), { 'claims.ben': { b: 1 } }))
    await seed({ expiresAt: now - 1 })
    await assertFails(updateDoc(t('ben'), { 'claims.ben': { b: 1 } }))
    await assertFails(updateDoc(t('cleo'), { 'participants.cleo': { name: 'Cleo', uid: 'cleo', joinedAt: 1 } }))
  })
  it('cannot delete', async () => {
    await assertFails(deleteDoc(t('ben')))
    await assertFails(deleteDoc(t('stranger')))
  })
  it('signed-out users cannot write', async () => {
    await assertFails(updateDoc(t(), { 'participants.x': { name: 'X', joinedAt: 1 } }))
  })
})

describe('host', () => {
  it('can edit items, extras and anyone’s claims, add people without phones and close', async () => {
    await assertSucceeds(updateDoc(t('host'), { 'items.c': { name: 'Rice', amount: 300, pos: 2 }, 'items.b': deleteField() }))
    await assertSucceeds(updateDoc(t('host'), { extras: { tax: 0, tip: 500, discount: 0 }, merchant: 'Pho Hung' }))
    await assertSucceeds(updateDoc(t('host'), { 'claims.p_nophone': { a: 1 }, 'claims.ben': { a: 2 } }))
    await assertSucceeds(updateDoc(t('host'), { 'participants.p_kid': { name: 'Kid', joinedAt: 1 } }))
    await assertSucceeds(updateDoc(t('host'), { 'participants.ben': deleteField(), 'claims.ben': deleteField() }))
    await assertSucceeds(updateDoc(t('host'), { status: 'closed', expenseId: 'e1', closedGroupId: 'g1' }))
  })
  it('can switch tax and fees between by items and equally, but not to anything else', async () => {
    await assertSucceeds(updateDoc(t('host'), { taxSplit: 'equal', extras: { tax: 270, tip: 300, discount: 0 } }))
    await assertSucceeds(updateDoc(t('host'), { taxSplit: 'items' }))
    await assertSucceeds(updateDoc(t('host'), { taxSplit: deleteField() }))
    await assertFails(updateDoc(t('host'), { taxSplit: 'random' }))
    await assertFails(updateDoc(t('host'), { taxSplit: null }))
  })
  it('can still edit after expiry (finishing late)', async () => {
    await seed({ expiresAt: now - 1 })
    await assertSucceeds(updateDoc(t('host'), { status: 'closed' }))
  })
  it('cannot hand the table over, change the code or extend it', async () => {
    await assertFails(updateDoc(t('host'), { hostUid: 'ben' }))
    await assertFails(updateDoc(t('host'), { code: 'OTHER234' }))
    await assertFails(updateDoc(t('host'), { expiresAt: now + 10 * 86_400_000 }))
    await assertFails(updateDoc(t('host'), { status: 'weird' }))
  })
  it('only the host can delete', async () => {
    await assertSucceeds(deleteDoc(t('host')))
  })
})
