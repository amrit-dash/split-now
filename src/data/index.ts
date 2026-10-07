import type { Repo } from './repo'
import { createLocalRepo } from './localRepo'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

/** Public project identifiers, used to show the Firestore REST endpoint for iOS Shortcuts. */
export const firebaseProject = { projectId: config.projectId as string | undefined, apiKey: config.apiKey as string | undefined }

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

/**
 * The active repository. Assigned by initRepo(), which main.tsx awaits before the first
 * render, so every screen can use it synchronously. (ES module bindings are live, so
 * importers see the assigned value.) The Firebase SDK is only downloaded when configured.
 */
export let repo: Repo = undefined as unknown as Repo

let ready: Promise<Repo> | undefined
export function initRepo(): Promise<Repo> {
  ready ??= (async () => {
    repo = firebaseConfigured
      ? (await import('./firebaseRepo')).createFirebaseRepo(config, env.VITE_USE_EMULATORS === 'true')
      : createLocalRepo()
    return repo
  })()
  return ready
}
