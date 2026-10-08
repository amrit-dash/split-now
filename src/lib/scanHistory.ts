import type { StatementTxn } from '@/data/repo'
import type { ParsedPayment, ParsedReceipt } from './ocr-parse'
import { appLocale } from './locale'
import { formatMoney, fromHundredths } from './money'

/**
 * Smart scan history: the last few scans of each kind on this device, so a bill or screenshot
 * that was already read can be re-opened instantly (no AI call, no OCR) and a re-pick of the same
 * image is spotted before it is read again.
 *
 * Stored per signed-in user in IndexedDB (thumbnails are small JPEG data URLs; a receipt also keeps
 * a ~1280px copy so it can still be attached to an expense). Everything here is a convenience: when
 * storage is missing (private mode, blocked site data) history is simply off.
 */

export type ScanKind = 'receipt' | 'payment' | 'statement' | 'bill'

/** How many scans are kept per kind. */
export const HISTORY_LIMIT = 10

export interface ScanPrint {
  /** SHA-256 of the file bytes (hex): the very same file picked again */
  sha: string
  /**
   * SHA-256 of the decoded pixels at 160px wide, without the top 7% (hex): the same screenshot
   * saved again or re-taken with a different clock in the status bar
   */
  pix?: string
  /** 144-bit perceptual (DCT) hash of a 64×64 greyscale copy (hex): a re-shot photo of the same bill */
  phash: string
  /** width / height */
  ratio: number
}

export interface ScanOutcome {
  /** e.g. "Added 4 to Goa trip" */
  label: string
  href?: string
  at: number
}

export type ScanResult =
  | { type: 'receipt'; receipt: ParsedReceipt }
  | { type: 'payment'; payment: ParsedPayment; text?: string }
  | { type: 'statement'; currency: string; transactions: StatementTxn[] }

export interface ScanEntry {
  id: string
  kind: ScanKind
  /** ms epoch */
  at: number
  /** small JPEG data URL (~200px) */
  thumb: string
  /** one per image (a statement can be several screenshots) */
  prints: ScanPrint[]
  result: ScanResult
  outcome?: ScanOutcome
  /** a larger copy of the image, kept for receipts so they can still be attached */
  image?: Blob
}

// ---- List maintenance (pure) -----------------------------------------------------------

/** Put a scan at the front. One that matches it (same images) is replaced, and the list is capped. */
export function addEntry(list: ScanEntry[], entry: ScanEntry, limit = HISTORY_LIMIT): ScanEntry[] {
  const rest = list.filter((e) => e.id !== entry.id && !samePrints(e.prints, entry.prints, entry.kind))
  return [entry, ...rest].sort((a, b) => b.at - a.at).slice(0, limit)
}

export function removeEntry(list: ScanEntry[], id: string): ScanEntry[] {
  return list.filter((e) => e.id !== id)
}

export function withOutcome(list: ScanEntry[], id: string, outcome: ScanOutcome): ScanEntry[] {
  return list.map((e) => (e.id === id ? { ...e, outcome } : e))
}

// ---- Matching (pure) -------------------------------------------------------------------

/** Bits that differ between two equal-length hex strings (Infinity when they can't be compared). */
export function hamming(a: string, b: string): number {
  if (!a || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) { d += x & 1; x >>= 1 }
  }
  return d
}

/** Photos of paper bills: a re-shot photo is close, not identical. Screenshots are not compared this way. */
export const isPhoto = (kind: ScanKind) => kind === 'receipt' || kind === 'bill'

/**
 * How many of the 144 hash bits may differ and still count as "the same bill". A slightly moved
 * re-shot is ~20–30 bits away; another bill on the same table with the same framing ~45; unrelated
 * images ~70. A false match only costs a tap: the prompt shows the old thumbnail, says "looks like",
 * and the user can scan again.
 */
export const PHOTO_THRESHOLD = 32

/** The very same file, or the same pixels (status bar aside). */
export function exactPrint(a: ScanPrint, b: ScanPrint): boolean {
  return !!((a.sha && a.sha === b.sha) || (a.pix && a.pix === b.pix))
}

/**
 * Same image? The very same file, or the same pixels (status bar aside), counts for every kind.
 * Screenshots of one app look alike at hash size, so only photos also match on the perceptual hash.
 */
export function samePrint(a: ScanPrint, b: ScanPrint, kind: ScanKind): boolean {
  if (exactPrint(a, b)) return true
  if (!isPhoto(kind)) return false
  if (!a.ratio || !b.ratio || Math.abs(a.ratio - b.ratio) / Math.max(a.ratio, b.ratio) > 0.12) return false
  return hamming(a.phash, b.phash) <= PHOTO_THRESHOLD
}

/** Every one of `picked` is in `prints` (order and extra images in the old scan don't matter). */
function covers(prints: ScanPrint[], picked: ScanPrint[], kind: ScanKind) {
  return picked.length > 0 && picked.every((p) => prints.some((q) => samePrint(p, q, kind)))
}
function samePrints(a: ScanPrint[], b: ScanPrint[], kind: ScanKind) {
  return a.length === b.length && covers(a, b, kind) && covers(b, a, kind)
}

