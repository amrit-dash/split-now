/**
 * Open items (groups/{gid}/openItems) and group chat (groups/{gid}/chat), plus the chat and
 * open-item notification settings. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment

// alice created the group; bob has joined; p_cat is a placeholder; carol is not a member.
const group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏝️',
  type: 'trip',
  currency: 'INR',
  simplify: true,
  memberUids: ['alice', 'bob'],
  members: {
    alice: { name: 'Alice', uid: 'alice', color: '#000' },
    bob: { name: 'Bob', uid: 'bob', color: '#111' },
    p_cat: { name: 'Cat', color: '#222' },
  },
  inviteCode: 'ABCD2345',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}

const item = {
  groupId: 'g1',
  title: 'Lunch at Cafe Blue',
  category: 'food',
  date: '2026-10-02',
  status: 'open',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}

const expense = (id: string, by: string) => ({
  id,
  groupId: 'g1',
  description: 'Lunch at Cafe Blue',
  amount: 29000,
  category: 'food',
  date: '2026-10-02',
  paidBy: { bob: 29000 },
  splits: { alice: 14500, bob: 14500 },
  splitType: 'equal',
  splitInput: { selected: ['alice', 'bob'] },
  createdBy: by,
  createdAt: 2,
  updatedAt: 2,
})

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
    await setDoc(doc(ctx.firestore(), 'groups/g1'), group)
    await setDoc(doc(ctx.firestore(), 'groups/g1/openItems/o1'), item)
  })
})

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const itemRef = (uid: string, id = 'o1') => doc(db(uid), `groups/g1/openItems/${id}`)
const asAdmin = (path: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
/** Bob claims o1 with a new expense, in one batch (what repo.saveExpense({ claim }) writes). */
const claim = (fs: ReturnType<typeof db>, uid: string, expenseId: string, over: Record<string, unknown> = {}) => {
  const b = writeBatch(fs)
  b.set(doc(fs, `groups/g1/expenses/${expenseId}`), expense(expenseId, uid))
  b.update(doc(fs, 'groups/g1/openItems/o1'), { status: 'claimed', expenseId, claimedBy: uid, claimedAt: 3, updatedAt: 3, ...over })
  return b.commit()
}

describe('open items: writing one down', () => {
  it('members create, as themselves, open, with known fields only', async () => {
    await assertSucceeds(
      setDoc(itemRef('bob', 'o2'), { ...item, createdBy: 'bob', amount: 29000, notes: 'the one by the beach', suspects: ['alice', 'p_cat'] }),
    )
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'alice' }))
    await assertFails(setDoc(itemRef('carol', 'o3'), { ...item, createdBy: 'carol' }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'bob', status: 'claimed' }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'bob', expenseId: 'e1' }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'bob', photo: 'x' }))
  })
  it('caps and types', async () => {
    const mine = { ...item, createdBy: 'bob' }
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, title: '' }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, title: 'x'.repeat(121) }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, amount: 0 }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, amount: 2.5 }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, date: 'Oct 2' }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, notes: 'x'.repeat(501) }))
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...mine, groupId: 'g2' }))
  })
  it('suspects are members of the group', async () => {
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'bob', suspects: ['zed'] }))
  })
  it('only members read them', async () => {
    await assertSucceeds(getDoc(itemRef('bob')))
    await assertFails(getDoc(itemRef('carol')))
  })
  it('not in a group in Recently deleted', async () => {
    await asAdmin('groups/g1', { ...group, deletedAt: Date.now(), deletedBy: 'alice' })
    await assertFails(setDoc(itemRef('bob', 'o3'), { ...item, createdBy: 'bob' }))
  })
})

