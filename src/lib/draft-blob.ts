import { uid } from '@/lib/id'

/**
 * The receipt photo of an unsaved expense draft, kept on this device so a reload doesn't make the
 * person scan the bill again. The draft itself is in sessionStorage (src/lib/expense-draft.ts),
 * which can't hold a File; the image goes to IndexedDB under a key the stored draft points at.
 *
 * Everything here is best effort: with no IndexedDB (private mode, blocked site data) or no room
 * (quota), puts and gets quietly do nothing and the form behaves as before (re-scan after a reload).
 * IndexedDB outlives the tab while sessionStorage doesn't, so stale entries expire and the store
 * keeps only a few, newest first.
 */

/** How long a kept image may wait for its draft; a tab left longer than this re-scans. */
export const DRAFT_BLOB_TTL = 3 * 24 * 60 * 60 * 1000
/** Largest image kept (the share path caps at the same 15 MB); the form downscales well below it. */
export const DRAFT_BLOB_MAX_BYTES = 15 * 1024 * 1024
/** At most this many images at once (other tabs, drafts whose tab was closed). */
export const DRAFT_BLOB_MAX_ENTRIES = 4

export interface DraftBlobRecord {
  blob: Blob
  name: string
  type: string
  at: number
}

/** The backing key → record store: IndexedDB in the app, a Map in tests. */
export interface DraftBlobStore {
  get(k: string): Promise<DraftBlobRecord | undefined>
  put(k: string, v: DraftBlobRecord): Promise<void>
  del(k: string): Promise<void>
  /** every key with its record's `at` (to sweep stale ones) */
  ages(): Promise<Array<[string, number]>>
}

/** A fresh key for one image of one draft route; a new scan gets a new key, so another tab's draft never picks it up. */
export const draftBlobKey = (draftKey: string, id = uid()) => `${draftKey}#${id}`

/** A key a stored draft may point at: one of ours, for this route. */
export const isDraftBlobKey = (k: unknown, draftKey: string): k is string =>
  typeof k === 'string' && k.startsWith(`${draftKey}#`) && k.length > draftKey.length + 1

export const isExpired = (at: number, now: number, ttl = DRAFT_BLOB_TTL) => !Number.isFinite(at) || at > now + 60_000 || now - at > ttl

export const fitsCap = (size: number, max = DRAFT_BLOB_MAX_BYTES) => size > 0 && size <= max

/** The keys to delete: the expired ones, then the oldest beyond `max` (keeping room for `keep`, the one being added). */
export function staleKeys(ages: Array<[string, number]>, now: number, max = DRAFT_BLOB_MAX_ENTRIES, keep?: string): string[] {
  const out = new Set<string>()
  const live: Array<[string, number]> = []
  for (const [k, at] of ages) {
    if (k === keep) continue
    if (isExpired(at, now)) out.add(k)
    else live.push([k, at])
  }
  live.sort((a, b) => b[1] - a[1])
  for (const [k] of live.slice(Math.max(0, max - (keep ? 1 : 0)))) out.add(k)
  return [...out]
}

/** In-memory store (tests). */
export function memoryBlobStore(): DraftBlobStore {
  const m = new Map<string, DraftBlobRecord>()
  return {
    get: async (k) => m.get(k),
    put: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    ages: async () => [...m].map(([k, v]) => [k, v.at]),
  }
}

const DB = 'splitit-drafts'
const STORE = 'receipts'

/** A tiny IndexedDB store. Rejects when IndexedDB is unavailable; callers swallow that. */
export function idbBlobStore(): DraftBlobStore {
  let db: Promise<IDBDatabase> | undefined
  const open = () =>
    (db ??= new Promise<IDBDatabase>((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('No IndexedDB'))
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error ?? new Error('IndexedDB blocked'))
      req.onblocked = () => rej(new Error('IndexedDB blocked'))
    }).catch((e) => {
      db = undefined
      throw e
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await open()
    return new Promise<T>((res, rej) => {
      const tx = d.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => res(req.result)
      tx.onerror = tx.onabort = () => rej(tx.error ?? new Error('IndexedDB error'))
    })
  }
  return {
    get: (k) => run<DraftBlobRecord | undefined>('readonly', (s) => s.get(k)),
    put: async (k, v) => {
      await run('readwrite', (s) => s.put(v, k))
    },
    del: async (k) => {
      await run('readwrite', (s) => s.delete(k))
    },
    ages: async () => {
      const d = await open()
      return new Promise((res, rej) => {
        const out: Array<[string, number]> = []
        const tx = d.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const c = req.result
          if (!c) return
          out.push([String(c.key), Number((c.value as Partial<DraftBlobRecord> | undefined)?.at)])
          c.continue()
        }
        tx.oncomplete = () => res(out)
        tx.onerror = tx.onabort = () => rej(tx.error ?? new Error('IndexedDB error'))
      })
    },
  }
}

let store: DraftBlobStore = idbBlobStore()
/** Tests: swap the backing store. */
export function setDraftBlobStore(s: DraftBlobStore) {
  store = s
}

async function sweep(now: number, keep?: string) {
  for (const k of staleKeys(await store.ages(), now, DRAFT_BLOB_MAX_ENTRIES, keep)) await store.del(k)
}

/**
 * Keep `blob` under `key`. Resolves true when it was stored; false when it is too big or storage
 * failed (the draft then simply doesn't point at an image).
 */
export async function putDraftBlob(key: string, blob: Blob, name: string, now = Date.now()): Promise<boolean> {
  if (!fitsCap(blob.size)) return false
  try {
    await sweep(now, key).catch(() => {})
    await store.put(key, { blob, name, type: blob.type, at: now })
    return true
  } catch {
    return false
  }
}

/** The image kept under `key` as a File, or null when it's missing, expired or unreadable. */
export async function getDraftBlob(key: string, now = Date.now()): Promise<File | null> {
  try {
    const r = await store.get(key)
    if (!r || !(r.blob instanceof Blob) || isExpired(r.at, now) || !fitsCap(r.blob.size)) {
      if (r) void store.del(key).catch(() => {})
      return null
    }
    // Copied into memory: the save deletes the stored record while the upload may still be reading the File.
    return new File([await r.blob.arrayBuffer()], r.name || 'receipt.jpg', { type: r.type || r.blob.type || 'image/jpeg', lastModified: r.at })
  } catch {
    return null
  }
}

/** Forget the image (draft cleared, discarded or saved). Never throws. */
export async function deleteDraftBlob(key: string | undefined): Promise<void> {
  if (!key) return
  try {
    await store.del(key)
  } catch {
    /* storage unavailable */
  }
}
