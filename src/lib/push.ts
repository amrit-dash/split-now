/*
 * FCM Web Push on our own service worker (vite-plugin-pwa's sw.js, which imports
 * public/push-sw.js to show notifications and handle clicks).
 *
 * Registrations live at users/{uid}/pushTokens/{sha256(token)} = { token, ua, createdAt, lastSeen }.
 * Notification preferences live at users/{uid}/settings/notifications (see functions/src/lib/prefs.ts).
 * The Firebase SDK is only loaded when this runs in firebase mode, and never imports '@/data'.
 */

import { DEFAULT_FILTERS, resolveFilters, type CaptureFilterPrefs } from './capture-filters'
import { DEFAULT_USER_AI, resolveUserAi, type UserAiPrefs } from './ai-config'

export const VAPID_KEY = (import.meta.env.VITE_FCM_VAPID_KEY as string | undefined)?.trim() || ''

export interface NotificationPrefs {
  captures: boolean
  unsorted: boolean
  expenses: boolean
  settlements: boolean
  reminders: boolean
  /** Capture setting: keep debit SMS that match no trip (in the inbox). Off by default. */
  outsideTrips: boolean
}
export const DEFAULT_PREFS: NotificationPrefs = { captures: true, unsorted: false, expenses: true, settlements: true, reminders: true, outsideTrips: false }

/** Everything in settings/notifications: push types plus the auto-capture filters. */
export type AllPrefs = NotificationPrefs & CaptureFilterPrefs & UserAiPrefs
export const DEFAULT_ALL_PREFS: AllPrefs = { ...DEFAULT_PREFS, ...DEFAULT_FILTERS, ...DEFAULT_USER_AI }

/** Stored doc → prefs with defaults; wrongly typed fields fall back to their defaults. */
export function resolveAllPrefs(raw: unknown): AllPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: AllPrefs = { ...DEFAULT_ALL_PREFS, ...resolveFilters(r), ...resolveUserAi(r) }
  for (const k of Object.keys(DEFAULT_PREFS) as Array<keyof NotificationPrefs>) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean
  return out
}

/** Whether this browser can receive web push at all (and the app is configured for it). */
export function pushSupported(): boolean {
  return Boolean(VAPID_KEY)
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const permission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported')

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

async function sdk() {
  const [{ getApp }, messaging, firestore] = await Promise.all([import('firebase/app'), import('firebase/messaging'), import('firebase/firestore')])
  const app = getApp()
  return { app, messaging, firestore, db: firestore.getFirestore(app) }
}

/** The FCM token for this browser, using our own service worker registration. */
async function currentToken(): Promise<string | null> {
  const { app, messaging } = await sdk()
  if (!(await messaging.isSupported())) return null
  const registration = await navigator.serviceWorker.ready
  return messaging.getToken(messaging.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
}

async function saveToken(uid: string, token: string) {
  const { db, firestore: f } = await sdk()
  const id = await sha256(token)
  const now = Date.now()
  const r = f.doc(db, 'users', uid, 'pushTokens', id)
  let createdAt = now
  try {
    const s = await f.getDocFromCache(r)
    if (s.exists() && typeof s.get('createdAt') === 'number') createdAt = s.get('createdAt')
  } catch { /* not cached */ }
  const batch = f.writeBatch(db)
  batch.set(r, { token, ua: navigator.userAgent.slice(0, 300), createdAt, lastSeen: now })
  // Not awaited: applied locally at once, synced when online (same pattern as the repo).
  batch.commit().catch((e) => console.warn('Saving push token failed', e))
  try { localStorage.setItem('splitit-push-token', id) } catch { /* private mode */ }
}

/**
 * Ask for permission (call only from a user tap) and register this browser.
 * Returns the resulting permission.
 */
export async function enablePush(uid: string): Promise<NotificationPermission> {
  if (!pushSupported()) return 'denied'
  const p = await Notification.requestPermission()
  if (p !== 'granted') return p
  const token = await currentToken()
  if (!token) throw new Error('This browser can’t receive push notifications.')
  await saveToken(uid, token)
  return p
}

/** On app start: if permission was already granted, refresh the token (it can rotate) and lastSeen. */
export async function refreshPush(uid: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    const token = await currentToken()
    if (token) await saveToken(uid, token)
  } catch (e) {
    console.warn('Push token refresh failed', e)
  }
}

/** Unregister this browser (sign-out or "turn off on this device"). Queues the delete; never throws. */
export async function disablePush(uid: string): Promise<void> {
  let id: string | null = null
  try { id = localStorage.getItem('splitit-push-token'); localStorage.removeItem('splitit-push-token') } catch { /* private mode */ }
  if (!pushSupported() || !uid) return
  try {
    const { app, db, firestore: f, messaging } = await sdk()
    if (!id && Notification.permission === 'granted') {
      const token = await currentToken().catch(() => null)
      if (token) id = await sha256(token)
    }
    if (id) {
      const batch = f.writeBatch(db)
      batch.delete(f.doc(db, 'users', uid, 'pushTokens', id))
      batch.commit().catch((e) => console.warn('Removing push token failed', e))
    }
    if (await messaging.isSupported()) await messaging.deleteToken(messaging.getMessaging(app)).catch(() => {})
  } catch (e) {
    console.warn('Push unregister failed', e)
  }
}

/** Live notification + auto-capture preferences (defaults filled in). */
export function watchPrefs(uid: string, cb: (p: AllPrefs) => void): () => void {
  let unsub: (() => void) | undefined
  let stopped = false
  sdk().then(({ db, firestore: f }) => {
    if (stopped) return
    unsub = f.onSnapshot(f.doc(db, 'users', uid, 'settings', 'notifications'),
      (s) => cb(resolveAllPrefs(s.data())),
      () => cb(DEFAULT_ALL_PREFS))
  }).catch(() => cb(DEFAULT_ALL_PREFS))
  return () => { stopped = true; unsub?.() }
}

/**
 * Merge `patch` into settings/notifications (other keys are kept, so the Notifications and
 * Auto-capture sections can't overwrite each other's choices).
 */
export async function savePrefs(uid: string, patch: Partial<AllPrefs>): Promise<void> {
  const { db, firestore: f } = await sdk()
  const batch = f.writeBatch(db)
  batch.set(f.doc(db, 'users', uid, 'settings', 'notifications'), { ...patch, updatedAt: Date.now() }, { merge: true })
  batch.commit().catch((e) => console.warn('Saving notification settings failed', e))
}