export interface ScanMatch {
  entry: ScanEntry
  /** every picked image is the very same file / pixels (not just alike) */
  exact: boolean
}

/** The most recent scan that already contains every picked image, if any. */
export function findMatch(list: ScanEntry[], picked: ScanPrint[]): ScanMatch | undefined {
  const entry = [...list].sort((a, b) => b.at - a.at).find((e) => covers(e.prints, picked, e.kind))
  return entry && { entry, exact: picked.every((p) => entry.prints.some((q) => exactPrint(p, q))) }
}

/** Side of the greyscale square the perceptual hash is taken from, and of the low-frequency block kept. */
export const PHASH_SIZE = 64
const PHASH_K = 12
let cosTable: Float64Array | undefined

/**
 * N×N greyscale pixels (row-major, 0–255) → perceptual hash: the K×K lowest DCT frequencies,
 * each set when above their median. K² bits as hex (144 bits → 36 chars).
 */
export function phashFromGray(gray: ArrayLike<number>, n = PHASH_SIZE, k = PHASH_K): string {
  const cos = n === PHASH_SIZE && k === PHASH_K && cosTable ? cosTable : new Float64Array(k * n)
  if (cos !== cosTable) {
    for (let u = 0; u < k; u++) for (let x = 0; x < n; x++) cos[u * n + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))
    if (n === PHASH_SIZE && k === PHASH_K) cosTable = cos
  }
  // Separable DCT: rows first (n × k), then columns (k × k).
  const rows = new Float64Array(n * k)
  for (let y = 0; y < n; y++) for (let u = 0; u < k; u++) {
    let s = 0
    for (let x = 0; x < n; x++) s += gray[y * n + x] * cos[u * n + x]
    rows[y * k + u] = s
  }
  const co: number[] = []
  for (let v = 0; v < k; v++) for (let u = 0; u < k; u++) {
    let s = 0
    for (let y = 0; y < n; y++) s += rows[y * k + u] * cos[v * n + y]
    co.push(s)
  }
  const ac = co.slice(1).sort((a, b) => a - b)
  const median = ac[Math.floor(ac.length / 2)]
  let hex = ''
  for (let i = 0; i < co.length; i += 4) {
    let nib = 0
    for (let j = 0; j < 4; j++) nib = (nib << 1) | (i + j < co.length && co[i + j] > median ? 1 : 0)
    hex += nib.toString(16)
  }
  return hex
}

// ---- Describing a scan (pure) ----------------------------------------------------------

export interface ScanSummary { title: string; detail: string }

const money = (hundredths: number | undefined, cur: string) => (hundredths ? formatMoney(fromHundredths(hundredths, cur), cur) : undefined)

/** What a scan produced, for a history card: "Toit · ₹2,340 · 6 items". */
export function describeScan(e: Pick<ScanEntry, 'result'>, fallbackCurrency: string): ScanSummary {
  const r = e.result
  if (r.type === 'receipt') {
    const cur = r.receipt.currency ?? fallbackCurrency
    const n = r.receipt.items.length
    return {
      title: r.receipt.merchant ? titleCase(r.receipt.merchant) : 'Bill',
      detail: [money(r.receipt.total, cur) ?? 'No total', n ? `${n} item${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
    }
  }
  if (r.type === 'payment') {
    return { title: r.payment.payee ?? 'Payment', detail: [money(r.payment.amount, fallbackCurrency) ?? 'No amount', r.payment.method].filter(Boolean).join(' · ') }
  }
  const n = r.transactions.length
  const out = r.transactions.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
  return { title: `${n} transaction${n === 1 ? '' : 's'}`, detail: out ? `${money(out, r.currency)} out` : r.currency }
}

/** "today, 2:15 pm" / "yesterday" / "8 Oct" / "8 Oct 2025". */
export function scannedWhen(at: number, now = Date.now()): string {
  const d = new Date(at)
  const n = new Date(now)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(n) - day(d)) / 86400000)
  if (diff === 0) return `today, ${d.toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' })}`
  if (diff === 1) return 'yesterday'
  return d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) })
}

/** "You scanned this today, 2:15 pm" / "You scanned this on 8 Oct" ("Looks like one you scanned…" when only alike). */
export function scannedSentence(at: number, now = Date.now(), exact = true): string {
  const w = scannedWhen(at, now)
  return `${exact ? 'You scanned this' : 'Looks like one you scanned'} ${/^(today|yesterday)/.test(w) ? w : `on ${w}`}`
}

function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s
}

// ---- Storage ---------------------------------------------------------------------------

export interface HistoryStore {
  get(key: string): Promise<ScanEntry[] | undefined>
  set(key: string, list: ScanEntry[]): Promise<void>
  del(key: string): Promise<void>
}

/** In-memory store (tests). */
export function memoryStore(): HistoryStore {
  const m = new Map<string, ScanEntry[]>()
  return {
    async get(k) { return m.get(k) },
    async set(k, v) { m.set(k, v) },
    async del(k) { m.delete(k) },
  }
}

