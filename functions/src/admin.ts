import { getApps, initializeApp } from 'firebase-admin/app'
import type { UserRecord } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { adminChangeRefusal } from './lib/admin-core'
import { addDays, istDate } from './lib/time'

/*
 * Admin SDK handles. Firestore is needed by every function, so it loads eagerly; Messaging and
 * Auth are loaded on first use (esbuild turns the dynamic import into a deferred require), so
 * the AI and FX callables don't pay ~300 ms of cold start for modules they never touch.
 */
const app = () => getApps()[0] ?? initializeApp()
export const db = () => getFirestore(app())
export const messaging = async () => (await import('firebase-admin/messaging')).getMessaging(app())
export const auth = async () => (await import('firebase-admin/auth')).getAuth(app())
export const storage = async () => (await import('firebase-admin/storage')).getStorage(app())

// ---- Usage counters (stats/{kind}_{day}, admins read them) ------------------------------

export type StatKind = 'ai' | 'capture' | 'push' | 'nudge'
export const STAT_KINDS: StatKind[] = ['ai', 'capture', 'push', 'nudge']

/**
 * Bump counters on today's (IST) document for one kind of event: `countStats('push', { sent: 3,
 * dead: 1 })`. Zero fields are skipped; a failure is logged, never thrown (counters are not
 * worth failing a capture or a push over). AI reading has its own richer `record()` in ai.ts.
 */
export async function countStats(kind: StatKind, fields: Record<string, number>, now = Date.now()): Promise<void> {
  const day = istDate(new Date(now))
  const doc: Record<string, unknown> = { day }
  for (const [k, v] of Object.entries(fields)) if (Number.isFinite(v) && v > 0 && /^[a-z][a-z0-9_]{0,40}$/i.test(k)) doc[k] = FieldValue.increment(v)
  if (Object.keys(doc).length === 1) return
  await db()
    .collection('stats')
    .doc(`${kind}_${day}`)
    .set(doc, { merge: true })
    .catch((e) => logger.warn('stats', { kind, error: (e as Error).message }))
}

// ---- Admin console callables ------------------------------------------------------------
// admins/{uid} (created by hand in the Firebase console, or by an admin through adminSetAdmin) is
// the only thing that makes an admin;
// the same check the rules make. Table guests (anonymous) are never admins.

const isUid = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v)
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d)

async function requireAdmin(req: CallableRequest): Promise<string> {
  if (!req.auth || req.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in first')
  const uid = req.auth.uid
  if (!(await db().collection('admins').doc(uid).get()).exists) throw new HttpsError('permission-denied', 'Admins only')
  return uid
}

const callable = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 60, memory: '256MiB' as const, maxInstances: 2 }

export interface DayStats {
  day: string
  ai: Record<string, number>
  capture: Record<string, number>
  push: Record<string, number>
  nudge: Record<string, number>
}
export interface AdminStatsResult {
  today: string
  /** oldest first, one entry per day whether or not anything was counted */
  days: DayStats[]
  totals: {
    /** from Auth; null when the user list couldn't be read (the Auth emulator isn't running) */
    users: number | null
    /** true when there are more than the pages we read (10,000) */
    usersTruncated: boolean
    groups: number
    /** groups with a write in the last 7 days */
    activeGroups: number
    blocked: number
  }
}

const numericFields = (data: Record<string, unknown> | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(data ?? {}).filter((kv): kv is [string, number] => typeof kv[1] === 'number'))

/** Every account, counted through the Auth list API (there is no cheaper count). */
async function countUsers(): Promise<{ users: number | null; truncated: boolean }> {
  try {
    const a = await auth()
    let n = 0
    let token: string | undefined
    for (let page = 0; page < 10; page++) {
      const r = await a.listUsers(1000, token)
      n += r.users.length
      token = r.pageToken
      if (!token) return { users: n, truncated: false }
    }
    return { users: n, truncated: true }
  } catch (e) {
    logger.warn('listUsers failed', (e as Error).message)
    return { users: null, truncated: false }
  }
}

