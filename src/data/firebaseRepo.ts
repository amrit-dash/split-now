import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  EmailAuthProvider, GoogleAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getRedirectResult, onAuthStateChanged,
  linkWithCredential, linkWithPopup, linkWithRedirect, signInAnonymously, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile,
  type User,
} from 'firebase/auth'
import {
  FieldPath, arrayRemove, arrayUnion, clearIndexedDbPersistence, collection, connectFirestoreEmulator, deleteField, doc, getDoc,
  getDocFromCache, getDocs, getDocsFromCache, initializeFirestore, limit, onSnapshot, orderBy, persistentLocalCache,
  persistentMultipleTabManager, query, setDoc, terminate, waitForPendingWrites, where, writeBatch,
  type DocumentReference, type FirestoreError, type Query, type QuerySnapshot, type WriteBatch,
} from 'firebase/firestore'
import type { FirebaseStorage } from 'firebase/storage'
import type { ActivityEntry, Capture, Expense, ExpenseComment, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, todayISO, uid } from '@/lib/id'
import { defaultCurrency } from '@/lib/locale'
import { inboxToDraft, newCaptureToken, type InboxDoc } from '@/lib/capture'
import { downscale } from '@/lib/image'
import { TABLE_TTL_MS, type LiveTable } from '@/lib/table'
import { disputeActivity, expenseEventActivity, expenseSaveActivity, importActivity, memberActivity, settlementActivity, type NewActivity } from '@/lib/activity'
import { expenseEditPatch, prepareExpenseSave, prepareImportedSettlement, prepareOccurrence } from '@/lib/trust'
import {
  activityCtxFor, byCreatedDesc, byDateDesc, changedSettings, compact, draftToCapture, errorChannel, placeholdersOf, storagePathFromUrl,
  memberProfileOf, type CaptureToken, type GroupSettings, type InviteInfo, type MemberProfile, type Repo, type SnapMeta, type TablePatch, type Watch,
} from './repo'
import type { Functions } from 'firebase/functions'
import type { ParsedReceipt } from '@/lib/ocr-parse'
import type { AiKeyResult, AiModel, AiState, AiStatement, AiStatusResult, AiUnavailableReason } from './repo'
import type { FxRatesDoc, FxRefreshResult } from '@/lib/fx'
import { initAppCheck } from '@/lib/appcheck'
import { disablePush } from '@/lib/push'

/** Firestore allows 500 writes per batch; leave headroom. */
const BATCH_LIMIT = 450
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
/** `p`, or `fallback` when it hasn't settled within `ms` (the promise keeps running). */
const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, sleep(ms).then(() => fallback)])

const metaOf = (s: { metadata: { fromCache: boolean; hasPendingWrites: boolean } }): SnapMeta => ({ fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites })
/** What a watcher reports when its query failed (access lost, deleted): a fallback value. */
const FAILED: SnapMeta = { fromCache: true, hasPendingWrites: false, error: true }
/** How long a captures listener waits for the server before showing the cached (maybe empty) list. */
const CAPTURES_WAIT_MS = 5000
/** How long an edit waits for the server's copy of the document before using the cached one. */
const PREV_WAIT_MS = 1500

/** A Google account photo URL without its size suffix (Google rotates =s96-c style suffixes). */
const photoKey = (url: string | undefined) => url?.replace(/=s\d+(-c)?$/, '')