const DB = 'splitit-scans'
const STORE = 'history'

/** A tiny IndexedDB key → value store. Rejects when IndexedDB is unavailable. */
export function idbStore(): HistoryStore {
  let db: Promise<IDBDatabase> | undefined
  const open = () => (db ??= new Promise<IDBDatabase>((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('No IndexedDB'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error ?? new Error('IndexedDB blocked'))
    req.onblocked = () => rej(new Error('IndexedDB blocked'))
  }).catch((e) => { db = undefined; throw e }))
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
    get: (k) => run<ScanEntry[] | undefined>('readonly', (s) => s.get(k)),
    set: async (k, v) => { await run('readwrite', (s) => s.put(v, k)) },
    del: async (k) => { await run('readwrite', (s) => s.delete(k)) },
  }
}

let store: HistoryStore = idbStore()
/** Tests: swap the backing store. */
export function setHistoryStore(s: HistoryStore) { store = s }

const keyFor = (uid: string, kind: ScanKind) => `${uid}:${kind}`
const listeners = new Set<(key: string) => void>()
const changed = (k: string) => listeners.forEach((l) => l(k))

/** Called with the storage key whenever any user's history of any kind changes. */
export function onHistoryChange(fn: (key: string) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export { keyFor as historyKey }

/** The user's scans of this kind, newest first ([] when storage is unavailable). */
export async function loadHistory(uid: string, kind: ScanKind): Promise<ScanEntry[]> {
  try { return ((await store.get(keyFor(uid, kind))) ?? []).filter((e) => e && e.result) } catch { return [] }
}

async function update(uid: string, kind: ScanKind, fn: (list: ScanEntry[]) => ScanEntry[]): Promise<boolean> {
  try {
    const k = keyFor(uid, kind)
    await store.set(k, fn((await store.get(k)) ?? []))
    changed(k)
    return true
  } catch {
    return false
  }
}

export const saveScan = (uid: string, entry: ScanEntry) => update(uid, entry.kind, (l) => addEntry(l, entry))
export const deleteScan = (uid: string, kind: ScanKind, id: string) => update(uid, kind, (l) => removeEntry(l, id))
export const recordOutcome = (uid: string, kind: ScanKind, id: string, outcome: Omit<ScanOutcome, 'at'> & { at?: number }) =>
  update(uid, kind, (l) => withOutcome(l, id, { at: Date.now(), ...outcome }))

export async function clearHistory(uid: string, kind: ScanKind): Promise<void> {
  try { await store.del(keyFor(uid, kind)); changed(keyFor(uid, kind)) } catch { /* storage unavailable */ }
}

// ---- Images (browser only) ---------------------------------------------------------------

async function sha256Hex(b: Blob | BufferSource): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', b instanceof Blob ? await b.arrayBuffer() : b)
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
  } catch {
    return '' // crypto.subtle needs a secure context; the perceptual hash still works
  }
}

/** Fingerprint an image file: exact hash plus a perceptual one. */
export async function fingerprint(file: Blob): Promise<ScanPrint> {
  const [sha, bitmap] = await Promise.all([sha256Hex(file), createImageBitmap(file)])
  const ratio = bitmap.width / bitmap.height
  const canvas = (w: number, h: number) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    return { c, ctx }
  }
  // Pixels below the status bar, small enough to hash quickly.
  const pw = 160, ph = Math.max(1, Math.round(pw / ratio)), top = Math.round(ph * 0.07)
  const p = canvas(pw, ph)
  p.ctx.drawImage(bitmap, 0, 0, pw, ph)
  // Perceptual hash: two steps down so the small copy is a real average, not a sample.
  const mid = canvas(256, 256)
  mid.ctx.drawImage(bitmap, 0, 0, 256, 256)
  bitmap.close?.()
  const n = PHASH_SIZE
  const sq = canvas(n, n)
  sq.ctx.drawImage(mid.c, 0, 0, n, n)
  const px = sq.ctx.getImageData(0, 0, n, n).data
  const gray = new Float64Array(n * n)
  for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
  const pix = await sha256Hex(p.ctx.getImageData(0, top, pw, Math.max(1, ph - top)).data)
  return { sha, ...(pix ? { pix } : {}), phash: phashFromGray(gray), ratio: Math.round(ratio * 1000) / 1000 }
}

/** A small JPEG data URL of an image (longest side `max` px). */
export async function thumbnail(file: Blob, max = 200, quality = 0.6): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bitmap.width * scale))
  c.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close?.()
  return c.toDataURL('image/jpeg', quality)
}

/** data: URL → Blob (to hand a stored image on as a File). */
export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',', 2)
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const bin = atob(body ?? '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** The best image a history entry has, as a File (for the expense form's receipt attachment). */
export function entryFile(e: ScanEntry): File {
  const blob = e.image ?? dataUrlToBlob(e.thumb)
  return new File([blob], `scan-${e.id}.jpg`, { type: blob.type || 'image/jpeg' })
}
