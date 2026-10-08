import type { FirebaseApp } from 'firebase/app'

/**
 * App Check with reCAPTCHA Enterprise, only when VITE_APPCHECK_SITE_KEY is set. In development
 * (or against the emulators) a debug token is used: set VITE_APPCHECK_DEBUG_TOKEN to a token
 * registered in the console, or leave it empty and the SDK logs a new one to register.
 * See docs/FIREBASE_SETUP.md ("App Check") before turning enforcement on.
 *
 * The SDK is loaded on demand so builds without a site key never ship it. Auth and Firestore
 * pick the provider up the moment it registers; a request that beats it goes out without a
 * token, which only matters once enforcement is on (and the listener streams are restarted
 * with a token as soon as one exists).
 */
export function initAppCheck(app: FirebaseApp, useEmulators: boolean): void {
  const siteKey = (import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined)?.trim()
  if (!siteKey) return
  if (import.meta.env.DEV || useEmulators) {
    const debug = (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined)?.trim()
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = debug || true
  }
  import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
    })
    .catch((e) => console.warn('App Check failed to start', e))
}
