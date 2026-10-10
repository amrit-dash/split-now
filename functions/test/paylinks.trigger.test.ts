/**
 * The onPayLinkPaid trigger in the Functions emulator, for a link across groups (payLinks.parts,
 * Collect in my currency): one rupee link for a rupee group and a dollar group. Marking it paid
 * records one payment in each group, in that group's currency, the dollar one with what was paid
 * in rupees; a second paid write records nothing more.
 * Run with: npm run test:functions (with both emulators together, so the trigger fires).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

const PROJECT = 'demo-splitit'
let env: RulesTestEnvironment

const group = (name: string, currency: string) => ({
  name,
  emoji: '✈️',
  type: 'trip',
  currency,
  memberUids: ['alice', 'bob'],
  members: { m_a: { name: 'Alice', uid: 'alice' }, m_b: { name: 'Bob', uid: 'bob' } },
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
})

/**
 * Bob owes Alice ₹1,540 in Goa and $12.50 in NYC: one ₹2,585 link (12.50 × 83.6 = ₹1,045).
 * Each test has its own ids: with the triggers live, clearing Firestore sets off onGroupDeleted
 * for the last test's groups, which may still be running when the next test starts.
 */
async function setup(tag: string) {
  const ids = { goa: `goa_${tag}`, nyc: `nyc_${tag}`, code: `link${tag}`.padEnd(24, '0') }
  const link = {
    groupName: '2 groups',
    from: 'm_b',
    to: 'm_a',
    amount: 258500,
    currency: 'INR',
    payeeName: 'Alice',
    payerName: 'Bob',
    payment: { upi: 'alice@upi' },
    createdBy: 'alice',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    status: 'open',
    parts: [
      { groupId: ids.goa, groupName: 'Goa', from: 'm_b', to: 'm_a', amount: 154000, currency: 'INR', paid: 154000 },
      { groupId: ids.nyc, groupName: 'NYC', from: 'm_b', to: 'm_a', amount: 1250, currency: 'USD', paid: 104500 },
    ],
  }
  await admin(async (db) => {
    await setDoc(doc(db, `groups/${ids.goa}`), group('Goa', 'INR'))
    await setDoc(doc(db, `groups/${ids.nyc}`), group('NYC', 'USD'))
    await setDoc(doc(db, `payLinks/${ids.code}`), link)
  })
  return ids
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

const settlements = (g: string) =>
  admin(async (db) => (await getDocs(collection(db, `groups/${g}/settlements`))).docs.map((d): Record<string, unknown> => ({ id: d.id, ...d.data() })))

/** The trigger runs asynchronously: wait until the link is stamped. */
async function untilRecorded(code: string) {
  for (let i = 0; i < 60; i++) {
    const l = await admin(async (db) => (await getDoc(doc(db, `payLinks/${code}`))).data())
    if (l?.recordedAt) return l
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('the link was never recorded')
}

describe('onPayLinkPaid with parts (emulator)', () => {
  it('records one payment per group, each in its own currency, once', async () => {
    const { goa, nyc, code } = await setup('a')
    await admin((db) => updateDoc(doc(db, `payLinks/${code}`), { status: 'paid', paidAt: Date.now(), paidBy: 'bob', method: 'UPI' }))
    const l = await untilRecorded(code)
    expect(l.settlementId).toBe(`pl_${code}_0`)

    const [inr] = await settlements(goa)
    expect(inr).toMatchObject({ id: `pl_${code}_0`, from: 'm_b', to: 'm_a', amount: 154000, payLink: code })
    expect(inr.paid).toBeUndefined()
    const [usd] = await settlements(nyc)
    expect(usd).toMatchObject({ id: `pl_${code}_1`, amount: 1250, paid: { currency: 'INR', amount: 104500, source: 'ecb' } })
    expect((usd.paid as { rate: number }).rate).toBeCloseTo(1 / 83.6, 8)

    const activity = await admin(async (db) => (await getDocs(collection(db, `groups/${nyc}/activity`))).docs.map((d) => d.data()))
    expect(activity).toHaveLength(1)
    expect(activity[0].summary).toContain('Bob marked $12.50 paid to Alice, paid ₹1,045 with a Pay me link')

    // Paid again (a retried write): nothing more is recorded.
    await admin((db) => updateDoc(doc(db, `payLinks/${code}`), { status: 'paid', paidAt: Date.now() }))
    await new Promise((r) => setTimeout(r, 1500))
    expect(await settlements(goa)).toHaveLength(1)
    expect(await settlements(nyc)).toHaveLength(1)
  })

  it('a part whose group no longer matches is skipped; the rest are recorded', async () => {
    const { goa, nyc, code } = await setup('b')
    await admin((db) => updateDoc(doc(db, `groups/${nyc}`), { currency: 'EUR' }))
    await admin((db) => updateDoc(doc(db, `payLinks/${code}`), { status: 'paid', paidAt: Date.now(), paidBy: 'bob' }))
    await untilRecorded(code)
    expect(await settlements(goa)).toHaveLength(1)
    expect(await settlements(nyc)).toHaveLength(0)
  })
})
