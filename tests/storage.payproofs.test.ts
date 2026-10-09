/**
 * Storage rules for Pay me link screenshots (payproofs/{code}/{file}). Whether a link is open,
 * who made it and which group it belongs to come from a Firestore lookup of payLinks/{code}, so
 * this needs both emulators: npm run test:rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const CODE = 'abcdefghijkmnpqrstuvwxyz'
const LOCKED = 'lockedlinklockedlink2345'

const link = (over: Record<string, unknown> = {}) => ({
  groupId: 'g1',
  groupName: 'Goa',
  from: 'mr',
  to: 'mp',
  amount: 124000,
  currency: 'INR',
  payeeName: 'Priya',
  payerName: 'Rahul',
  payment: { upi: 'priya@okaxis' },
  createdBy: 'priya',
  createdAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
  status: 'open',
  ...over,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'groups/g1'), {
      name: 'Goa',
      memberUids: ['priya', 'rahul'],
      members: { mp: { name: 'Priya', uid: 'priya', color: '#000' }, mr: { name: 'Rahul', uid: 'rahul', color: '#111' } },
      createdBy: 'priya',
    })
    await setDoc(doc(db, `payLinks/${CODE}`), link())
    await setDoc(doc(db, `payLinks/${LOCKED}`), link({ forUid: 'anon1' }))
  })
})

const img = (n = 1024) => new Uint8Array(n)
const anonSt = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).storage()
const userSt = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).storage()
const put = (st: ReturnType<typeof userSt>, path: string, bytes = img(), contentType = 'image/jpeg') =>
  Promise.resolve(st.ref(path).put(bytes, { contentType }))
const setLink = (data: object, code = CODE) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `payLinks/${code}`), data))
const seedFile = (path: string) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(path).put(img(), { contentType: 'image/jpeg' })
  })

describe('payproofs/{code}', () => {
  it('anyone with an open link, anonymous included, adds a JPEG under 5 MB', async () => {
    await assertSucceeds(put(anonSt('anon1'), `payproofs/${CODE}/p1.jpg`))
    await assertSucceeds(put(userSt('carol'), `payproofs/${CODE}/p2.jpg`, img(5 * 1024 * 1024 - 1)))
  })
  it('never over an existing file, never 5 MB or more, only JPEG named *.jpg', async () => {
    await seedFile(`payproofs/${CODE}/p1.jpg`)
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p1.jpg`))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/big.jpg`, img(5 * 1024 * 1024)))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p.png`, img(), 'image/png'))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p3.jpg`, img(), 'image/svg+xml'))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p 4.jpg`))
  })
  it('only while the link is open and unexpired, and the link must exist', async () => {
    await setLink(link({ status: 'paid', paidAt: 1, paidBy: 'anon1' }))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p1.jpg`))
    await setLink(link({ expiresAt: Date.now() - 1 }))
    await assertFails(put(anonSt('anon1'), `payproofs/${CODE}/p1.jpg`))
    await assertFails(put(anonSt('anon1'), 'payproofs/nosuchlinknosuchlink2345/p1.jpg'))
  })
  it('a table guest’s own link: only that guest; signed out never', async () => {
    await assertFails(put(anonSt('anon2'), `payproofs/${LOCKED}/p1.jpg`))
    await assertSucceeds(put(anonSt('anon1'), `payproofs/${LOCKED}/p1.jpg`))
    await assertFails(put(env.unauthenticatedContext().storage(), `payproofs/${CODE}/p9.jpg`))
  })
  it('the payee and the group’s members read it; the uploader and strangers do not', async () => {
    await seedFile(`payproofs/${CODE}/p1.jpg`)
    const read = (st: ReturnType<typeof userSt>) => st.ref(`payproofs/${CODE}/p1.jpg`).getMetadata()
    await assertSucceeds(read(userSt('priya')))
    await assertSucceeds(read(userSt('rahul')))
    await assertFails(read(userSt('carol')))
    await assertFails(read(anonSt('anon1')))
  })
  it('only the payee deletes', async () => {
    await seedFile(`payproofs/${CODE}/p1.jpg`)
    await assertFails(anonSt('anon1').ref(`payproofs/${CODE}/p1.jpg`).delete())
    await assertSucceeds(userSt('priya').ref(`payproofs/${CODE}/p1.jpg`).delete())
  })
})
