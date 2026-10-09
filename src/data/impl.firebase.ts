import type { FirebaseOptions } from 'firebase/app'
import type { Repo } from './repo'
import { createFirebaseRepo } from './firebaseRepo'

/**
 * What `#repo-impl` resolves to when the build has a Firebase project (VITE_FIREBASE_* set for
 * the mode: .env.production, .env.local, …). Chosen in vite.config.ts; read by ./index.ts.
 */
export function createRepo(config: FirebaseOptions, useEmulators: boolean): Repo {
  return createFirebaseRepo(config, useEmulators)
}
