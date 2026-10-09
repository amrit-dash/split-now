import type { Repo } from './repo'
import { createLocalRepo } from './localRepo'
import { setFxShared } from '@/lib/fx'

const env = import.meta.env

/**
 * Serve the auth handler from the site the user is on (any of this project's Hosting sites),
 * so Google sign-in in an installed iOS PWA isn't broken by third-party storage partitioning.
 */
function authDomain(): string | undefined {
  const project = env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const host = typeof location !== 'undefined' ? location.host : ''
  const ownSite = /\.(web\.app|firebaseapp\.com)$/.test(host) && env.PROD
  const extra = String(env.VITE_AUTH_HOSTS ?? '').split(',').map((h: string) => h.trim()).filter(Boolean)
  if (project && (ownSite || extra.includes(host))) return host
  return env.VITE_FIREBASE_AUTH_DOMAIN
}

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: authDomain(),
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
    // Exchange rates: the shared Firestore copy first (demo mode's repo has none, so fx.ts
    // falls back to calling Frankfurter directly).
    if (repo.mode === 'firebase') setFxShared(repo)
    return repo
  })()
  return ready
}