/** Callable { days?: 1..30 } → the last N days of counters plus a few totals (admins only). */
export const adminStats = onCall(callable, async (req): Promise<AdminStatsResult> => {
  await requireAdmin(req)
  const days = int((req.data as { days?: unknown } | null)?.days, 1, 30, 14)
  const now = Date.now()
  const today = istDate(new Date(now))
  const dayList = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)))
  const refs = dayList.flatMap((day) => STAT_KINDS.map((k) => db().collection('stats').doc(`${k}_${day}`)))
  const [snaps, groups, active, blocked, users] = await Promise.all([
    db().getAll(...refs),
    db().collection('groups').count().get(),
    db()
      .collection('groups')
      .where('updatedAt', '>', now - 7 * 86_400_000)
      .count()
      .get(),
    db().collection('blocked').count().get(),
    countUsers(),
  ])
  const byId = new Map(snaps.map((s) => [s.id, numericFields(s.data() as Record<string, unknown> | undefined)]))
  const pick = (k: StatKind, day: string) => {
    const d = { ...(byId.get(`${k}_${day}`) ?? {}) }
    delete d.day
    return d
  }
  return {
    today,
    days: dayList.map((day) => ({ day, ai: pick('ai', day), capture: pick('capture', day), push: pick('push', day), nudge: pick('nudge', day) })),
    totals: {
      users: users.users,
      usersTruncated: users.truncated,
      groups: groups.data().count,
      activeGroups: active.data().count,
      blocked: blocked.data().count,
    },
  }
})

export interface BlockInfo {
  reason: string
  at: number
  by: string
}
export interface AdminUserRow {
  uid: string
  email: string | null
  name: string | null
  photo: string | null
  /** Auth account disabled (blocking does this too) */
  disabled: boolean
  createdAt: number | null
  lastSignInAt: number | null
  providers: string[]
  blocked: BlockInfo | null
  /** admins/{uid} exists */
  admin: boolean
}

const ms = (s: string | undefined) => {
  const t = s ? Date.parse(s) : Number.NaN
  return Number.isNaN(t) ? null : t
}
const row = (u: UserRecord, blocked: BlockInfo | null, admin: boolean): AdminUserRow => ({
  uid: u.uid,
  email: u.email ?? null,
  name: u.displayName ?? null,
  photo: u.photoURL ?? null,
  disabled: u.disabled,
  createdAt: ms(u.metadata.creationTime),
  lastSignInAt: ms(u.metadata.lastSignInTime),
  providers: u.providerData.map((p) => p.providerId),
  blocked,
  admin,
})

async function blockedMap(uids: string[]): Promise<Map<string, BlockInfo>> {
  const out = new Map<string, BlockInfo>()
  if (!uids.length) return out
  const snaps = await db().getAll(...uids.map((u) => db().collection('blocked').doc(u)))
  for (const s of snaps) {
    const d = s.data()
    if (d && typeof d.reason === 'string')
      out.set(s.id, { reason: d.reason, at: typeof d.at === 'number' ? d.at : 0, by: typeof d.by === 'string' ? d.by : '' })
  }
  return out
}

async function adminSet(uids: string[]): Promise<Set<string>> {
  if (!uids.length) return new Set()
  const snaps = await db().getAll(...uids.map((u) => db().collection('admins').doc(u)))
  return new Set(snaps.filter((s) => s.exists).map((s) => s.id))
}

/**
 * Callable { q?: string, limit?: 1..50 } → accounts matching an email, uid or name (the newest
 * sign-ups when `q` is empty), with their block state. Reads at most 3,000 accounts per call.
 */
export const adminUsers = onCall(callable, async (req): Promise<{ users: AdminUserRow[]; truncated: boolean }> => {
  await requireAdmin(req)
  const d = (req.data ?? {}) as { q?: unknown; limit?: unknown }
  const q = (typeof d.q === 'string' ? d.q : '').trim().toLowerCase().slice(0, 100)
  const limit = int(d.limit, 1, 50, 20)
  const a = await auth()
  let found: UserRecord[] = []
  let truncated = false
  if (q.includes('@')) found = [await a.getUserByEmail(q).catch(() => null)].filter((u): u is UserRecord => !!u)
  else if (/^[A-Za-z0-9_-]{20,128}$/.test(q)) found = [await a.getUser(q).catch(() => null)].filter((u): u is UserRecord => !!u)
  if (!found.length) {
    let token: string | undefined
    for (let page = 0; page < 3; page++) {
      const r = await a.listUsers(1000, token)
      for (const u of r.users) {
        if (!q || [u.email, u.displayName, u.uid].some((s) => s?.toLowerCase().includes(q))) found.push(u)
      }
      token = r.pageToken
      if (!token) break
      if (page === 2) truncated = true
    }
    found.sort((x, y) => (ms(y.metadata.creationTime) ?? 0) - (ms(x.metadata.creationTime) ?? 0))
    found = found.slice(0, limit)
  }
  const uids = found.map((u) => u.uid)
  const [blocked, admins] = await Promise.all([blockedMap(uids), adminSet(uids)])
  return { users: found.map((u) => row(u, blocked.get(u.uid) ?? null, admins.has(u.uid))), truncated }
})

