/**
 * Big groups stay writable. Rules get 1000 evaluation steps per request, and checking a change to
 * `members` walks every entry: before the members diff was worked out once (firestore.rules
 * membershipOk), a group of a few people with emails and photos ran out of steps, and every member
 * write (a person's own name, photo or badge, adding or removing someone) was refused as
 * "permission denied". These run the main member writes on groups up to the 60-member cap.
 * Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

/** A real-looking group: `n` joined people with emails, photos and badges, someone who left, a placeholder and a drawn icon. */
function bigGroup(n: number) {
  const members: Record<string, unknown> = {
    a: { name: 'Amrit Dash', uid: 'a', email: 'a@example.com', color: '#8b5cf6', photoURL: 'https://lh3.googleusercontent.com/a/x=s96-c' },
    gone: { name: 'Gone', uid: 'gone', email: 'gone@example.com', color: '#000', removedAt: 5 },
    p_ph: { name: 'Placeholder', color: '#111' },
  }
  const memberUids = ['a']
  for (let i = 0; i < n; i++) {
    members[`p_${i}`] = {
      name: `Person ${i}`,
      uid: `u${i}`,
      email: `u${i}@example.com`,
      color: '#000',
      photoURL: 'https://lh3.googleusercontent.com/a/y=s96-c',
      pro: true,
    }
    memberUids.push(`u${i}`)
  }
  return {
    id: 'g1',
    name: 'Kodai Trip',
    emoji: '🎂',
    type: 'trip',
    currency: 'INR',
    simplify: true,
    startDate: '2026-10-02',
    endDate: '2026-10-04',
    createdBy: 'a',
    inviteCode: 'TNUTZJTJ',
    joinCode: 'TNUTZJTJ',
    joinMemberId: 'p_0',
    memberOpId: 'gone',
    mergeNeedsOk: false,
    createdAt: 1,
    updatedAt: 2,
    memberUids,
    members,
    iconImage: `data:image/png;base64,${'A'.repeat(12000)}`,
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

// 3 + n entries: 56 leaves room to add one more under the 60-member cap.
for (const n of [3, 30, 56]) {
  describe(`a group of ${n + 3}`, () => {
    beforeEach(async () => {
      await env.clearFirestore()
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'groups/g1'), bigGroup(n))
        await setDoc(doc(ctx.firestore(), 'admins/a'), { at: 1 })
      })
    })
    const g1 = (uid: string) => doc(env.authenticatedContext(uid).firestore(), 'groups/g1')
    it('a person syncs their own name, photo and badge (as their app does)', async () => {
      await assertSucceeds(
        updateDoc(g1('a'), {
          'members.a.name': 'Amrit Dash',
          'members.a.photoURL': 'https://lh3.googleusercontent.com/a/z=s96-c',
          'members.a.pro': deleteField(),
          'members.a.dev': true,
          memberOpId: 'a',
        }),
      )
      await assertSucceeds(updateDoc(g1('u1'), { 'members.p_1.name': 'P1', 'members.p_1.pro': deleteField(), memberOpId: 'p_1' }))
    })
    it('Dev still comes only from an admin', async () => {
      await assertFails(updateDoc(g1('u1'), { 'members.p_1.dev': true, memberOpId: 'p_1' }))
    })
    it('renaming the group', () => assertSucceeds(updateDoc(g1('a'), { name: 'Kodai', updatedAt: 3 })))
    it('adding a placeholder', () => assertSucceeds(updateDoc(g1('a'), { 'members.p_new': { name: 'New', color: '#222' }, memberOpId: 'p_new', updatedAt: 3 })))
    it('removing a placeholder', () => assertSucceeds(updateDoc(g1('a'), { 'members.p_ph.removedAt': 9, memberOpId: 'p_ph', updatedAt: 3 })))
    it('the creator removing someone who joined', () =>
      assertSucceeds(
        updateDoc(g1('a'), { 'members.p_1.removedAt': 9, memberUids: bigGroup(n).memberUids.filter((u) => u !== 'u1'), memberOpId: 'p_1', updatedAt: 3 }),
      ))
    it('archiving it for yourself', () => assertSucceeds(updateDoc(g1('u2'), { archivedBy: ['u2'] })))
    it('someone else editing your entry is still refused', () => assertFails(updateDoc(g1('u1'), { 'members.a.name': 'Not Amrit', memberOpId: 'a' })))
  })
}