describe('open items: editing and deleting', () => {
  it('any member edits an open item’s own fields', async () => {
    await assertSucceeds(updateDoc(itemRef('bob'), { title: 'Lunch', amount: 29000, suspects: ['alice'], updatedAt: 2 }))
    await assertSucceeds(updateDoc(itemRef('bob'), { amount: deleteField(), updatedAt: 3 }))
    await assertFails(updateDoc(itemRef('bob'), { createdBy: 'bob' }))
    await assertFails(updateDoc(itemRef('bob'), { createdAt: 5 }))
    await assertFails(updateDoc(itemRef('carol'), { title: 'x' }))
  })
  it('any member deletes (soft, as themselves) and brings it back', async () => {
    await assertFails(updateDoc(itemRef('bob'), { deletedAt: 5, deletedBy: 'alice', updatedAt: 5 }))
    await assertSucceeds(updateDoc(itemRef('bob'), { deletedAt: 5, deletedBy: 'bob', updatedAt: 5 }))
    // a deleted item isn't edited
    await assertFails(updateDoc(itemRef('alice'), { title: 'x', updatedAt: 6 }))
    await assertSucceeds(updateDoc(itemRef('alice'), { deletedAt: deleteField(), deletedBy: deleteField(), updatedAt: 6 }))
  })
  it('removed for good only by the group’s creator', async () => {
    await assertFails(deleteDoc(itemRef('bob')))
    await assertSucceeds(deleteDoc(itemRef('alice')))
  })
})

describe('open items: claiming', () => {
  it('a member claims with a new expense of their own in the same batch', async () => {
    await assertSucceeds(claim(db('bob'), 'bob', 'e1'))
    const after = (await getDoc(itemRef('alice'))).data()
    if (after?.status !== 'claimed' || after.expenseId !== 'e1' || after.claimedBy !== 'bob') throw new Error('not claimed')
  })
  it('not without the expense, not for someone else, not pointing at an old expense', async () => {
    await assertFails(updateDoc(itemRef('bob'), { status: 'claimed', expenseId: 'e1', claimedBy: 'bob', claimedAt: 3, updatedAt: 3 }))
    await assertFails(claim(db('bob'), 'bob', 'e1', { claimedBy: 'alice' }))
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'groups/g1/expenses/old'), expense('old', 'bob')))
    await assertFails(updateDoc(itemRef('bob'), { status: 'claimed', expenseId: 'old', claimedBy: 'bob', claimedAt: 3, updatedAt: 3 }))
  })
  it('the second claim fails: the item is already claimed', async () => {
    await assertSucceeds(claim(db('bob'), 'bob', 'e1'))
    await assertFails(claim(db('alice'), 'alice', 'e2'))
  })
  it('a claimed item is not edited while its expense stands', async () => {
    await assertSucceeds(claim(db('bob'), 'bob', 'e1'))
    await assertFails(updateDoc(itemRef('alice'), { title: 'x', updatedAt: 9 }))
  })
  it('once its expense is deleted, the item is open again: editable and claimable', async () => {
    await assertSucceeds(claim(db('bob'), 'bob', 'e1'))
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1/expenses/e1'), { deletedAt: Date.now(), deletedBy: 'bob' }))
    await assertSucceeds(updateDoc(itemRef('alice'), { title: 'Lunch', updatedAt: 9 }))
    await assertSucceeds(claim(db('alice'), 'alice', 'e2'))
  })
  it('a deleted item can’t be claimed', async () => {
    await assertSucceeds(updateDoc(itemRef('bob'), { deletedAt: 5, deletedBy: 'bob', updatedAt: 5 }))
    await assertFails(claim(db('bob'), 'bob', 'e1'))
  })
})

