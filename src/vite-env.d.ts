/// <reference types="vite/client" />
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** iCloud link to the shared "SMS capture" Shortcut (with an import question for the key) */
  readonly VITE_IOS_SHORTCUT_URL?: string
  /** URL of an exported MacroDroid .macro template */
  readonly VITE_ANDROID_MACRO_URL?: string
  /** Public Web Push (VAPID) key from Project settings → Cloud Messaging; push is hidden without it */
  readonly VITE_FCM_VAPID_KEY?: string
  /** reCAPTCHA Enterprise site key for App Check; App Check is off without it */
  readonly VITE_APPCHECK_SITE_KEY?: string
  /** App Check debug token for dev/emulators (register it in the console) */
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string
}
