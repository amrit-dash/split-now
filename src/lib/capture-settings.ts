/*
 * Auto-capture settings and the capture activity log, for Profile → Auto-capture and the SMS
 * wizard.
 *
 * Firebase mode: settings live in users/{uid}/settings/notifications (via src/lib/push.ts) and
 * the log in one document, users/{uid}/captureLog/recent = { entries: [...] } (newest first,
 * written only by the capture webhook). Demo mode keeps both in localStorage, written by the
 * wizard's simulated webhook, so the UI can be tried offline.
 * Like push.ts, this never imports '@/data' and only loads the Firebase SDK in firebase mode.
 */
import { CAPTURE_LOG_DOC, CAPTURE_LOG_KEEP, MAX_MIN_AMOUNT, isLogResult, normaliseIgnoreWords, type CaptureLogEntry } from './capture-filters'
import { DEFAULT_ALL_PREFS, resolveAllPrefs, savePrefs, watchPrefs, type AllPrefs } from './push'

export type Mode = 'firebase' | 'demo'

const DEMO_EVENT = 'splitnow-capture-demo'
const prefsKey = (uid: string) => `splitnow-demo-capture-prefs:${uid}`
const logKey = (uid: string) => `splitnow-demo-capture-log:${uid}`
const usedKey = (uid: string) => `splitnow-demo-capture-used:${uid}`

function readJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : fallback
  } catch { return fallback }
}
function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode / storage full */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEMO_EVENT))
}
function onDemoChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(DEMO_EVENT, fn)
  return () => window.removeEventListener(DEMO_EVENT, fn)
}

// ---- Settings ---------------------------------------------------------------

export function watchCapturePrefs(uid: string, mode: Mode, cb: (p: AllPrefs) => void): () => void {
  if (mode === 'firebase') return watchPrefs(uid, cb)
  const emit = () => cb(resolveAllPrefs(readJson(prefsKey(uid), {})))
  emit()
  return onDemoChange(emit)
}

export async function saveCapturePrefs(uid: string, mode: Mode, patch: Partial<AllPrefs>): Promise<void> {
  if (mode === 'firebase') return savePrefs(uid, patch)
  writeJson(prefsKey(uid), { ...readJson(prefsKey(uid), {}), ...patch })
}

/** Demo-mode settings, for the simulated webhook. */
export const demoCapturePrefs = (uid: string): AllPrefs => resolveAllPrefs(readJson(prefsKey(uid), DEFAULT_ALL_PREFS))

// ---- Activity log -------------------------------------------------------------

export type LogRow = CaptureLogEntry & { id: string }

function cleanEntry(id: string, d: Record<string, unknown>): LogRow | undefined {
  if (typeof d.at !== 'number' || typeof d.result !== 'string' || !isLogResult(d.result)) return undefined
  const device = d.device === 'ios' || d.device === 'android' ? d.device : 'other'
  const row: LogRow = { id, at: d.at, result: d.result, device }
  if (typeof d.amount === 'number') row.amount = d.amount
  if (typeof d.currency === 'string') row.currency = d.currency
  if (typeof d.merchant === 'string') row.merchant = d.merchant
  if (typeof d.groupName === 'string') row.groupName = d.groupName
  return row
}

/** The `entries` array of the log document → rows, newest first, bad entries dropped. */
export function logRowsOf(raw: unknown, limit: number): LogRow[] {
  const entries = raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries) ? (raw as { entries: unknown[] }).entries : []
  return entries
    .map((e, i) => (e && typeof e === 'object' ? cleanEntry(`${(e as { at?: unknown }).at ?? 0}-${i}`, e as Record<string, unknown>) : undefined))
    .filter((x): x is LogRow => !!x)
    .slice(0, limit)
}

