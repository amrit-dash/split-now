/*
 * Data access for the admin console. The console is admin-only and Firebase-only, so this talks
 * to Firestore and the admin callables directly (loaded on first use) instead of widening the
 * Repo interface every screen carries. Rules keep non-admins out of everything here.
 *   config/app, config/limits   watched and written (toAppConfigDoc / resolveLimits shape them)
 *   adminStats / adminUsers / adminBlockUser   callables in functions/src/admin.ts
 */
import type { Limits } from '../../../shared/limits'
import { LIMIT_NAMES } from '../../../shared/limits'

export type Unsub = () => void

async function sdk() {
  const [{ getApp }, f] = await Promise.all([import('firebase/app'), import('firebase/firestore')])
  return { app: getApp(), f, db: f.getFirestore(getApp()) }
}

/** The signed-in admin's uid, for the `updatedBy` audit field. */
async function me(): Promise<string> {
  const [{ getApp }, { getAuth }] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  return getAuth(getApp()).currentUser?.uid ?? ''
}

/** Watch one config document; `raw` is undefined while the first server answer is pending, null when the document is missing. */
export function watchConfig(id: 'app' | 'limits', cb: (raw: unknown, meta: { fromCache: boolean; error?: boolean }) => void): Unsub {
  let unsub: Unsub | null = null
  let cancelled = false
  void sdk()
    .then(({ f, db }) => {
      if (cancelled) return
      unsub = f.onSnapshot(
        f.doc(db, 'config', id),
        { includeMetadataChanges: true },
        (s) => cb(s.exists() ? s.data() : null, { fromCache: s.metadata.fromCache }),
        (e) => {
          console.warn(`config/${id}`, e)
          cb(null, { fromCache: false, error: true })
        },
      )
    })
    .catch((e) => {
      console.warn(`config/${id}`, e)
      cb(null, { fromCache: false, error: true })
    })
  return () => {
    cancelled = true
    unsub?.()
  }
}

/** Replace config/{id}. Rules validate every field (admins only). */
export async function saveConfig(id: 'app' | 'limits', data: Record<string, unknown>): Promise<void> {
  const { f, db } = await sdk()
  await f.setDoc(f.doc(db, 'config', id), data)
}

/** The limits document the console writes: only the known names, plus the audit fields. */
export async function limitsDoc(l: Limits): Promise<Record<string, unknown>> {
  const doc: Record<string, unknown> = {}
  for (const k of LIMIT_NAMES) doc[k] = l[k]
  doc.updatedAt = Date.now()
  doc.updatedBy = await me()
  return doc
}

let functionsEmulated = false
async function call<I, O>(name: string, data: I, timeout = 30_000): Promise<O> {
  const { app } = await sdk()
  const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import('firebase/functions')
  const functions = getFunctions(app, 'asia-south1')
  if (import.meta.env.VITE_USE_EMULATORS === 'true' && !functionsEmulated) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    functionsEmulated = true
  }
  return (await httpsCallable<I, O>(functions, name, { timeout })(data)).data
}

export interface DayStats {
  day: string
  ai: Record<string, number>
  capture: Record<string, number>
  push: Record<string, number>
  nudge: Record<string, number>
}
export interface AdminStats {
  today: string
  days: DayStats[]
  totals: { users: number | null; usersTruncated: boolean; groups: number; activeGroups: number; blocked: number }
}
export const adminStats = (days: number) => call<{ days: number }, AdminStats>('adminStats', { days }, 60_000)

export interface BlockInfo {
  reason: string
  at: number
  by: string
}
export interface AdminUser {
  uid: string
  email: string | null
  name: string | null
  photo: string | null
  disabled: boolean
  createdAt: number | null
  lastSignInAt: number | null
  providers: string[]
  blocked: BlockInfo | null
}
export const adminUsers = (q: string, limit = 20) =>
  call<{ q: string; limit: number }, { users: AdminUser[]; truncated: boolean }>('adminUsers', { q, limit }, 60_000)

export const adminBlockUser = (uid: string, block: boolean, reason?: string) =>
  call<{ uid: string; block: boolean; reason?: string }, { uid: string; blocked: boolean; authUpdated: boolean }>('adminBlockUser', { uid, block, reason })
