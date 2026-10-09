import type { FirebaseOptions } from 'firebase/app'
import type { Repo } from './repo'
import { createLocalRepo } from './localRepo'

/**
 * What `#repo-impl` resolves to for demo builds (no VITE_FIREBASE_* at build time, e.g. `vite`
 * without a .env.local, or `vite --mode e2e`): everything stays in this browser and the Firebase
 * SDK is not in the bundle at all. Chosen in vite.config.ts; read by ./index.ts.
 */
export function createRepo(_config: FirebaseOptions, _useEmulators: boolean): Repo {
  return createLocalRepo()
}
