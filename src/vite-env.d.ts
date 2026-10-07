/// <reference types="vite/client" />
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** iCloud link to the shared "SMS capture" Shortcut (with an import question for the key) */
  readonly VITE_IOS_SHORTCUT_URL?: string
  /** URL of an exported MacroDroid .macro template */
  readonly VITE_ANDROID_MACRO_URL?: string
}