describe('group chat', () => {
  const msg = { authorUid: 'bob', authorName: 'Bob', text: 'Who paid for lunch on the 2nd?', kind: 'text', createdAt: 1 }
  const chat = (uid: string, id = 'm1') => doc(db(uid), `groups/g1/chat/${id}`)

  it('members post as themselves; everyone in the group reads, including people who join later', async () => {
    await assertSucceeds(setDoc(chat('bob'), msg))
    await assertFails(setDoc(chat('alice', 'm2'), msg))
    await assertFails(setDoc(chat('carol', 'm2'), { ...msg, authorUid: 'carol' }))
    await assertSucceeds(getDoc(chat('alice')))
    await assertFails(getDoc(chat('carol')))
    // carol joins: the old message is hers to read too
    await asAdmin('groups/g1', { ...group, memberUids: ['alice', 'bob', 'carol'] })
    await assertSucceeds(getDoc(chat('carol')))
  })
  it('text only, capped; known kinds with what they need', async () => {
    await assertFails(setDoc(chat('bob'), { ...msg, text: '' }))
    await assertFails(setDoc(chat('bob'), { ...msg, text: 'x'.repeat(1001) }))
    await assertFails(setDoc(chat('bob'), { ...msg, imageUrl: 'https://x' }))
    await assertFails(setDoc(chat('bob'), { ...msg, kind: 'photo' }))
    await assertSucceeds(setDoc(chat('bob', 'c1'), { ...msg, kind: 'openItem', ref: 'o1', text: '' }))
    await assertFails(setDoc(chat('bob', 'c2'), { ...msg, kind: 'openItem', text: '' }))
    await assertSucceeds(setDoc(chat('bob', 'c3'), { ...msg, kind: 'pay', amount: 50000, text: '' }))
    await assertFails(setDoc(chat('bob', 'c4'), { ...msg, kind: 'pay', text: '' }))
    await assertFails(setDoc(chat('bob', 'c5'), { ...msg, amount: 50000 }))
    await assertFails(setDoc(chat('bob', 'c6'), { ...msg, kind: 'pay', amount: 0, text: '' }))
    await assertSucceeds(setDoc(chat('bob', 'c7'), { ...msg, kind: 'expense', ref: 'e1', text: '' }))
  })
  it('Settle up and balances cards; tags, asks of some people, and replies', async () => {
    await assertSucceeds(setDoc(chat('bob', 's1'), { ...msg, kind: 'settle', text: '' }))
    await assertSucceeds(setDoc(chat('bob', 's2'), { ...msg, kind: 'settle', to: ['alice'], mentions: ['alice'], text: '@Alice can we square up?' }))
    await assertFails(setDoc(chat('bob', 's3'), { ...msg, kind: 'settle', amount: 100, text: '' }))
    await assertSucceeds(setDoc(chat('bob', 'b1'), { ...msg, kind: 'balances', text: '' }))
    await assertSucceeds(setDoc(chat('bob', 'p1'), { ...msg, kind: 'pay', amount: 500, to: ['alice', 'p_cat'], text: '' }))
    // `to` is for asks only, and not empty
    await assertFails(setDoc(chat('bob', 't1'), { ...msg, to: ['alice'] }))
    await assertFails(setDoc(chat('bob', 't2'), { ...msg, kind: 'settle', to: [], text: '' }))
    await assertSucceeds(setDoc(chat('bob', 'm5'), { ...msg, mentions: ['all'] }))
    await assertFails(setDoc(chat('bob', 'm6'), { ...msg, mentions: 'alice' }))
    await assertFails(setDoc(chat('bob', 'm7'), { ...msg, mentions: Array.from({ length: 21 }, (_, i) => `p${i}`) }))
    const reply = { id: 'm1', authorUid: 'alice', authorName: 'Alice', text: 'Who paid?' }
    await assertSucceeds(setDoc(chat('bob', 'r1'), { ...msg, replyTo: reply }))
    await assertFails(setDoc(chat('bob', 'r2'), { ...msg, replyTo: { ...reply, text: 'x'.repeat(161) } }))
    await assertFails(setDoc(chat('bob', 'r3'), { ...msg, replyTo: { ...reply, extra: 1 } }))
    await assertFails(setDoc(chat('bob', 'r4'), { ...msg, replyTo: { id: 'm1' } }))
    // a private group's names are tokens: up to 200, the author's and the quoted one's
    const sealedName = `v1:${'A'.repeat(197)}`
    await assertSucceeds(setDoc(chat('bob', 'r5'), { ...msg, authorName: sealedName, replyTo: { ...reply, authorName: sealedName } }))
    await assertFails(setDoc(chat('bob', 'r6'), { ...msg, authorName: `${sealedName}A` }))
    await assertFails(setDoc(chat('bob', 'r7'), { ...msg, replyTo: { ...reply, authorName: `${sealedName}A` } }))
  })
  it('the author edits their words and tags (stamped editedAt), nothing else; deleted by the author or the group’s creator', async () => {
    await assertSucceeds(setDoc(chat('bob'), msg))
    await assertFails(updateDoc(chat('bob'), { text: 'edited' }))
    await assertSucceeds(updateDoc(chat('bob'), { text: 'edited @Alice', mentions: ['alice'], editedAt: 5 }))
    await assertSucceeds(updateDoc(chat('bob'), { text: 'edited again', mentions: deleteField(), editedAt: 6 }))
    await assertFails(updateDoc(chat('bob'), { text: '', editedAt: 7 }))
    await assertFails(updateDoc(chat('bob'), { kind: 'pay', amount: 100, editedAt: 7 }))
    await assertFails(updateDoc(chat('bob'), { createdAt: 9, editedAt: 7 }))
    await assertFails(updateDoc(chat('alice'), { text: 'not yours', editedAt: 7 }))
    await assertSucceeds(setDoc(chat('alice', 'm2'), { ...msg, authorUid: 'alice', authorName: 'Alice' }))
    await assertFails(deleteDoc(chat('bob', 'm2')))
    await assertSucceeds(deleteDoc(chat('bob', 'm1')))
    await assertSucceeds(setDoc(chat('bob', 'm3'), msg))
    await assertSucceeds(deleteDoc(chat('alice', 'm3')))
  })
  it('nothing new in a group in Recently deleted', async () => {
    await asAdmin('groups/g1', { ...group, deletedAt: Date.now(), deletedBy: 'alice' })
    await assertFails(setDoc(chat('bob'), msg))
  })
})

