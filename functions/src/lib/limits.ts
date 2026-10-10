/*
 * Admin-tunable limits and kill switches, read from Firestore and cached in memory for a
 * minute per instance, so a change in the admin console lands within a minute and a busy
 * webhook still costs no extra reads per request.
 *   config/limits  rate limits (shared/limits.ts has the shape and defaults)
 *   config/app     feature flags: flags.<name> === false turns a feature off for everyone
 *                  (autoCapture stops the webhook, aiImages / aiSms stop AI reading)
 * Missing documents mean "defaults, everything on". A failed read keeps the last good value.
 */
import { logger } from 'firebase-functions/logger'
import { DEFAULT_LIMITS, resolveLimits, type Limits } from '../../../shared/limits'
import { db } from '../admin'

export const CACHE_MS = 60_000
/** The emulator tests flip flags between calls, so there nothing is cached. */
const cacheMs = () => (process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : CACHE_MS)

interface Cached {
  at: number
  limits: Limits
  flags: Record<string, unknown>
}

let cache: Cached | null = null
let inflight: Promise<Cached> | null = null

async function load(now: number): Promise<Cached> {
  if (cache && now - cache.at < cacheMs()) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const [l, a] = await db().getAll(db().doc('config/limits'), db().doc('config/app'))
      const flags = a.get('flags')
      cache = { at: now, limits: resolveLimits(l.data()), flags: flags && typeof flags === 'object' ? (flags as Record<string, unknown>) : {} }
    } catch (e) {
      logger.warn('config read failed; using ' + (cache ? 'the last values' : 'defaults'), (e as Error).message)
      cache = { at: now, limits: cache?.limits ?? DEFAULT_LIMITS, flags: cache?.flags ?? {} }
    } finally {
      inflight = null
    }
    return cache
  })()
  return inflight
}

/** The current limits (defaults when config/limits is missing). */
export async function getLimits(now = Date.now()): Promise<Limits> {
  return (await load(now)).limits
}

/** A feature flag from config/app; anything but an explicit `false` counts as on. */
export async function flagOn(name: string, now = Date.now()): Promise<boolean> {
  return (await load(now)).flags[name] !== false
}
