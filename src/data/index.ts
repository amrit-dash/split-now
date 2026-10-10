import type { Repo } from './repo'
import { createRepo } from '#repo-impl'
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
  const extra = String(env.VITE_AUTH_HOSTS ?? '')
    .split(',')
    .map((h: string) => h.trim())
    .filter(Boolean)
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

/**
 * The active repository. Which implementation `#repo-impl` is gets decided at build time
 * (vite.config.ts): impl.firebase.ts when VITE_FIREBASE_* is set for the build, impl.local.ts
 * (demo mode) otherwise. Both are static imports, so the browser downloads the data layer in
 * parallel with the entry instead of discovering it after React has started, a Firebase build
 * ships no demo code and a demo build ships no Firebase SDK.
 *
 * Assigned by initRepo(), which main.tsx calls before the first render, so every screen can
 * use `repo` synchronously. (ES module bindings are live, so importers see the assigned value.)
 */
export let repo: Repo = undefined as unknown as Repo

export function initRepo(): Repo {
  if (!repo) {
    repo = createRepo(config, env.VITE_USE_EMULATORS === 'true')
    // Exchange rates: the shared Firestore copy first (demo mode's repo has none, so fx.ts
    // falls back to calling Frankfurter directly).
    if (repo.mode === 'firebase') setFxShared(repo)
  }
  return repo
}
