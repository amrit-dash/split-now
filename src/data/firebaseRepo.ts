import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  GoogleAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile,
} from 'firebase/auth'
import {
  addDoc, arrayUnion, collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, initializeFirestore,
  onSnapshot, persistentLocalCache, persistentMultipleTabManager, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'
import type { Capture, Expense, ExpenseComment, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, todayISO, uid } from '@/lib/id'
import { inboxToDraft, newCaptureToken, type InboxDoc } from '@/lib/capture'
import { byCreatedDesc, byDateDesc, compact, draftToCapture, placeholdersOf, type CaptureToken, type InviteInfo, type Repo } from './repo'

export function createFirebaseRepo(config: FirebaseOptions, useEmulators: boolean): Repo {
  const app = initializeApp(config)
  const auth = getAuth(app)
  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  const storage = getStorage(app)
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }

  const groupRef = (id: string) => doc(db, 'groups', id)
  const commentsCol = (groupId: string, expenseId: string) => collection(db, 'groups', groupId, 'expenses', expenseId, 'comments')
  const syncInvite = (g: Group) =>
    setDoc(doc(db, 'invites', g.inviteCode), {
      groupId: g.id, groupName: g.name, emoji: g.emoji, placeholders: placeholdersOf(g), createdBy: g.createdBy,
    } satisfies InviteInfo & { createdBy: string })

  async function ensureProfile(u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }) {
    const r = doc(db, 'users', u.uid)
    const snap = await getDoc(r)
    if (!snap.exists()) {
      await setDoc(r, {
        uid: u.uid, displayName: u.displayName || u.email?.split('@')[0] || 'You', email: u.email ?? undefined,
        photoURL: u.photoURL ?? undefined, currency: 'AUD', payment: {},
      } satisfies UserProfile)
    }
  }

  return {
    mode: 'firebase',

    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => {
        if (!u) return cb(null)
        ensureProfile(u).catch(console.error)
        cb({ uid: u.uid, displayName: u.displayName ?? u.email ?? 'You', email: u.email ?? undefined, photoURL: u.photoURL ?? undefined })
      })
    },
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider()
      // Popups are unreliable in installed iOS PWAs; use redirect there.
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
      if (standalone) await signInWithRedirect(auth, provider)
      else await signInWithPopup(auth, provider)
    },
    async signInWithEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async signUpWithEmail(name, email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      await ensureProfile({ ...cred.user, displayName: name })
    },
    signOut: () => signOut(auth),

    watchProfile(id, cb) {
      return onSnapshot(doc(db, 'users', id), (s) => cb(s.exists() ? (s.data() as UserProfile) : null))
    },
    saveProfile: (p) => setDoc(doc(db, 'users', p.uid), p, { merge: true }),
    async getProfile(id) {
      const s = await getDoc(doc(db, 'users', id))
      return s.exists() ? (s.data() as UserProfile) : null
    },

    watchGroups(userId, cb) {
      const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', userId))
      return onSnapshot(q, (s) =>
        cb(s.docs.map((d) => ({ ...(d.data() as Group), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)),
      )
    },
    watchGroup(id, cb) {
      return onSnapshot(groupRef(id), (s) => cb(s.exists() ? { ...(s.data() as Group), id: s.id } : null), () => cb(null))
    },
    async createGroup(g) {
      const id = uid('g_')
      const now = Date.now()
      const full: Group = { ...g, id, inviteCode: inviteCode(), createdAt: now, updatedAt: now }
      await setDoc(groupRef(id), full)
      if (g.type !== 'personal') await syncInvite(full)
      return id
    },
    async updateGroup(id, patch) {
      // `undefined` means "clear this field" (e.g. removing a budget or trip dates).
      const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]))
      await updateDoc(groupRef(id), { ...data, updatedAt: Date.now() })
      const s = await getDoc(groupRef(id))
      if (s.exists()) {
        const g = { ...(s.data() as Group), id }
        if (g.type !== 'personal') await syncInvite(g)
      }
    },
    async deleteGroup(id) {
      const s = await getDoc(groupRef(id))
      const batch = writeBatch(db)
      for (const sub of ['expenses', 'settlements']) {
        const docs = await getDocs(collection(db, 'groups', id, sub))
        docs.forEach((d) => batch.delete(d.ref))
        if (sub === 'expenses') {
          for (const e of docs.docs) (await getDocs(commentsCol(id, e.id))).forEach((c) => batch.delete(c.ref))
        }
      }
      batch.delete(groupRef(id))
      await batch.commit()
      if (s.exists()) await deleteDoc(doc(db, 'invites', (s.data() as Group).inviteCode)).catch(() => {})
    },

    async getInvite(code) {
      const s = await getDoc(doc(db, 'invites', code.toUpperCase()))
      return s.exists() ? (s.data() as InviteInfo) : null
    },
    async joinGroup(code, memberId, member) {
      const invite = await this.getInvite(code)
      if (!invite) throw new Error('Invite not found')
      // Non-members cannot read the group, so this is a blind update validated by security rules.
      await updateDoc(groupRef(invite.groupId), {
        memberUids: arrayUnion(member.uid),
        [`members.${memberId}`]: member,
        joinCode: code.toUpperCase(),
        joinMemberId: memberId,
        updatedAt: Date.now(),
      })
      const s = await getDoc(groupRef(invite.groupId))
      if (s.exists()) await syncInvite({ ...(s.data() as Group), id: s.id })
      return invite.groupId
    },

    watchExpenses(groupId, cb) {
      return onSnapshot(collection(db, 'groups', groupId, 'expenses'), (s) =>
        cb(s.docs.map((d) => ({ ...(d.data() as Expense), id: d.id, groupId })).sort(byDateDesc)),
      )
    },
    async saveExpense(e) {
      await setDoc(doc(db, 'groups', e.groupId, 'expenses', e.id), e)
      await updateDoc(groupRef(e.groupId), { updatedAt: Date.now() })
    },
    async deleteExpense(groupId, id) {
      // Comments go with the expense (rules allow deleting others' comments once the parent is gone).
      const batch = writeBatch(db)
      ;(await getDocs(commentsCol(groupId, id)).catch(() => null))?.forEach((c) => batch.delete(c.ref))
      batch.delete(doc(db, 'groups', groupId, 'expenses', id))
      await batch.commit()
    },

    watchSettlements(groupId, cb) {
      return onSnapshot(collection(db, 'groups', groupId, 'settlements'), (s) =>
        cb(s.docs.map((d) => ({ ...(d.data() as Settlement), id: d.id, groupId })).sort(byDateDesc)),
      )
    },
    async saveSettlement(st) {
      await setDoc(doc(db, 'groups', st.groupId, 'settlements', st.id), st)
      await updateDoc(groupRef(st.groupId), { updatedAt: Date.now() })
    },
    deleteSettlement: (groupId, id) => deleteDoc(doc(db, 'groups', groupId, 'settlements', id)),

    async uploadReceipt(groupId, file) {
      const r = ref(storage, `receipts/${groupId}/${uid()}.jpg`)
      await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' })
      return getDownloadURL(r)
    },

    async saveRecurringOccurrences(template, occurrences) {
      const batch = writeBatch(db)
      for (const o of occurrences) batch.set(doc(db, 'groups', o.groupId, 'expenses', o.id), o)
      // update (not set) so a concurrent edit to the template isn't clobbered, and so the
      // whole batch fails if the template was deleted meanwhile.
      batch.update(doc(db, 'groups', template.groupId, 'expenses', template.id), { recurrence: template.recurrence ?? deleteField() })
      if (occurrences.length) batch.update(groupRef(template.groupId), { updatedAt: Date.now() })
      await batch.commit()
    },

    watchComments(groupId, expenseId, cb) {
      return onSnapshot(commentsCol(groupId, expenseId), (s) =>
        cb(s.docs.map((d) => ({ ...(d.data() as ExpenseComment), id: d.id })).sort((a, b) => a.createdAt - b.createdAt)),
      () => cb([]))
    },
    async addComment(groupId, expenseId, c) {
      await addDoc(commentsCol(groupId, expenseId), c)
    },
    deleteComment: (groupId, expenseId, id) => deleteDoc(doc(commentsCol(groupId, expenseId), id)),

    watchCaptures(userId, cb) {
      return onSnapshot(collection(db, 'users', userId, 'captures'), (s) =>
        cb(s.docs.map((d) => ({ ...(d.data() as Capture), id: d.id })).sort(byCreatedDesc)),
      )
    },
    saveCapture: (userId, c) => setDoc(doc(db, 'users', userId, 'captures', c.id), c),
    async updateCapture(userId, id, patch) {
      const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]))
      await updateDoc(doc(db, 'users', userId, 'captures', id), { ...data, updatedAt: Date.now() })
    },
    deleteCapture: (userId, id) => deleteDoc(doc(db, 'users', userId, 'captures', id)),

    watchCaptureTokens(userId, cb) {
      const q = query(collection(db, 'captureTokens'), where('uid', '==', userId))
      return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ ...(d.data() as CaptureToken), token: d.id })).sort(byCreatedDesc)), () => cb([]))
    },
    async createCaptureToken(userId) {
      const token = newCaptureToken()
      await setDoc(doc(db, 'captureTokens', token), { uid: userId, createdAt: Date.now() })
      return token
    },
    revokeCaptureToken: (token) => deleteDoc(doc(db, 'captureTokens', token)),
    async submitToInbox(entry, id) {
      // Works signed out: the rules only check that the token exists and belongs to entry.uid.
      await setDoc(id ? doc(db, 'captureInbox', id) : doc(collection(db, 'captureInbox')), compact(entry))
    },
    async claimInbox(userId) {
      const s = await getDocs(query(collection(db, 'captureInbox'), where('uid', '==', userId)))
      let moved = 0
      for (const d of s.docs) {
        const draft = inboxToDraft(d.data() as InboxDoc, todayISO())
        const batch = writeBatch(db)
        // Same id as the inbox doc, so a retry after a partial failure can't duplicate.
        if (draft) { batch.set(doc(db, 'users', userId, 'captures', d.id), draftToCapture(draft, d.id)); moved++ }
        else console.warn('Dropping unreadable capture', d.id, d.data())
        batch.delete(d.ref)
        await batch.commit()
      }
      return moved
    },
  }
}