/** The newest `limit` log entries, newest first. Calls back with [] when unavailable. */
export function watchCaptureLog(uid: string, mode: Mode, cb: (rows: LogRow[]) => void, limit = 10): () => void {
  if (mode === 'demo') {
    const emit = () => cb(readJson<LogRow[]>(logKey(uid), []).slice(0, limit))
    emit()
    return onDemoChange(emit)
  }
  let unsub: (() => void) | undefined
  let stopped = false
  Promise.all([import('firebase/app'), import('firebase/firestore')]).then(([{ getApp }, f]) => {
    if (stopped) return
    const db = f.getFirestore(getApp())
    unsub = f.onSnapshot(f.doc(db, 'users', uid, 'captureLog', CAPTURE_LOG_DOC), (s) => cb(logRowsOf(s.data(), limit)), () => cb([]))
  }).catch(() => cb([]))
  return () => { stopped = true; unsub?.() }
}

/** Clear the log (the owner may delete the document; the webhook starts a new one). */
export async function clearCaptureLog(uid: string, mode: Mode, _rows?: LogRow[]): Promise<void> {
  if (mode === 'demo') { writeJson(logKey(uid), []); return }
  const [{ getApp }, f] = await Promise.all([import('firebase/app'), import('firebase/firestore')])
  const db = f.getFirestore(getApp())
  const batch = f.writeBatch(db)
  batch.delete(f.doc(db, 'users', uid, 'captureLog', CAPTURE_LOG_DOC))
  batch.commit().catch((e) => console.warn('Clearing capture activity failed', e))
}

/** Demo mode: what the webhook would log (keeps the newest CAPTURE_LOG_KEEP). */
export function appendDemoLog(uid: string, entry: CaptureLogEntry, token?: string) {
  const rows = readJson<LogRow[]>(logKey(uid), [])
  rows.unshift({ ...entry, id: `demo-${entry.at}-${Math.random().toString(36).slice(2, 8)}` })
  writeJson(logKey(uid), rows.slice(0, CAPTURE_LOG_KEEP))
  if (token) writeJson(usedKey(uid), { ...readJson<Record<string, number>>(usedKey(uid), {}), [token]: entry.at })
}

/** Demo mode stand-in for captureTokens/{token}.lastUsedAt (the server sets it in firebase mode). */
export const demoTokenUse = (uid: string): Record<string, number> => readJson(usedKey(uid), {})

// ---- Form helpers -----------------------------------------------------------

/** "150", "₹1,500.50" → paise; "" or junk → 0. Clamped to MAX_MIN_AMOUNT. */
export function rupeesToPaise(input: string): number {
  const n = Number(input.replace(/[₹,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.round(n * 100), MAX_MIN_AMOUNT)
}

/** paise → the input's text ("" for 0, no trailing .00). */
export function paiseToRupeesInput(p: number): string {
  if (!p) return ''
  const r = p / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

/** Add a keyword (dedupe, cap); returns the same array when nothing changed. */
export function addIgnoreWord(words: string[], word: string): string[] {
  const next = normaliseIgnoreWords([...words, word])
  return next.length === words.length ? words : next
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/**
 * Short lines describing the current capture settings, for the wizard's summary and the
 * collapsed section header.
 */
export function captureSettingsLines(p: Pick<AllPrefs, 'capturePaused' | 'outsideTrips' | 'minAmount' | 'ignoreWords' | 'captures' | 'unsorted'>, pausedTrips: string[] = []): string[] {
  if (p.capturePaused) return ['Paused: incoming SMS are ignored and nothing is stored']
  const lines = [p.outsideTrips ? 'All bank & UPI debits (outside trips go to the inbox)' : 'Only payments dated during a trip']
  if (p.minAmount > 0) lines.push(`Ignoring payments under ${rupees(p.minAmount)}`)
  if (p.ignoreWords.length) lines.push(`Ignoring ${p.ignoreWords.length} keyword${p.ignoreWords.length === 1 ? '' : 's'}: ${p.ignoreWords.slice(0, 4).join(', ')}${p.ignoreWords.length > 4 ? '…' : ''}`)
  if (pausedTrips.length) lines.push(`Paused for ${pausedTrips.join(', ')}`)
  lines.push(!p.captures ? 'No capture notifications' : p.outsideTrips && p.unsorted ? 'Notifies for every captured payment' : 'Notifies for trip payments')
  return lines
}
