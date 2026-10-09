/**
 * The Firebase web config a production deploy needs. `.env.production` is gitignored, so a fresh
 * clone or a CI runner without it would otherwise build the in-browser demo app and deploy that
 * to the live site without a word. Deploy scripts set SPLIT_NOW_DEPLOY=1, and vite.config.ts
 * refuses to build when any of these is missing; a plain `npm run build` (forks, contributors)
 * still makes a demo build.
 */
export const DEPLOY_ENV = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const

/** The required names that are absent or blank in `env`. */
export const missingDeployEnv = (env: Record<string, string | undefined>): string[] => DEPLOY_ENV.filter((k) => !env[k]?.trim())
