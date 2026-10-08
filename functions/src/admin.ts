import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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