describe('@mentions and merging two people', () => {
  const msg = { authorUid: 'bob', authorName: 'Bob', text: '@Alice who paid?', kind: 'text', createdAt: 1 }
  it('a message may name up to 20 people it mentions', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'groups/g1/chat/m1'), { ...msg, mentions: ['alice'] }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/chat/m2'), { ...msg, mentions: 'alice' }))
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/chat/m3'), { ...msg, mentions: Array.from({ length: 21 }, (_, i) => `m${i}`) }))
  })
  it('a merge card is written by the server only', async () => {
    await assertFails(setDoc(doc(db('bob'), 'groups/g1/chat/m4'), { ...msg, kind: 'merge', ref: 'r1' }))
  })
  it('only the creator turns on "merging needs my OK"', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'groups/g1'), { mergeNeedsOk: true }))
    await assertSucceeds(updateDoc(doc(db('alice'), 'groups/g1'), { mergeNeedsOk: true }))
    await assertFails(updateDoc(doc(db('bob'), 'groups/g1'), { mergeNeedsOk: false }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1'), { mergeNeedsOk: 'yes' }))
    // Other settings stay open to members.
    await assertSucceeds(updateDoc(doc(db('bob'), 'groups/g1'), { name: 'Trip 2' }))
  })
  it('members read merge requests; nobody writes them from the app; the approver finds theirs across groups', async () => {
    await asAdmin('groups/g1/mergeRequests/r1', { from: 'p_cat', into: 'bob', status: 'pending', by: 'bob', approverUid: 'alice', createdAt: 1 })
    await assertSucceeds(getDoc(doc(db('bob'), 'groups/g1/mergeRequests/r1')))
    await assertFails(getDoc(doc(db('carol'), 'groups/g1/mergeRequests/r1')))
    await assertFails(setDoc(doc(db('alice'), 'groups/g1/mergeRequests/r2'), { from: 'p_cat', into: 'bob', status: 'done' }))
    await assertFails(updateDoc(doc(db('alice'), 'groups/g1/mergeRequests/r1'), { status: 'done' }))
    const { collectionGroup, getDocs, query, where } = await import('firebase/firestore')
    await assertSucceeds(getDocs(query(collectionGroup(db('alice'), 'mergeRequests'), where('approverUid', '==', 'alice'), where('status', '==', 'pending'))))
    await assertFails(getDocs(query(collectionGroup(db('carol'), 'mergeRequests'), where('status', '==', 'pending'))))
  })
})

describe('notification settings: chat and open items', () => {
  const prefs = (uid: string) => doc(db(uid), `users/${uid}/settings/notifications`)
  it('chat, openItems and mutedChats are stored', async () => {
    await assertSucceeds(setDoc(prefs('bob'), { chat: false, openItems: true, mutedChats: ['g1'], updatedAt: 1 }))
    await assertFails(setDoc(prefs('bob'), { chat: 'no' }))
    await assertFails(setDoc(prefs('bob'), { mutedChats: 'g1' }))
    await assertFails(setDoc(prefs('bob'), { mutedChats: Array.from({ length: 201 }, (_, i) => `g${i}`) }))
  })
  it('"Needs your OK" (approvals) is its own switch', async () => {
    await assertSucceeds(setDoc(prefs('bob'), { expenses: false, approvals: true, updatedAt: 1 }))
    await assertSucceeds(setDoc(prefs('bob'), { approvals: false, updatedAt: 2 }))
    await assertFails(setDoc(prefs('bob'), { approvals: 'on' }))
  })
})
