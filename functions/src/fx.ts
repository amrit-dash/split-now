/*
 * Shared ECB exchange rates in Firestore, so every user sees the same numbers.
 *   fxRates/{yyyy-mm-dd}  EUR-based rates for one ECB publication (plus aliases for past
 *                         weekends/holidays, holding the previous business day's rates)
 *   fxRates/latest        a copy of the newest publication
 * Any pair is rates[to] / rates[from]. Clients can read but never write (firestore.rules).
 *
 *   fxDaily     weekdays 17:15 Europe/Berlin (ECB publishes ~16:00 CET)
 *   fxMorning   every day 09:00 Asia/Kolkata (backstop if the evening run failed)
 *   refreshFx   callable { date? } → { date, fetchedAt, rates }; any signed-in user. Table guests
 *               (anonymous) may only ask for the latest. The latest is re-fetched at most every
 *               10 min; a stored past date is final. Per user: 30 calls an hour, 200 a day, so
 *               nobody can turn the app into a fetch loop against the ECB mirror.
 */
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './admin'
import { REGION, TIME_ZONE } from './config'
import { asRatesDoc, fetchEcb, planRefresh, refreshWrites, validRequest, type FxRatesDoc } from './lib/fx-core'
import { applyRateLimit, type RateState } from './lib/ratelimit'

const FX_LIMIT = { perHour: 30, perDay: 200 }

async function allowed(uid: string, now: number): Promise<boolean> {
  const ref = db().collection('rateLimits').doc(`fx_${uid}`)
  return db().runTransaction(async (tx) => {
    const r = applyRateLimit((await tx.get(ref)).data() as Partial<RateState> | undefined, now, FX_LIMIT)
    if (r.allowed) tx.set(ref, { ...r.next, kind: 'fx', updatedAt: now })
    return r.allowed
  })
}

const col = () => db().collection('fxRates')

async function read(id: string): Promise<FxRatesDoc | null> {
  return asRatesDoc((await col().doc(id).get()).data())
}

async function save(writes: Array<[string, FxRatesDoc]>) {
  const batch = db().batch()
  for (const [id, d] of writes) batch.set(col().doc(id), d)
  await batch.commit()
}

/** Fetch and store the latest publication. */
async function syncLatest(): Promise<FxRatesDoc> {
  const now = Date.now()
  const [got, latest] = await Promise.all([fetchEcb(fetch), read('latest')])
  const writes = refreshWrites({ got, now, latest })
  await save(writes)
  logger.info('fx synced', { date: got.date, currencies: Object.keys(got.rates).length })
  return writes[0][1]
}

const scheduled = { region: REGION, timeoutSeconds: 60, memory: '256MiB' as const, retryCount: 2 }

export const fxDaily = onSchedule({ ...scheduled, schedule: '15 17 * * 1-5', timeZone: 'Europe/Berlin' }, async () => {
  await syncLatest()
})

export const fxMorning = onSchedule({ ...scheduled, schedule: '0 9 * * *', timeZone: TIME_ZONE }, async () => {
  await syncLatest()
})

export const refreshFx = onCall(
  {
    region: REGION,
    // TODO: switch to true (and pass consumeAppCheckToken if needed) once App Check enforcement is on (docs/FIREBASE_SETUP.md).
    enforceAppCheck: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 5,
  },
  async (req): Promise<{ date: string; fetchedAt: number; rates: Record<string, number> }> => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to refresh exchange rates')
    const requested = (req.data as { date?: unknown } | null)?.date
    if (!validRequest(requested)) throw new HttpsError('invalid-argument', 'date must be yyyy-mm-dd, 1999-01-04 or later')
    if (requested && req.auth.token.firebase?.sign_in_provider === 'anonymous')
      throw new HttpsError('permission-denied', 'Guests can only refresh the latest rates')
    const date = requested ?? undefined
    const now = Date.now()
    if (!(await allowed(req.auth.uid, now))) throw new HttpsError('resource-exhausted', 'Too many refreshes; try again later')
    const [latest, stored] = await Promise.all([read('latest'), date ? read(date) : Promise.resolve(null)])
    const plan = planRefresh({ requested: date, now, latest, stored })
    const have = plan.kind === 'latest' ? latest : stored
    const out = (d: FxRatesDoc) => ({ date: d.date, fetchedAt: d.fetchedAt, rates: d.rates })
    if (!plan.fetch && have) return out(have)
    try {
      const got = await fetchEcb(fetch, plan.kind === 'date' ? plan.date : undefined)
      const writes = refreshWrites({ got, now, requested: plan.kind === 'date' ? plan.date : undefined, latest })
      await save(writes)
      return out(writes[0][1])
    } catch (e) {
      logger.warn('fx refresh failed', { date: date ?? 'latest', error: (e as Error).message })
      // A stale shared copy beats an error.
      if (have) return out(have)
      throw new HttpsError('unavailable', 'The exchange-rate service is unreachable; try again later')
    }
  },
)
