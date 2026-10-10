/**
 * Rule tests for Pay me links (payLinks/{code}) and their screenshots (payproofs/{code}/…).
 * Run with: npm run test:rules (firestore + storage emulators).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

let env: RulesTestEnvironment

const CODE = 'abcdefghijkmnpqrstuvwxyz'
const OTHER = 'zyxwvutsrqpnmkjihgfedcba'
const TABLE = 'TBL23456'
const now = Date.now()

const group = {
  id: 'g1',
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['priya', 'rahul'],
  members: {
    mp: { name: 'Priya', uid: 'priya', color: '#000' },
    mr: { name: 'Rahul', uid: 'rahul', color: '#111' },
    mx: { name: 'Gran', color: '#222' },
  },
  inviteCode: 'GOA23456',
  createdBy: 'priya',
  createdAt: 1,
  updatedAt: 1,
}

const link = (over: Record<string, unknown> = {}) => ({
  groupId: 'g1',
  groupName: 'Goa',
  emoji: '🏖️',
  from: 'mr',
  to: 'mp',
  amount: 124000,
  currency: 'INR',
  payeeName: 'Priya',
  payerName: 'Rahul',
  payment: { upi: 'priya@okaxis' },
  createdBy: 'priya',
  createdAt: Date.now(),
  expiresAt: Date.now() + 30 * 86_400_000,
  status: 'open',
  ...over,
})

const table = {
  code: TABLE,
  hostUid: 'priya',
  merchant: 'Pho',
  currency: 'INR',
  date: '2026-10-07',
  items: { a: { name: 'Pho', amount: 1800, pos: 0 } },
  extras: { tax: 0, tip: 0, discount: 0 },
  participants: { priya: { name: 'Priya', uid: 'priya', joinedAt: now }, anon1: { name: 'Ben', uid: 'anon1', joinedAt: now + 1 } },
  claims: { anon1: { a: 1 } },
  status: 'closed',
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
    const db = ctx.firestore()
    await setDoc(doc(db, 'groups/g1'), group)
    await setDoc(doc(db, `tables/${TABLE}`), table)
    await setDoc(doc(db, `payLinks/${CODE}`), link())
  })
})

const user = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore()
const anon = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const out = () => env.unauthenticatedContext().firestore()
const seed = (data: object, code = CODE) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `payLinks/${code}`), data))
const paid = (uid: string, over: Record<string, unknown> = {}) => ({ status: 'paid', paidAt: Date.now(), paidBy: uid, ...over })

describe('reading', () => {
  it('anyone signed in with the code, anonymous included, can get a link', async () => {
    await assertSucceeds(getDoc(doc(anon('anon1'), `payLinks/${CODE}`)))
    await assertSucceeds(getDoc(doc(user('stranger'), `payLinks/${CODE}`)))
  })
  it('signed-out users cannot', async () => {
    await assertFails(getDoc(doc(out(), `payLinks/${CODE}`)))
  })
  it('the payee lists their own links (filtered by createdBy), e.g. the claims to confirm', async () => {
    await seed(link({ tableCode: TABLE, status: 'claimed', paidAt: Date.now(), paidBy: 'anon1' }))
    await seed(link({ createdBy: 'rahul', to: 'mr', from: 'mp' }), OTHER)
    const mine = query(collection(user('priya'), 'payLinks'), where('createdBy', '==', 'priya'), where('status', '==', 'claimed'))
    await assertSucceeds(getDocs(mine))
    await assertSucceeds(getDocs(query(collection(user('priya'), 'payLinks'), where('createdBy', '==', 'priya'))))
  })
  it('nobody lists someone else’s links, or links without the createdBy filter', async () => {
    await assertFails(getDocs(query(collection(user('rahul'), 'payLinks'), where('createdBy', '==', 'priya'))))
    await assertFails(getDocs(query(collection(user('priya'), 'payLinks'), where('status', '==', 'claimed'))))
    await assertFails(getDocs(collection(user('priya'), 'payLinks')))
  })
  it('anonymous guests and signed-out users cannot list, even their own uid', async () => {
    await assertFails(getDocs(collection(anon('anon1'), 'payLinks')))
    await assertFails(getDocs(query(collection(anon('priya'), 'payLinks'), where('createdBy', '==', 'priya'))))
    await assertFails(getDocs(query(collection(out(), 'payLinks'), where('createdBy', '==', 'priya'))))
  })
})

describe('creating', () => {
  const create = (db: ReturnType<typeof user>, data: object, code = OTHER) => setDoc(doc(db, `payLinks/${code}`), data)
  it('the payee creates a link for a debt in their group', async () => {
    await assertSucceeds(create(user('priya'), link()))
  })
  it('a live table host creates one for a guest without a group', async () => {
    const { groupId: _g, ...rest } = link({ tableCode: TABLE, from: 'anon1', to: 'priya', groupName: 'Pho', forUid: 'anon1' })
    await assertSucceeds(create(user('priya'), rest))
    await assertFails(create(user('rahul'), { ...rest, createdBy: 'rahul', to: 'rahul' }))
    await assertFails(create(user('priya'), { ...rest, from: 'nobody' }))
  })
  it('only for yourself as the payee, by a member, in the group currency', async () => {
    await assertFails(create(user('rahul'), link())) // createdBy is priya
    await assertFails(create(user('rahul'), link({ createdBy: 'rahul' }))) // `to` is not rahul's member
    await assertFails(create(user('carol'), link({ createdBy: 'carol' }))) // not a member
    await assertFails(create(user('priya'), link({ from: 'nobody' })))
    await assertFails(create(user('priya'), link({ from: 'mp' })))
    await assertFails(create(user('priya'), link({ currency: 'AUD' })))
  })
  it('anonymous guests and signed-out users cannot create', async () => {
    await assertFails(create(anon('priya'), link()))
    await assertFails(create(out(), link()))
  })
  it('the code must be 20–40 lowercase letters and digits', async () => {
    await assertFails(create(user('priya'), link(), 'short2345'))
    await assertFails(create(user('priya'), link(), 'ABCDEFGHIJKMNPQRSTUVWXYZ'))
    await assertSucceeds(create(user('priya'), link(), 'a'.repeat(40)))
    await assertFails(create(user('priya'), link(), 'a'.repeat(41)))
  })
  it('shape: open only, no bank account numbers, no extra or claim keys, at most 31 days', async () => {
    await assertFails(create(user('priya'), link({ status: 'paid' })))
    await assertFails(create(user('priya'), link({ payment: { upi: 'priya@okaxis', account: '1234567890', ifsc: 'HDFC0001234' } })))
    await assertFails(create(user('priya'), link({ paidAt: Date.now() })))
    await assertFails(create(user('priya'), link({ settlementId: 'pl_x' })))
    await assertFails(create(user('priya'), link({ extra: true })))
    await assertFails(create(user('priya'), link({ amount: 0 })))
    await assertFails(create(user('priya'), link({ amount: 10.5 })))
    await assertFails(create(user('priya'), link({ expiresAt: Date.now() + 40 * 86_400_000 })))
    await assertFails(create(user('priya'), link({ createdAt: Date.now() - 3_600_000 })))
    await assertFails(create(user('priya'), link({ payeeName: 'x'.repeat(81) })))
  })
  it('in another currency or across groups: parts instead of groupId, 1 to 8 of them (the trigger checks each)', async () => {
    const { groupId: _g, ...rest } = link({ currency: 'INR' })
    const part = { groupId: 'g1', groupName: 'Trip', from: 'mr', to: 'mp', amount: 1250, currency: 'USD', paid: 104500 }
    await assertSucceeds(create(user('priya'), { ...rest, parts: [part] }))
    await assertFails(create(user('priya'), { ...rest, parts: [] }))
    await assertFails(create(user('priya'), { ...rest, parts: Array.from({ length: 9 }, () => part) }))
    await assertFails(create(user('priya'), { ...rest, parts: 'g1' }))
    // Not both: a group link stays checked against its group by the rules.
    await assertFails(create(user('priya'), { ...link(), parts: [part] }))
  })
})

describe('"I’ve paid"', () => {
  const ref = (db: ReturnType<typeof user>) => doc(db, `payLinks/${CODE}`)
  it('anyone with the code, anonymous included, flips open → paid with a method and a screenshot', async () => {
    await assertSucceeds(updateDoc(ref(anon('anon1')), paid('anon1', { method: 'UPI', proofPath: `payproofs/${CODE}/p123.jpg` })))
  })
  it('only once', async () => {
    await assertSucceeds(updateDoc(ref(anon('anon1')), paid('anon1')))
    await assertFails(updateDoc(ref(anon('anon2')), paid('anon2', { method: 'Cash' })))
    await assertFails(updateDoc(ref(anon('anon1')), { method: 'Cash' }))
  })
  it('cannot change the amount, the people, the payee or the expiry', async () => {
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { amount: 1 })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { to: 'mr', from: 'mp' })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { createdBy: 'anon1' })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { expiresAt: Date.now() + 1e9 })))
    await assertFails(updateDoc(ref(anon('anon1')), { amount: 1 }))
  })
  it('says who marked it, truthfully, now', async () => {
    await assertFails(updateDoc(ref(anon('anon1')), paid('someone-else')))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { paidAt: Date.now() - 3_600_000 })))
    await assertFails(updateDoc(ref(anon('anon1')), { status: 'paid', paidBy: 'anon1' }))
  })
  it('the screenshot must be in this link’s folder', async () => {
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { proofPath: `payproofs/${OTHER}/p.jpg` })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { proofPath: `receipts/g1/p.jpg` })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { proofPath: `payproofs/${CODE}/p.png` })))
  })
  it('not after it expired or was cancelled', async () => {
    await seed(link({ expiresAt: Date.now() - 1 }))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1')))
    await seed(link({ status: 'cancelled', cancelledAt: 1 }))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1')))
  })
  it('a table guest’s own link: only that guest', async () => {
    await seed(link({ forUid: 'anon1' }))
    await assertFails(updateDoc(ref(anon('anon2')), paid('anon2')))
    await assertSucceeds(updateDoc(ref(anon('anon1')), paid('anon1')))
  })
  it('only a group member may say which settlement cleared it; nobody may stamp recordedAt', async () => {
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { settlementId: 'pl_fake' })))
    await assertFails(updateDoc(ref(user('carol')), paid('carol', { settlementId: 's_1' })))
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1', { recordedAt: Date.now() })))
    await assertSucceeds(updateDoc(ref(user('rahul')), paid('rahul', { settlementId: 's_1', method: 'UPI' })))
  })
  it('signed-out users cannot', async () => {
    await assertFails(updateDoc(ref(out()), paid('x')))
  })
})

describe('cancelling and deleting', () => {
  const ref = (db: ReturnType<typeof user>) => doc(db, `payLinks/${CODE}`)
  it('only the payee cancels, only while open, changing nothing else', async () => {
    await assertFails(updateDoc(ref(user('rahul')), { status: 'cancelled', cancelledAt: Date.now() }))
    await assertFails(updateDoc(ref(anon('anon1')), { status: 'cancelled', cancelledAt: Date.now() }))
    await assertFails(updateDoc(ref(user('priya')), { status: 'cancelled', cancelledAt: Date.now(), amount: 1 }))
    await assertSucceeds(updateDoc(ref(user('priya')), { status: 'cancelled', cancelledAt: Date.now() }))
    await seed(link({ status: 'paid', paidAt: 1, paidBy: 'anon1' }))
    await assertFails(updateDoc(ref(user('priya')), { status: 'cancelled', cancelledAt: Date.now() }))
  })
  it('the payee cannot edit the link in other ways (or re-open a paid one)', async () => {
    await assertFails(updateDoc(ref(user('priya')), { amount: 1 }))
    await seed(link({ status: 'paid', paidAt: 1, paidBy: 'anon1' }))
    await assertFails(updateDoc(ref(user('priya')), { status: 'open' }))
  })
  it('only the payee deletes', async () => {
    await assertFails(deleteDoc(ref(user('rahul'))))
    await assertFails(deleteDoc(ref(anon('anon1'))))
    await assertSucceeds(deleteDoc(ref(user('priya'))))
  })
})

describe('live table links the host confirms (no forUid)', () => {
  const ref = (db: ReturnType<typeof user>) => doc(db, `payLinks/${CODE}`)
  const unlocked = () => seed(link({ tableCode: TABLE }))
  const claimed = () =>
    seed(link({ tableCode: TABLE, status: 'claimed', paidAt: Date.now(), paidBy: 'anon1', method: 'UPI', proofPath: `payproofs/${CODE}/p1.jpg` }))
  const claim = (uid: string, over: Record<string, unknown> = {}) => paid(uid, { status: 'claimed', ...over })

  it('anyone with the code may only claim it (open → claimed), not mark it paid', async () => {
    await unlocked()
    await assertFails(updateDoc(ref(anon('anon1')), paid('anon1')))
    await assertSucceeds(updateDoc(ref(anon('anon1')), claim('anon1', { method: 'Cash', proofPath: `payproofs/${CODE}/p1.jpg` })))
  })
  it('claiming carries the same checks: once, truthfully, nothing else changed', async () => {
    await unlocked()
    await assertFails(updateDoc(ref(anon('anon1')), claim('someone-else')))
    await assertFails(updateDoc(ref(anon('anon1')), claim('anon1', { amount: 1 })))
    await assertFails(updateDoc(ref(anon('anon1')), claim('anon1', { settlementId: 's_1' })))
    await assertSucceeds(updateDoc(ref(anon('anon1')), claim('anon1')))
    await assertFails(updateDoc(ref(anon('anon2')), claim('anon2')))
    await assertFails(updateDoc(ref(anon('anon2')), paid('anon2')))
  })
  it('locked links and Remind links cannot be claimed: they go straight to paid', async () => {
    await assertFails(updateDoc(ref(anon('anon1')), claim('anon1')))
    await seed(link({ tableCode: TABLE, forUid: 'anon1' }))
    await assertFails(updateDoc(ref(anon('anon1')), claim('anon1')))
    await assertSucceeds(updateDoc(ref(anon('anon1')), paid('anon1')))
  })
  it('a member who recorded it in Settle up marks an unlocked link paid directly', async () => {
    await unlocked()
    await assertSucceeds(updateDoc(ref(user('rahul')), paid('rahul', { settlementId: 's_1' })))
  })
  it('only the host confirms: claimed → paid, keeping the claim', async () => {
    await claimed()
    await assertFails(updateDoc(ref(anon('anon1')), { status: 'paid' }))
    await assertFails(updateDoc(ref(user('rahul')), { status: 'paid' }))
    await assertFails(updateDoc(ref(user('priya')), { status: 'paid', amount: 1 }))
    await assertFails(updateDoc(ref(user('priya')), { status: 'paid', settlementId: 'pl_x' }))
    await assertSucceeds(updateDoc(ref(user('priya')), { status: 'paid' }))
  })
  it('only the host dismisses: claimed → open, with every claim field removed', async () => {
    await claimed()
    const clear = { status: 'open', paidAt: deleteField(), paidBy: deleteField(), method: deleteField(), proofPath: deleteField() }
    await assertFails(updateDoc(ref(anon('anon1')), clear))
    await assertFails(updateDoc(ref(user('rahul')), clear))
    await assertFails(updateDoc(ref(user('priya')), { status: 'open' }))
    await assertFails(updateDoc(ref(user('priya')), { ...clear, amount: 1 }))
    await assertSucceeds(updateDoc(ref(user('priya')), clear))
    // and it can be claimed again
    await assertSucceeds(updateDoc(ref(anon('anon2')), claim('anon2')))
  })
  it('a claimed link cannot be cancelled, re-claimed or edited by the guest', async () => {
    await claimed()
    await assertFails(updateDoc(ref(user('priya')), { status: 'cancelled', cancelledAt: Date.now() }))
    await assertFails(updateDoc(ref(anon('anon1')), claim('anon1')))
    await assertFails(updateDoc(ref(anon('anon1')), { method: 'Cash' }))
  })
})