/**
 * Callable { uid, block: boolean, reason?: string } → { uid, blocked, authUpdated }.
 * Blocking writes blocked/{uid} (the rules then refuse every write by that account), disables
 * the Auth user and revokes their sessions, and drops their push and capture keys. Unblocking
 * reverses the first two. Admins can't block themselves or another admin.
 */
export const adminBlockUser = onCall(callable, async (req): Promise<{ uid: string; blocked: boolean; authUpdated: boolean }> => {
  const me = await requireAdmin(req)
  const d = (req.data ?? {}) as { uid?: unknown; block?: unknown; reason?: unknown }
  if (!isUid(d.uid)) throw new HttpsError('invalid-argument', 'Which account?')
  if (typeof d.block !== 'boolean') throw new HttpsError('invalid-argument', 'block must be true or false')
  const uid = d.uid
  const reason = (typeof d.reason === 'string' ? d.reason : '').trim().slice(0, 200)
  if (uid === me) throw new HttpsError('failed-precondition', 'You can’t block yourself')
  if ((await db().collection('admins').doc(uid).get()).exists) throw new HttpsError('failed-precondition', 'Remove their admin access first')
  const now = Date.now()
  const ref = db().collection('blocked').doc(uid)
  let authUpdated = false
  if (d.block) {
    await ref.set({ reason: reason || 'Blocked by an admin', at: now, by: me })
    try {
      const a = await auth()
      await a.updateUser(uid, { disabled: true })
      await a.revokeRefreshTokens(uid)
      authUpdated = true
    } catch (e) {
      logger.warn('block: auth update failed', { uid, error: (e as Error).message })
    }
    try {
      const [tokens, keys] = await Promise.all([
        db().collection('users').doc(uid).collection('pushTokens').select().get(),
        db().collection('captureTokens').where('uid', '==', uid).select().get(),
      ])
      const batch = db().batch()
      for (const t of [...tokens.docs, ...keys.docs]) batch.delete(t.ref)
      if (tokens.size + keys.size) await batch.commit()
    } catch (e) {
      logger.warn('block: token cleanup failed', { uid, error: (e as Error).message })
    }
  } else {
    await ref.delete()
    try {
      await (await auth()).updateUser(uid, { disabled: false })
      authUpdated = true
    } catch (e) {
      logger.warn('unblock: auth update failed', { uid, error: (e as Error).message })
    }
  }
  logger.info(d.block ? 'user blocked' : 'user unblocked', { uid, by: me })
  return { uid, blocked: !!d.block, authUpdated }
})

/**
 * Callable { uid, admin: boolean } → { uid, admin }. Makes an account an admin (writes
 * admins/{uid} = { at, by }) or removes that. Only a real account that has signed in (has a
 * users/{uid} profile, which live-table guests never get) and isn't blocked can be made one, and
 * no admin can remove their own access (adminChangeRefusal). Clients can never write admins/.
 */
export const adminSetAdmin = onCall(callable, async (req): Promise<{ uid: string; admin: boolean }> => {
  const me = await requireAdmin(req)
  const d = (req.data ?? {}) as { uid?: unknown; admin?: unknown }
  if (!isUid(d.uid)) throw new HttpsError('invalid-argument', 'Which account?')
  if (typeof d.admin !== 'boolean') throw new HttpsError('invalid-argument', 'admin must be true or false')
  const uid = d.uid
  const ref = db().collection('admins').doc(uid)
  const [adminSnap, profile, blocked] = await db().getAll(ref, db().collection('users').doc(uid), db().collection('blocked').doc(uid))
  const refusal = adminChangeRefusal({ me, uid, makeAdmin: d.admin, isAdmin: adminSnap.exists, hasProfile: profile.exists, blocked: blocked.exists })
  if (refusal) throw new HttpsError('failed-precondition', refusal)
  if (d.admin && !adminSnap.exists) await ref.set({ at: Date.now(), by: me })
  if (!d.admin && adminSnap.exists) await ref.delete()
  logger.info(d.admin ? 'admin added' : 'admin removed', { uid, by: me })
  return { uid, admin: d.admin }
})
