import type { Repo } from './repo'
import { createLocalRepo } from './localRepo'
import { createFirebaseRepo } from './firebaseRepo'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

export const repo: Repo = firebaseConfigured
  ? createFirebaseRepo(config, env.VITE_USE_EMULATORS === 'true')
  : createLocalRepo()