export function createFirebaseRepo(config: FirebaseOptions, useEmulators: boolean): Repo {
  const app = initializeApp(config)
  initAppCheck(app, useEmulators)
  const auth = getAuth(app)
  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  // Storage is loaded the first time a photo is uploaded or deleted; most sessions never need it.
  let storageMod: Promise<{ storage: FirebaseStorage; sdk: typeof import('firebase/storage') }> | undefined
  const lazyStorage = () => (storageMod ??= import('firebase/storage').then((sdk) => {
    const storage = sdk.getStorage(app)
    // Give up on a receipt upload after a minute instead of retrying for 10 minutes.
    storage.maxUploadRetryTime = 60_000
    if (useEmulators) sdk.connectStorageEmulator(storage, '127.0.0.1', 9199)
    return { storage, sdk }
  }))

  const errors = errorChannel()
  let functions: Functions | undefined
  let functionsEmulated = false

  // Surface failures from a Google sign-in redirect (installed iOS PWAs use redirect).
  getRedirectResult(auth).catch((e) => errors.emit('read', e, 'Google sign-in failed'))

  const groupRef = (id: string) => doc(db, 'groups', id)
  const inviteRef = (code: string) => doc(db, 'invites', code)
  const tableRef = (code: string) => doc(db, 'tables', code)
  const commentsCol = (groupId: string, expenseId: string) => collection(db, 'groups', groupId, 'expenses', expenseId, 'comments')
  const captureRef = (userId: string, id: string) => doc(db, 'users', userId, 'captures', id)
  const memberProfileRef = (groupId: string, userId: string) => doc(db, 'groups', groupId, 'profiles', userId)
  const activityCol = (groupId: string) => collection(db, 'groups', groupId, 'activity')
  const expenseRef = (groupId: string, id: string) => doc(db, 'groups', groupId, 'expenses', id)
  const settlementRef = (groupId: string, id: string) => doc(db, 'groups', groupId, 'settlements', id)
  const inviteDoc = (g: Group): InviteInfo => ({ groupId: g.id, groupName: g.name, emoji: g.emoji, placeholders: placeholdersOf(g) })

  /**
   * Commit without waiting for the server. Firestore applies the batch to the local cache
   * synchronously, so listeners update immediately and the UI can move on even offline.
   * Server rejections are reported through onError.
   */
  const fire = (batch: WriteBatch, context: string) => {
    batch.commit().catch((e) => errors.emit('write', e, context))
  }
  const listenError = (context: string, fallback: () => void) => (e: FirestoreError) => {
    fallback()
    // Losing access to a single group (removed / deleted) is shown by the screen, not a toast.
    if (e.code !== 'permission-denied') errors.emit('read', e, context)
  }
  /**
   * A list listener that also reports sync state (includeMetadataChanges), reusing the previous
   * array when only metadata changed so screens don't re-render or recompute for nothing.
   */
  function watchList<T>(q: Query, map: (s: QuerySnapshot) => T[], cb: Watch<T[]>, context: string) {
    let last: T[] | undefined
    return onSnapshot(q, { includeMetadataChanges: true }, (s) => {
      if (!last || s.docChanges().length) last = map(s)
      cb(last, metaOf(s))
    }, listenError(context, () => cb([], FAILED)))
  }
  const deleteFileLater = (path: string | undefined) => {
    if (path && online()) lazyStorage().then(({ storage, sdk }) => sdk.deleteObject(sdk.ref(storage, path))).catch((e) => console.warn('Receipt cleanup failed', e))
  }
  /** The receipt image an expense owns: only a path under this group's folder may ever be deleted. */
  const receiptOf = (groupId: string, e: Pick<Expense, 'receiptPath' | 'receiptUrl'> | undefined) => {
    const p = e ? e.receiptPath ?? storagePathFromUrl(e.receiptUrl) : undefined
    return p?.startsWith(`receipts/${groupId}/`) ? p : undefined
  }

  /** The signed-in user's shareable profile, from cache (the auth provider keeps it warm). */
  async function myMemberProfile(): Promise<MemberProfile | null> {
    const u = auth.currentUser
    if (!u) return null
    try {
      const s = await getDocFromCache(doc(db, 'users', u.uid))
      if (s.exists()) {
        return memberProfileOf(s.data() as UserProfile)
      }
    } catch { /* not cached */ }
    return { displayName: u.displayName || u.email?.split('@')[0] || 'You', payment: {} }
  }

  /** A document as this device last saw it (screens only act on what they've loaded). */
  async function cached<T>(r: DocumentReference): Promise<T | undefined> {
    try {
      const s = await getDocFromCache(r)
      return s.exists() ? ({ ...(s.data() as T), id: s.id }) : undefined
    } catch {
      return undefined
    }
  }
  const cachedGroup = (id: string) => cached<Group>(groupRef(id))
  /** The server's copy when it answers quickly, else what this device has (an edit's "before"). */
  async function latest<T>(r: DocumentReference): Promise<T | undefined> {
    if (!online()) return cached<T>(r)
    const fromServer = getDoc(r).then((s) => ({ v: s.exists() ? ({ ...(s.data() as T), id: s.id }) : undefined }), () => null)
    const got = await within(fromServer, PREV_WAIT_MS, null)
    return got ? got.v : cached<T>(r)
  }

  /** Builds the activity context for the signed-in user in a group (from cache). */
  async function actCtx(groupId: string, item?: object, g?: Group) {
    const group = g ?? (await cachedGroup(groupId))
    const name = (await myMemberProfile())?.displayName ?? 'Someone'
    return activityCtxFor(group, { uid: me(), name }, item)
  }
  /** Adds an activity entry to a batch (create-only; rules check actorUid). */
  const log = (batch: WriteBatch, groupId: string, a: NewActivity | null) => {
    if (a) batch.set(doc(activityCol(groupId)), compact(a))
  }
  const me = () => auth.currentUser?.uid ?? ''

  /** The photo of the user's Google sign-in, if they have one. */
  const googlePhoto = (u: Pick<User, 'photoURL' | 'providerData'>) =>
    u.providerData?.find((p) => p.providerId === 'google.com')?.photoURL ?? (u.providerData?.length ? undefined : u.photoURL) ?? undefined

  async function ensureProfile(u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null; providerData?: User['providerData'] }) {
    const r = doc(db, 'users', u.uid)
    // Cache first: this runs on every app open, and the profile listener keeps the copy fresh.
    const snap = await getDocFromCache(r).then((c) => (c.exists() ? c : getDoc(r))).catch(() => getDoc(r))
    const google = googlePhoto({ photoURL: u.photoURL, providerData: u.providerData ?? [] })
    if (!snap.exists()) {
      const batch = writeBatch(db)
      batch.set(r, {
        // currentUser, not u: a sign-up's updateProfile may have set the name while getDoc ran.
        uid: u.uid, displayName: (auth.currentUser?.uid === u.uid ? auth.currentUser.displayName : null) || u.displayName || u.email?.split('@')[0] || 'You', email: u.email ?? undefined,
        photoURL: google, photoSource: google ? 'google' : undefined, currency: defaultCurrency(), payment: {},
      } satisfies UserProfile)
      fire(batch, 'Creating your profile')
      return
    }
    // Later Google sign-ins refresh the Google photo, unless the user uploaded or removed one.
    const p = snap.data() as UserProfile
    if (google && p.photoSource !== 'upload' && p.photoSource !== 'none' && photoKey(p.photoURL) !== photoKey(google)) {
      await repo.saveProfile({ ...p, photoURL: google, photoSource: 'google' })
    }
  }

  async function uniqueInviteCode(): Promise<string> {
    return uniqueCode(inviteRef)
  }

  async function uniqueCode(refFor: (code: string) => DocumentReference): Promise<string> {
    // 8 chars from a 31-symbol alphabet makes collisions vanishingly rare; when online we also
    // check (briefly) that the code is free. Offline we skip the check rather than block.
    for (let i = 0; i < 3; i++) {
      const code = inviteCode()
      if (!online()) return code
      try {
        const taken = await Promise.race([getDoc(refFor(code)).then((s) => s.exists()), sleep(1500).then(() => false)])
        if (!taken) return code
      } catch {
        return code
      }
    }
    return inviteCode()
  }

  const repo: Repo = {
    mode: 'firebase',
    onError: errors.on,

    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => {
        if (!u) return cb(null)
        // Anonymous guests (live table split) get no profile and no access to groups.
        if (u.isAnonymous) return cb({ uid: u.uid, displayName: 'Guest', isAnonymous: true })
        ensureProfile(u).catch(console.error)
        cb({ uid: u.uid, displayName: u.displayName ?? u.email ?? 'You', email: u.email ?? undefined, photoURL: u.photoURL ?? undefined, googlePhotoURL: googlePhoto(u), providers: u.providerData.map((p) => p.providerId) })
      })
    },
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider()
      // Popups are unreliable in installed iOS PWAs; use redirect there (result handled at startup).
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
      if (standalone) await signInWithRedirect(auth, provider)
      else await signInWithPopup(auth, provider)
    },
    async linkGoogle() {
      const u = auth.currentUser
      if (!u) throw new Error('Not signed in')
      const provider = new GoogleAuthProvider()
      if (u.email) provider.setCustomParameters({ login_hint: u.email })
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
      if (standalone) await linkWithRedirect(u, provider)
      else await linkWithPopup(u, provider)
      await u.reload()
    },
    async addPassword(password) {
      const u = auth.currentUser
      if (!u?.email) throw new Error('This account has no email address')
      await linkWithCredential(u, EmailAuthProvider.credential(u.email, password))
      await u.reload()
    },
    async signInWithEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async signUpWithEmail(name, email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      await ensureProfile({ ...cred.user, displayName: name })
      // onAuthStateChanged fires before updateProfile, so its ensureProfile may already have
      // created the profile under the email prefix. Set the real name (shown on invites/joins).
      if (name) {
        const batch = writeBatch(db)
        batch.set(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, displayName: name }, { merge: true })
        fire(batch, 'Saving your name')
      }
    },
    async signInAnonymously() {
      await signInAnonymously(auth)
    },
    async signOut() {
      // Give queued writes a moment to reach the server, then wipe this device's cache so the
      // next person on this browser can't read the previous user's data.
      // Unregister this browser from push first (queued delete, flushed just below).
      await Promise.race([disablePush(me()), sleep(2000)])
      // Queued writes live in that cache: wiping it would lose them for good. So the cache is
      // only cleared once the server has acknowledged everything; otherwise it stays (the
      // writes sync when this user signs in here again) and the user is told.
      const synced = online() && (await within(waitForPendingWrites(db).then(() => true, () => false), 5000, false))
      await signOut(auth)
      if (synced) {
        try {
          await terminate(db)
          await clearIndexedDbPersistence(db)
        } catch (e) {
          console.warn('Could not clear offline cache (another tab may be open)', e)
        }
      } else {
        errors.emit('write', new Error('pending writes'), 'Some changes haven’t synced yet, so this device keeps its offline copy until you sign in again')
        await sleep(2500)
      }
      location.reload()
    },

    watchProfile(id, cb) {
      return onSnapshot(doc(db, 'users', id), (s) => cb(s.exists() ? (s.data() as UserProfile) : null, metaOf(s)), listenError('Loading your profile', () => cb(null, FAILED)))
    },
    async saveProfile(p) {
      const shared = memberProfileOf(p)
      // An uploaded photo that is being replaced or removed is deleted from Storage.
      let oldUpload: string | undefined
      try {
        const prev = await getDocFromCache(doc(db, 'users', p.uid))
        const old = prev.exists() ? (prev.data() as UserProfile) : undefined
        if (old?.photoSource === 'upload' && old.photoURL && old.photoURL !== p.photoURL) oldUpload = storagePathFromUrl(old.photoURL)
      } catch { /* not cached */ }
      // merge: true would keep a removed photo, so clear the fields explicitly.
      const own = { ...p, photoURL: p.photoURL ?? deleteField(), photoSource: p.photoSource ?? (p.photoURL ? undefined : deleteField()) }
      // The server's list when it answers (the cache resolves empty, not failing, for a query
      // this device has never run, e.g. Profile opened before Groups on a fresh install).
      let groupIds: string[] = []
      const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', p.uid))
      const ids = (s: { docs: Array<{ id: string }> }) => s.docs.map((d) => d.id)
      const fromCache = () => getDocsFromCache(q).then(ids).catch(() => [] as string[])
      groupIds = online() ? await within(getDocs(q).then(ids).catch(fromCache), 3000, null) ?? (await fromCache()) : await fromCache()
      const refs: Array<[DocumentReference, object, boolean]> = [
        [doc(db, 'users', p.uid), own, true],
        ...groupIds.map((g) => [memberProfileRef(g, p.uid), shared, false] as [DocumentReference, object, boolean]),
      ]
      for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db)
        for (const [r, data, merge] of refs.slice(i, i + BATCH_LIMIT)) batch.set(r, data, merge ? { merge: true } : {})
        fire(batch, 'Saving your profile')
      }
      if (oldUpload?.startsWith(`avatars/${p.uid}/`)) deleteFileLater(oldUpload)
    },
    async uploadAvatar(userId, jpeg) {
      if (!online()) throw new Error('You’re offline. Connect to change your photo.')
      const { storage, sdk } = await lazyStorage()
      const r = sdk.ref(storage, `avatars/${userId}/${uid()}.jpg`)
      await sdk.uploadBytes(r, jpeg, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' })
      return sdk.getDownloadURL(r)
    },
    async getProfile(id) {
      const s = await getDoc(doc(db, 'users', id))
      return s.exists() ? (s.data() as UserProfile) : null
    },
    async getMemberProfile(groupId, userId) {
      const s = await getDoc(memberProfileRef(groupId, userId))
      return s.exists() ? (s.data() as MemberProfile) : null
    },

    watchGroups(userId, cb) {
      const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', userId))
      let last: Group[] | undefined
      return onSnapshot(q, { includeMetadataChanges: true }, (s) => {
        if (!last || s.docChanges().length) last = s.docs.map((d) => ({ ...(d.data() as Group), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)
        cb(last, metaOf(s))
      }, (e) => { cb([], FAILED); errors.emit('read', e, 'Loading your groups') })
    },
    watchGroup(id, cb) {
      return onSnapshot(groupRef(id), (s) => cb(s.exists() ? { ...(s.data() as Group), id: s.id } : null, metaOf(s)), listenError('Loading group', () => cb(null, FAILED)))
    },
    async createGroup(g) {
      const id = uid('g_')
      const now = Date.now()
      const code = g.type === 'personal' ? inviteCode() : await uniqueInviteCode()
      const full: Group = { ...g, id, inviteCode: code, createdAt: now, updatedAt: now }
      const me = await myMemberProfile()
      const batch = writeBatch(db)
      batch.set(groupRef(id), full)
      if (g.type !== 'personal') batch.set(inviteRef(code), inviteDoc(full))
      if (me && auth.currentUser) batch.set(memberProfileRef(id, auth.currentUser.uid), me)
      fire(batch, 'Creating group')
      return id
    },
    async updateGroupSettings(base, patch) {
      const changed = changedSettings(base, patch)
      if (!Object.keys(changed).length) return
      const data: Record<string, unknown> = { updatedAt: Date.now() }
      for (const [k, v] of Object.entries(changed)) data[k] = v === undefined ? deleteField() : v
      const batch = writeBatch(db)
      batch.update(groupRef(base.id), data)
      if (base.type !== 'personal' && ('name' in changed || 'emoji' in changed)) {
        batch.set(inviteRef(base.inviteCode), { groupId: base.id, groupName: changed.name ?? base.name, emoji: changed.emoji ?? base.emoji }, { merge: true })
      }
      fire(batch, 'Saving group')
    },
    async updateGroup(id, patch) {
      const { members: _m, memberUids: _u, id: _i, inviteCode: _c, createdBy: _b, createdAt: _a, updatedAt: _t, ...settings } = patch
      let base: Group | null = null
      try {
        const s = await getDocFromCache(groupRef(id))
        if (s.exists()) base = { ...(s.data() as Group), id }
      } catch { /* not cached */ }
      if (base) return repo.updateGroupSettings(base, settings as GroupSettings)
      const batch = writeBatch(db)
      batch.update(groupRef(id), { ...settings, updatedAt: Date.now() })
      fire(batch, 'Saving group')
    },
    async addMember(group, memberId, member) {
      const batch = writeBatch(db)
      batch.update(groupRef(group.id), {
        [`members.${memberId}`]: member,
        ...(member.uid ? { memberUids: arrayUnion(member.uid) } : {}),
        memberOpId: memberId,
        updatedAt: Date.now(),
      })
      if (!member.uid && group.type !== 'personal') {
        batch.set(inviteRef(group.inviteCode), { groupId: group.id, placeholders: { [memberId]: member.name } }, { merge: true })
      }
      log(batch, group.id, memberActivity('added', memberId, member.name, await actCtx(group.id, undefined, group)))
      fire(batch, `Adding ${member.name}`)
    },
    async removeMember(group, memberId) {
      const m = group.members[memberId]
      const ctx = await actCtx(group.id, undefined, group)
      const batch = writeBatch(db)
      // Rules check membership as it was before the batch, so leaving can still log.
      if (m) log(batch, group.id, memberActivity('removed', memberId, m.name, ctx, m.uid === me()))
      batch.update(groupRef(group.id), {
        [`members.${memberId}`]: deleteField(),
        ...(m?.uid ? { memberUids: arrayRemove(m.uid) } : {}),
        memberOpId: memberId,
        updatedAt: Date.now(),
      })
      if (group.type !== 'personal') {
        batch.set(inviteRef(group.inviteCode), { groupId: group.id, placeholders: { [memberId]: deleteField() } }, { merge: true })
      }
      if (m?.uid) batch.delete(memberProfileRef(group.id, m.uid))
      fire(batch, `Removing ${m?.name ?? 'member'}`)
    },
    async deleteGroup(id) {
      // Listing the sub-collections needs the server; offline the deletion would never finish.
      if (!online()) throw new Error('You’re offline. Connect to delete a group.')
      const s = await getDoc(groupRef(id))
      const g = s.exists() ? (s.data() as Group) : null
      const refs: DocumentReference[] = []
      const receipts: string[] = []
      const expenses: DocumentReference[] = []
      for (const sub of ['expenses', 'settlements', 'profiles']) {
        const docs = await getDocs(collection(db, 'groups', id, sub))
        for (const d of docs.docs) {
          refs.push(d.ref)
          if (sub === 'expenses') {
            expenses.push(d.ref)
            const p = receiptOf(id, d.data() as Expense)
            if (p) receipts.push(p)
          }
        }
      }
      // Comments after their expenses: rules let a member delete others' comments only once
      // the parent expense is gone (batches commit in order). Still before the group goes.
      // Listed 20 expenses at a time rather than one awaited query per expense.
      for (let i = 0; i < expenses.length; i += 20) {
        const lists = await Promise.all(expenses.slice(i, i + 20).map((e) => getDocs(commentsCol(id, e.id)).catch(() => null)))
        for (const l of lists) for (const c of l?.docs ?? []) refs.push(c.ref)
      }
      // Receipts first (storage rules check membership, which ends with the group). Best effort.
      if (receipts.length) {
        const { storage, sdk } = await lazyStorage()
        await Promise.race([Promise.allSettled(receipts.map((p) => sdk.deleteObject(sdk.ref(storage, p)))), sleep(5000)])
      }
      // Sub-collection docs in ≤450-write batches; the group and its invite go in the last one,
      // so the earlier batches still pass the membership checks.
      for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db)
        refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r))
        fire(batch, 'Deleting group')
      }
      // The activity log is append-only: rules let the creator delete it only in the batch
      // that deletes the group itself. (Entries beyond one batch are left orphaned and unreadable.)
      const activity = (await getDocs(activityCol(id)).catch(() => null))?.docs.map((d) => d.ref) ?? []
      const last = writeBatch(db)
      activity.slice(0, BATCH_LIMIT - 2).forEach((r) => last.delete(r))
      if (g?.inviteCode && g.type !== 'personal') last.delete(inviteRef(g.inviteCode))
      last.delete(groupRef(id))
      fire(last, 'Deleting group')
    },

    async getInvite(code) {
      const s = await getDoc(inviteRef(code.toUpperCase()))
      if (!s.exists()) return null
      const d = s.data() as InviteInfo
      return { ...d, placeholders: d.placeholders ?? {} }
    },
    async joinGroup(code, memberId, member) {
      const c = code.toUpperCase()
      const invite = await repo.getInvite(c)
      if (!invite) throw new Error('Invite not found')
      // Tapping an invite link twice: the rules refuse a second join, so don't try one.
      const known = await cachedGroup(invite.groupId)
      if (member.uid && known?.memberUids.includes(member.uid)) return invite.groupId
      const me = await myMemberProfile()
      const batch = writeBatch(db)
      // Non-members cannot read the group, so this is a blind update validated by security rules.
      batch.update(groupRef(invite.groupId), {
        memberUids: arrayUnion(member.uid),
        [`members.${memberId}`]: member,
        joinCode: c,
        joinMemberId: memberId,
        updatedAt: Date.now(),
      })
      batch.set(inviteRef(c), { groupId: invite.groupId, placeholders: { [memberId]: deleteField() } }, { merge: true })
      if (me && member.uid) batch.set(memberProfileRef(invite.groupId, member.uid), me)
      // The local cache can't show a group we can't read yet, so wait for the server — but not forever.
      const commit = batch.commit()
      const result = await Promise.race([commit.then(() => 'ok' as const), sleep(8000).then(() => 'slow' as const)])
      if (result === 'slow') commit.catch((e) => errors.emit('write', e, 'Joining group'))
      return invite.groupId
    },

    watchExpenses(groupId, cb) {
      return watchList(collection(db, 'groups', groupId, 'expenses'), (s) => s.docs.map((d) => ({ ...(d.data() as Expense), id: d.id, groupId })).sort(byDateDesc), cb, 'Loading expenses')
    },
    async saveExpense(e) {
      const r = expenseRef(e.groupId, e.id)
      // An edit starts from the newest copy we can get, so the activity entry's "before" is right
      // and only what really changed is written (a full set would wipe a flag or approval that
      // landed on the server after this device's copy).
      const [prev, group] = await Promise.all([latest<Expense>(r), cachedGroup(e.groupId)])
      const next = prepareExpenseSave(prev, { ...e, receiptPath: e.receiptPath ?? storagePathFromUrl(e.receiptUrl) }, group ?? {}, me())
      const batch = writeBatch(db)
      if (!prev) batch.set(r, next)
      else {
        const patch = expenseEditPatch(prev, next)
        const data: Record<string, unknown> = { ...patch.set, updatedAt: next.updatedAt }
        for (const k of patch.unset) data[k] = deleteField()
        // The rules only let an edit remove approvals (never add or change), which is all this does.
        if (patch.approvals !== undefined) data.approvals = patch.approvals ?? deleteField()
        batch.update(r, data)
      }
      batch.update(groupRef(e.groupId), { updatedAt: Date.now() })
      log(batch, e.groupId, expenseSaveActivity(prev, next, await actCtx(e.groupId, next, group)))
      fire(batch, `Saving “${e.description}”`)
    },
    async deleteExpense(groupId, id) {
      const r = expenseRef(groupId, id)
      const e = await cached<Expense>(r)
      // Already in the trash: a second delete would make the caller its deleter (who may purge it).
      if (e?.deletedAt) return
      const batch = writeBatch(db)
      batch.update(r, { deletedAt: Date.now(), deletedBy: me() })
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (e) log(batch, groupId, expenseEventActivity('deleted', e, await actCtx(groupId, e)))
      fire(batch, 'Deleting expense')
    },
    async restoreExpense(groupId, id) {
      const r = expenseRef(groupId, id)
      const e = await cached<Expense>(r)
      const batch = writeBatch(db)
      batch.update(r, { deletedAt: deleteField(), deletedBy: deleteField() })
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (e) log(batch, groupId, expenseEventActivity('restored', e, await actCtx(groupId, e)))
      fire(batch, 'Restoring expense')
    },
    async purgeExpense(groupId, id) {
      const r = expenseRef(groupId, id)
      const e = await cached<Expense>(r)
      const receipt = receiptOf(groupId, e)
      // Comments go in the same batch (rules allow deleting others' comments once the parent is gone).
      const comments = await Promise.race([
        getDocsFromCache(commentsCol(groupId, id)).then((s) => s.docs.map((d) => d.ref)).catch(() => [] as DocumentReference[]),
        sleep(2000).then(() => [] as DocumentReference[]),
      ])
      if (online() && !comments.length) {
        const fromServer = await Promise.race([
          getDocs(commentsCol(groupId, id)).then((s) => s.docs.map((d) => d.ref)).catch(() => [] as DocumentReference[]),
          sleep(4000).then(() => [] as DocumentReference[]),
        ])
        comments.push(...fromServer)
      }
      const batch = writeBatch(db)
      comments.slice(0, BATCH_LIMIT - 3).forEach((c) => batch.delete(c))
      batch.delete(r)
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (e) log(batch, groupId, expenseEventActivity('purged', e, await actCtx(groupId, e)))
      fire(batch, 'Deleting expense')
      // Any overflow (or comments we couldn't list) can still be removed afterwards: the expense is gone.
      for (let i = BATCH_LIMIT - 3; i < comments.length; i += BATCH_LIMIT) {
        const b = writeBatch(db)
        comments.slice(i, i + BATCH_LIMIT).forEach((c) => b.delete(c))
        fire(b, 'Deleting comments')
      }
      deleteFileLater(receipt)
    },
    async flagExpense(group, e, reason) {
      const memberId = Object.entries(group.members).find(([, m]) => m.uid === me())?.[0]
      if (!memberId) throw new Error('You are not a member of this group')
      const text = reason.trim().slice(0, 500) || 'Something looks wrong'
      const batch = writeBatch(db)
      // Only our own key in the map changes (rules: diff().affectedKeys() == [uid]).
      batch.update(expenseRef(group.id, e.id), new FieldPath('dispute', me()), { byUid: me(), memberId, reason: text, at: Date.now() })
      log(batch, group.id, disputeActivity('disputed', e, await actCtx(group.id, e, group), text))
      fire(batch, `Flagging “${e.description}”`)
    },
    async resolveFlag(group, e) {
      const batch = writeBatch(db)
      batch.update(expenseRef(group.id, e.id), new FieldPath('dispute', me()), deleteField())
      log(batch, group.id, disputeActivity('resolved', e, await actCtx(group.id, e, group)))
      fire(batch, 'Resolving flag')
    },
    async approveExpense(group, e) {
      const batch = writeBatch(db)
      batch.update(expenseRef(group.id, e.id), new FieldPath('approvals', me()), true)
      log(batch, group.id, disputeActivity('approved', e, await actCtx(group.id, e, group)))
      fire(batch, `Approving “${e.description}”`)
    },
    attachReceipt(groupId, expenseId, file) {
      if (!online()) return false
      const r = doc(db, 'groups', groupId, 'expenses', expenseId)
      ;(async () => {
        const [blob, { storage, sdk }] = await Promise.all([downscale(file, 1600, 0.8), lazyStorage()])
        const path = `receipts/${groupId}/${expenseId}-${uid()}.jpg`
        const fileRef = sdk.ref(storage, path)
        await sdk.uploadBytes(fileRef, blob, { contentType: 'image/jpeg' })
        const url = await sdk.getDownloadURL(fileRef)
        // The image being replaced, if this expense owns one (never another expense's or the template's).
        const old = receiptOf(groupId, await cached<Expense>(r))
        const batch = writeBatch(db)
        batch.update(r, { receiptUrl: url, receiptPath: path })
        fire(batch, 'Attaching receipt')
        if (old && old !== path) deleteFileLater(old)
      })().catch((e) => errors.emit('write', e, 'Receipt upload failed (the expense was saved without it)'))
      return true
    },
    async uploadReceipt(groupId, file) {
      const [blob, { storage, sdk }] = await Promise.all([downscale(file, 1600, 0.8), lazyStorage()])
      const r = sdk.ref(storage, `receipts/${groupId}/${uid()}.jpg`)
      await sdk.uploadBytes(r, blob, { contentType: 'image/jpeg' })
      return sdk.getDownloadURL(r)
    },

    watchSettlements(groupId, cb) {
      return watchList(collection(db, 'groups', groupId, 'settlements'), (s) => s.docs.map((d) => ({ ...(d.data() as Settlement), id: d.id, groupId })).sort(byDateDesc), cb, 'Loading payments')
    },
    async saveSettlement(st) {
      const r = settlementRef(st.groupId, st.id)
      const prev = await cached<Settlement>(r)
      const batch = writeBatch(db)
      batch.set(r, st)
      batch.update(groupRef(st.groupId), { updatedAt: Date.now() })
      if (!prev) log(batch, st.groupId, settlementActivity('created', st, await actCtx(st.groupId)))
      fire(batch, 'Recording payment')
    },
    async deleteSettlement(groupId, id) {
      const r = settlementRef(groupId, id)
      const s = await cached<Settlement>(r)
      if (s?.deletedAt) return
      const batch = writeBatch(db)
      batch.update(r, { deletedAt: Date.now(), deletedBy: me() })
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (s) log(batch, groupId, settlementActivity('deleted', s, await actCtx(groupId)))
      fire(batch, 'Deleting payment')
    },
    async restoreSettlement(groupId, id) {
      const r = settlementRef(groupId, id)
      const s = await cached<Settlement>(r)
      const batch = writeBatch(db)
      batch.update(r, { deletedAt: deleteField(), deletedBy: deleteField() })
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (s) log(batch, groupId, settlementActivity('restored', s, await actCtx(groupId)))
      fire(batch, 'Restoring payment')
    },
    async purgeSettlement(groupId, id) {
      const r = settlementRef(groupId, id)
      const s = await cached<Settlement>(r)
      const batch = writeBatch(db)
      batch.delete(r)
      batch.update(groupRef(groupId), { updatedAt: Date.now() })
      if (s) log(batch, groupId, settlementActivity('purged', s, await actCtx(groupId)))
      fire(batch, 'Deleting payment')
    },

    watchActivity(groupId, cb, max = 50) {
      const entries = (s: QuerySnapshot) => s.docs.map((d) => ({ ...(d.data() as ActivityEntry), id: d.id, groupId }))
      return watchList(query(activityCol(groupId), orderBy('createdAt', 'desc'), limit(max)), entries, cb, 'Loading activity')
    },
    watchHistory(groupId, targetId, cb) {
      // Equality-only query: served by the automatic single-field index.
      const entries = (s: QuerySnapshot) => s.docs.map((d) => ({ ...(d.data() as ActivityEntry), id: d.id, groupId })).sort(byCreatedDesc)
      return watchList(query(activityCol(groupId), where('targetId', '==', targetId)), entries, cb, 'Loading history')
    },

    async saveRecurringOccurrences(template, occurrences) {
      const group = (await cachedGroup(template.groupId)) ?? {}
      const batch = writeBatch(db)
      for (const o of occurrences) batch.set(doc(db, 'groups', o.groupId, 'expenses', o.id), prepareOccurrence(o, group))
      // update (not set) so a concurrent edit to the template isn't clobbered, and so the
      // whole batch fails if the template was deleted meanwhile.
      batch.update(doc(db, 'groups', template.groupId, 'expenses', template.id), { recurrence: template.recurrence ?? deleteField() })
      if (occurrences.length) batch.update(groupRef(template.groupId), { updatedAt: Date.now() })
      fire(batch, `Adding recurring “${template.description}”`)
    },

    async bulkImport(groupId, expenses, settlements) {
      const group = await cachedGroup(groupId)
      const writes: Array<[DocumentReference, object]> = [
        // New rows: no trust fields; requiresApproval when the group asks for it (as for any create).
        ...expenses.map((e) => [expenseRef(groupId, e.id), prepareOccurrence({ ...e, groupId }, group ?? {})] as [DocumentReference, object]),
        ...settlements.map((st) => [settlementRef(groupId, st.id), prepareImportedSettlement({ ...st, groupId })] as [DocumentReference, object]),
      ]
      // One summary activity entry for the whole import, in the first batch.
      const entry = importActivity(groupId, expenses.length, settlements.length, expenses[0]?.importedFrom ?? settlements[0]?.importedFrom, await actCtx(groupId, undefined, group))
      writes.unshift([doc(activityCol(groupId)), compact(entry)])
      // One slot per batch for the group's updatedAt bump. Batches go out in order, so they
      // follow any createGroup/addMember batch fired just before (rules need the group first).
      const size = BATCH_LIMIT - 1
      for (let i = 0; i < writes.length; i += size) {
        const batch = writeBatch(db)
        for (const [r, data] of writes.slice(i, i + size)) batch.set(r, data)
        batch.update(groupRef(groupId), { updatedAt: Date.now() })
        fire(batch, `Importing (${Math.min(i + size, writes.length)} of ${writes.length})`)
      }
    },

    watchComments(groupId, expenseId, cb) {
      return watchList(commentsCol(groupId, expenseId), (s) => s.docs.map((d) => ({ ...(d.data() as ExpenseComment), id: d.id })).sort((a, b) => a.createdAt - b.createdAt), cb, 'Loading comments')
    },
    async addComment(groupId, expenseId, c) {
      const batch = writeBatch(db)
      batch.set(doc(commentsCol(groupId, expenseId)), c)
      fire(batch, 'Posting comment')
    },
    async deleteComment(groupId, expenseId, id) {
      const batch = writeBatch(db)
      batch.delete(doc(commentsCol(groupId, expenseId), id))
      fire(batch, 'Deleting comment')
    },

    watchCaptures(userId, cb) {
      let last: Capture[] | undefined
      let held: { list: Capture[]; meta: SnapMeta } | undefined
      let waited = false
      // Captures are written by the server (SMS webhook), so an empty local cache says nothing:
      // keep the screen loading until the server answers, unless the device is offline. But
      // "online" can mean a captive portal or a blocked backend, so after a few seconds the
      // cached list (maybe empty, flagged fromCache) is shown and the listener keeps waiting.
      const timer = setTimeout(() => {
        waited = true
        if (held) cb(held.list, held.meta)
        else if (!last) cb([], { fromCache: true, hasPendingWrites: false })
      }, CAPTURES_WAIT_MS)
      const unsub = onSnapshot(
        collection(db, 'users', userId, 'captures'),
        { includeMetadataChanges: true },
        (s) => {
          if (!last || s.docChanges().length) last = s.docs.map((d) => ({ ...(d.data() as Capture), id: d.id })).sort(byCreatedDesc)
          const meta = metaOf(s)
          if (s.empty && meta.fromCache && online() && !waited) { held = { list: last, meta }; return }
          held = undefined
          cb(last, meta)
        },
        (e) => { cb([], FAILED); errors.emit('read', e, 'Loading captured transactions') },
      )
      return () => { clearTimeout(timer); unsub() }
    },
    async saveCapture(userId, c) {
      const batch = writeBatch(db)
      batch.set(captureRef(userId, c.id), c)
      fire(batch, 'Saving capture')
    },
    async updateCapture(userId, id, patch) {
      const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]))
      const batch = writeBatch(db)
      batch.update(captureRef(userId, id), { ...data, updatedAt: Date.now() })
      fire(batch, 'Updating capture')
    },
    async deleteCapture(userId, id) {
      const batch = writeBatch(db)
      batch.delete(captureRef(userId, id))
      fire(batch, 'Deleting capture')
    },

    watchCaptureTokens(userId, cb) {
      const q = query(collection(db, 'captureTokens'), where('uid', '==', userId))
      return watchList(q, (s) => s.docs.map((d) => ({ ...(d.data() as CaptureToken), token: d.id })).sort(byCreatedDesc), cb, 'Loading capture tokens')
    },
    async createCaptureToken(userId, opts = {}) {
      const token = newCaptureToken()
      const batch = writeBatch(db)
      batch.set(doc(db, 'captureTokens', token), compact({ uid: userId, createdAt: Date.now(), groupId: opts.groupId || undefined, label: opts.label?.slice(0, 60) || undefined }))
      fire(batch, 'Creating capture link')
      return token
    },
    async revokeCaptureToken(token) {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'captureTokens', token))
      fire(batch, 'Revoking capture link')
    },
    async submitToInbox(entry, id) {
      // Works signed out: the rules only check that the token exists and belongs to entry.uid.
      // Awaited on purpose — the guest page has no local view of the inbox, so it needs the ack.
      await setDoc(id ? doc(db, 'captureInbox', id) : doc(collection(db, 'captureInbox')), compact(entry))
    },
    async claimInbox(userId) {
      // Needs the server (the inbox is written by other devices); a no-op offline.
      if (!online()) return 0
      const s = await getDocs(query(collection(db, 'captureInbox'), where('uid', '==', userId)))
      let moved = 0
      for (const d of s.docs) {
        const draft = inboxToDraft(d.data() as InboxDoc, todayISO())
        const batch = writeBatch(db)
        // Same id as the inbox doc, so a retry after a partial failure can't duplicate.
        if (draft) { batch.set(captureRef(userId, d.id), draftToCapture(draft, d.id)); moved++ }
        else console.warn('Dropping unreadable capture', d.id, d.data())
        batch.delete(d.ref)
        fire(batch, 'Syncing captured transactions')
      }
      return moved
    },
    async createTable(t) {
      const code = await uniqueCode(tableRef)
      const now = Date.now()
      const full: LiveTable = { ...t, code, claims: {}, status: 'open', createdAt: now, expiresAt: now + TABLE_TTL_MS }
      const batch = writeBatch(db)
      batch.set(tableRef(code), compact(full))
      fire(batch, 'Starting the table')
      return code
    },
    watchTable(code, cb) {
      return onSnapshot(
        tableRef(code),
        (s) => cb(s.exists() ? { ...(s.data() as LiveTable), code: s.id, claims: (s.data() as LiveTable).claims ?? {} } : null, metaOf(s)),
        // Closed or expired tables stop being readable for guests: show "not found", no toast.
        listenError('Loading the table', () => cb(null, FAILED)),
      )
    },
    async joinTable(code, pid, p) {
      const batch = writeBatch(db)
      batch.update(tableRef(code), { [`participants.${pid}`]: compact(p) })
      fire(batch, 'Joining the table')
    },
    async setTableClaims(code, pid, claims) {
      const batch = writeBatch(db)
      batch.update(tableRef(code), { [`claims.${pid}`]: claims })
      fire(batch, 'Saving your items')
    },
    async updateTable(code, patch) {
      const batch = writeBatch(db)
      batch.update(tableRef(code), tablePatchFields(patch, deleteField))
      fire(batch, 'Updating the table')
    },
    async deleteTable(code) {
      const batch = writeBatch(db)
      batch.delete(tableRef(code))
      fire(batch, 'Deleting the table')
    },

    async getFxRates(date) {
      if (!auth.currentUser) return null
      try {
        const s = await getDoc(doc(db, 'fxRates', date))
        const d = s.data() as FxRatesDoc | undefined
        return d && typeof d.date === 'string' && d.rates && typeof d.fetchedAt === 'number' ? d : null
      } catch (e) {
        console.warn('Shared rates unavailable', e)
        return null
      }
    },
    async refreshFx(date) {
      if (!auth.currentUser || !online()) return null
      try {
        const call = await callable<{ date?: string }, FxRefreshResult>('refreshFx', 15_000)
        return (await call(date ? { date } : {})).data ?? null
      } catch (e) {
        console.warn('refreshFx failed', e)
        return null
      }
    },
    async readReceiptAi(image, mimeType) {
      if (!auth.currentUser || auth.currentUser.isAnonymous || !online()) return null
      try {
        const call = await callable<{ kind: 'receipt'; image: string; mimeType: string }, { receipt?: ParsedReceipt | null; unavailable?: true; reason?: AiUnavailableReason }>('parseReceiptAi', 60_000)
        const d = (await call({ kind: 'receipt', image, mimeType })).data
        if (!d) return null
        return d.unavailable ? { unavailable: true, reason: d.reason } : { receipt: d.receipt ?? null }
      } catch (e) {
        console.warn('AI receipt reading failed', e)
        return null
      }
    },
    async readStatementAi(images, today) {
      if (!auth.currentUser || auth.currentUser.isAnonymous || !online()) return null
      try {
        const call = await callable<{ kind: 'statement'; images: typeof images; today: string }, { statement?: AiStatement | null; unavailable?: true }>('parseReceiptAi', 120_000)
        const d = (await call({ kind: 'statement', images, today })).data
        return d && !d.unavailable ? { statement: d.statement ?? null } : null
      } catch (e) {
        console.warn('AI statement reading failed', e)
        return null
      }
    },
    async aiKey(action, key, which = 'own') {
      const call = await callable<{ action: string; key?: string; which: string }, AiKeyResult>('aiKey', 30_000)
      return (await call(key ? { action, key, which } : { action, which })).data
    },
    async aiModels(which) {
      const call = await callable<{ which: string }, { models: AiModel[] }>('aiModels', 30_000)
      return (await call({ which })).data.models
    },
    async aiStatus() {
      try {
        const call = await callable<Record<string, never>, AiStatusResult>('aiStatus', 15_000)
        return (await call({})).data
      } catch (e) {
        console.warn('aiStatus failed', e)
        return null
      }
    },
    watchAiState(userId, cb) {
      return onSnapshot(doc(db, 'users', userId, 'aiState', 'status'), (s) => cb((s.data() as AiState | undefined) ?? null), () => cb(null))
    },
    watchAppAi(cb) {
      return onSnapshot(doc(db, 'config', 'ai'), (s) => cb(s.data() ?? null), () => cb(null))
    },
    async saveAppAi(cfg) {
      await setDoc(doc(db, 'config', 'ai'), { ...cfg, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid ?? '' })
    },
    async aiUsage(day) {
      const s = await getDoc(doc(db, 'stats', `ai_${day}`))
      return (s.data() as Record<string, number> | undefined) ?? null
    },
  }

  /** Loaded on first use; most sessions never call a function. */
  async function callable<I, O>(name: string, timeout: number) {
    const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import('firebase/functions')
    functions ??= getFunctions(app, 'asia-south1')
    if (useEmulators && !functionsEmulated) { connectFunctionsEmulator(functions, '127.0.0.1', 5001); functionsEmulated = true }
    return httpsCallable<I, O>(functions, name, { timeout })
  }
  return repo
}

/** Field-path update for a TablePatch (`null` entries and a null groupId are deleted). */
function tablePatchFields(patch: TablePatch, del: () => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of ['merchant', 'extras', 'status', 'expenseId', 'closedGroupId'] as const) if (patch[k] !== undefined) out[k] = patch[k]
  if (patch.groupId !== undefined) out.groupId = patch.groupId ?? del()
  for (const k of ['items', 'participants', 'claims'] as const) {
    for (const [id, v] of Object.entries(patch[k] ?? {})) out[`${k}.${id}`] = v === null ? del() : k === 'participants' ? compact(v as object) : v
  }
  return out
}
