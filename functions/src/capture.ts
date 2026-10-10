/*
 * POST /api/sms, /api/capture (Hosting rewrites) → capture.
 *
 * An iOS Shortcut "Message" automation or an Android MacroDroid/Tasker SMS macro posts the
 * text of a bank / UPI debit SMS here with the user's capture token. We parse it, check it
 * against the user's trip windows, save it to users/{uid}/captures as pending, and push
 * "You spent ₹840 at Swiggy — add to Goa Trip?".
 *
 * Authentication is the capture token (a 140-bit secret) plus a per-token rate limit (config/limits,
 * admin-tunable). Before any Firestore read there is a per-instance limit per client IP, a 16 KB
 * body cap and a short negative cache of unknown tokens, so garbage requests cost nothing but CPU.
 * App Check is deliberately not enforced: Shortcuts and MacroDroid can't produce a token. An admin
 * can switch the whole webhook off (config/app flags.autoCapture); outcomes are counted per day in
 * stats/capture_{day} for the admin console.
 *
 * Unscoped captures that match no trip are dropped ('outside_trip') unless the user turned on
 * "All bank & UPI payments" (prefs.outsideTrips); then they land in the inbox unsorted and only
 * notify with prefs.unsorted. A scoped capture (token.groupId or request groupId) outside that
 * group's dates is dropped; a key whose trip the user left or deleted is dead ('bad_scope').
 *
 * User filters (users/{uid}/settings/notifications, Settings → Automation): capturePaused stops
 * everything ('paused'), minAmount drops small INR debits ('below_min'), ignoreWords drops debits
 * mentioning a keyword ('ignored'); a trip in the user's own pausedTrips is skipped ('paused';
 * the legacy group-wide captureOff is ignored). All of these
 * answer 200 and store nothing. Every processed request also prepends a compact entry (no SMS
 * text) to users/{uid}/captureLog/recent, one document trimmed to the newest 30: "Recent
 * activity" in the app.
 *
 * Gemini only ever sees a masked message (account, card and phone digits, balances removed),
 * only when the message looks like it came from a bank, and only when the built-in parser
 * failed, or (if the user opted in with aiSmsMerchant) found the amount but not the payee.
 */
import type { DocumentReference } from 'firebase-admin/firestore'
import { aiReadSms, AI_SECRETS } from './ai'
import type { AiSms } from './lib/gemini'
import { logger } from 'firebase-functions/logger'
import { onRequest } from 'firebase-functions/v2/https'
import { CAPTURE_LOG_DOC, filterReason, type CaptureLogEntry } from '../../shared/capture-filters'
import { isBankLikeSms, maskSms } from '../../shared/sms-parse'
import { minorDigitsOf } from '../../shared/money-core'
import { limitPair } from '../../shared/limits'
import { countStats, db } from './admin'
import { APP_ORIGINS, REGION } from './config'
import { flagOn, getLimits } from './lib/limits'
import { CAPTURE_LOG_KEEP, STATUS, captureDoc, interpret, logEntry, type Parsed, type Reason } from './lib/capture-core'
import { captureIdFor, tokenKey } from './lib/ids'
import { captureNote } from './lib/notify-text'
import { resolveCapturePrefs } from './lib/prefs'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { isIdShaped, isTokenShaped, readCaptureRequest, type RawRequest } from './lib/request'
import { matchScoped, pausedTrip, pickTrip, type TripGroup } from './lib/trips'
import { isArchivedFor } from '../../shared/archive'
import { isDeletedGroup } from '../../shared/group-trash'
import { sendToUser } from './push'

export type CaptureResponse =
  | { ok: true; captureId: string; parsed: Parsed; matchedGroupId?: string; pushed: boolean }
  | { ok: false; reason: Reason | 'server_error' }

const fail = (reason: Reason) => ({ status: STATUS[reason], body: { ok: false, reason } as CaptureResponse })

/** Largest body an automation legitimately sends (an SMS is under 1 KB; JSON with headers, a few KB). */
export const MAX_BODY_BYTES = 16_384

interface GroupDoc extends TripGroup {
  memberUids?: string[]
  deletedAt?: number
}

// ---- Pre-auth guards (per instance, in memory) -------------------------------------------

const ipHits = new Map<string, { n: number; t: number }>()
/** True when `ip` sent more than `max` requests inside the window. A tiny map that is cleared when it grows large. */
export function ipLimited(ip: string, now: number, max = 60, windowMs = 60_000, hits = ipHits): boolean {
  const h = hits.get(ip)
  if (!h || now - h.t > windowMs) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, t: now })
    return false
  }
  return ++h.n > max
}

const unknownTokens = new Map<string, number>()
const NEGATIVE_TTL = 5 * 60_000
/** Remember a token that didn't exist, so retries of the same junk never reach Firestore for a while. */
export function rememberUnknown(token: string, now: number, cache = unknownTokens) {
  if (cache.size > 5000) cache.clear()
  cache.set(token, now + NEGATIVE_TTL)
}
export function isKnownUnknown(token: string, now: number, cache = unknownTokens): boolean {
  const until = cache.get(token)
  if (until === undefined) return false
  if (until < now) {
    cache.delete(token)
    return false
  }
  return true
}

async function loadGroup(id: string, uid: string): Promise<GroupDoc | undefined> {
  const s = await db().collection('groups').doc(id).get()
  const g = s.data() as GroupDoc | undefined
  // `archived` is personal (shared/archive.ts): this person's own, so an archived trip doesn't match for them only.
  // A group in Recently deleted takes nothing (shared/group-trash.ts).
  return g && !isDeletedGroup(g) && Array.isArray(g.memberUids) && g.memberUids.includes(uid) ? { ...g, id: s.id, archived: isArchivedFor(g, uid) } : undefined
}

/** Per capture key: config/limits capturePerHour / capturePerDay (60 and 300 by default). */
async function rateLimited(token: string, now: number): Promise<boolean> {
  const limits = limitPair(await getLimits(now), 'capturePerHour', 'capturePerDay')
  const ref = db().collection('rateLimits').doc(tokenKey(token))
  return db().runTransaction(async (t) => {
    const snap = await t.get(ref)
    const { allowed, next } = applyRateLimit(snap.data() as Partial<RateState> | undefined, now, limits)
    if (allowed) t.set(ref, { ...next, kind: 'capture', updatedAt: now })
    return !allowed
  })
}

/**
 * Prepend to users/{uid}/captureLog/recent and keep the newest CAPTURE_LOG_KEEP entries: one
 * read and one write, whatever the log's age. Best-effort: a logging failure never fails the capture.
 */
async function writeLog(userRef: DocumentReference, entry: CaptureLogEntry | undefined): Promise<void> {
  if (!entry) return
  const ref = userRef.collection('captureLog').doc(CAPTURE_LOG_DOC)
  try {
    await db().runTransaction(async (t) => {
      const prev = (await t.get(ref)).get('entries') as CaptureLogEntry[] | undefined
      t.set(ref, { entries: [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, CAPTURE_LOG_KEEP), updatedAt: entry.at })
    })
  } catch (e) {
    logger.warn('capture log', e)
  }
}

/** The token's "last received" stamp, at most once a minute per token (the wizard watches it). */
const LAST_USED_EVERY = 60_000

export async function handleCapture(
  raw: RawRequest,
  now = new Date(),
  readSms: (uid: string, maskedText: string) => Promise<AiSms | null> = aiReadSms,
): Promise<{ status: number; body: CaptureResponse }> {
  const req = readCaptureRequest(raw)
  if (!isTokenShaped(req.token)) return fail('bad_token')
  if (isKnownUnknown(req.token, now.getTime())) return fail('bad_token')

  const tokenSnap = await db().collection('captureTokens').doc(req.token).get()
  const uid = tokenSnap.get('uid')
  if (!tokenSnap.exists || typeof uid !== 'string') {
    rememberUnknown(req.token, now.getTime())
    await countStats('capture', { received: 1, bad_token: 1 }, now.getTime())
    return fail('bad_token')
  }
  if (await rateLimited(req.token, now.getTime())) {
    await countStats('capture', { received: 1, rate_limited: 1 }, now.getTime())
    return fail('rate_limited')
  }

  // Any request that reached a user counts as "received" (the "last received" line per key).
  const lastUsed = tokenSnap.get('lastUsedAt')
  if (typeof lastUsed !== 'number' || now.getTime() - lastUsed > LAST_USED_EVERY) {
    tokenSnap.ref.update({ lastUsedAt: now.getTime() }).catch((e) => logger.warn('token lastUsedAt', e))
  }
  const userRef = db().collection('users').doc(uid)
  // Admin counters (stats/capture_{day}): every request that reached a user, by outcome.
  let aiUsed = 0
  const count = (outcome: Reason | 'captured') => countStats('capture', { received: 1, [outcome]: 1, ai: aiUsed }, now.getTime())
  const reject = async (reason: Reason, parsed?: Parsed, groupName?: string) => {
    await Promise.all([writeLog(userRef, logEntry(reason, req.device, now.getTime(), parsed, groupName)), count(reason)])
    return fail(reason)
  }

  const prefs = resolveCapturePrefs((await userRef.collection('settings').doc('notifications').get()).data())
  // The admin's kill switch (config/app flags.autoCapture) reads like a pause to the user.
  if (prefs.capturePaused || !(await flagOn('autoCapture', now.getTime()))) return reject('paused')

  let it = interpret(req, now)
  // The regex parser came up short: ask Gemini (masked text, bank-looking messages only), then
  // run its answer through the same checks. A readable debit only goes for its payee's name when
  // the user asked for that (aiSmsMerchant) and the message has no UPI id to name it from.
  const bankLike = !!req.text && isBankLikeSms(req.text, req.sender)
  const unreadable = !it.ok && it.reason === 'unparsed'
  const nameless = it.ok && !it.parsed.merchant && !it.sms?.vpa && prefs.aiSmsMerchant
  if (prefs.aiSms && bankLike && (unreadable || nameless)) {
    aiUsed = 1
    const ai = await readSms(uid, maskSms(req.text!, 1000))
    if (ai?.kind === 'debit') {
      if (!it.ok && ai.amount) {
        const d = minorDigitsOf(ai.currency)
        it = interpret(
          {
            ...req,
            amount: (ai.amount / 10 ** d).toFixed(d),
            currency: req.currency ?? ai.currency,
            merchant: req.merchant ?? ai.merchant,
            ref: req.ref ?? ai.ref,
          },
          now,
        )
      } else if (it.ok && ai.merchant) it.parsed.merchant = ai.merchant
    }
  }
  if (!it.ok) return reject(it.reason)
  const { parsed, extra } = it

  // The user's own filters. The raw text is only read in memory, never stored in the log.
  const filtered = filterReason(prefs, parsed, req.text)
  if (filtered) return reject(filtered, parsed)

  // Scope: the token's group wins over the request's. A scoped key whose group the user left or
  // deleted is dead: it never falls back to "all my trips".
  const tokenGroup = tokenSnap.get('groupId')
  const scopeId = typeof tokenGroup === 'string' && tokenGroup ? tokenGroup : isIdShaped(req.groupId) ? req.groupId : undefined
  const scoped = scopeId ? await loadGroup(scopeId, uid) : undefined
  let matched: TripGroup | undefined
  if (scopeId) {
    if (!scoped) return reject('bad_scope', parsed)
    const r = matchScoped(scoped, parsed.date, prefs.pausedTrips)
    if (r.kind === 'off') return reject('paused', parsed, scoped.name)
    if (r.kind === 'outside') return reject('outside_trip', parsed, scoped.name)
    matched = r.group
  } else {
    const groups = (await db().collection('groups').where('memberUids', 'array-contains', uid).get()).docs.map((d) => {
      const g = d.data() as GroupDoc
      // Recently deleted groups never match, like archived ones.
      return { ...g, id: d.id, archived: isArchivedFor(g, uid) || isDeletedGroup(g) }
    })
    matched = pickTrip(groups, parsed.date, parsed.currency, prefs.pausedTrips)
    if (!matched) {
      // Dated inside a trip this person paused: skip it (the pause wins over "all payments").
      const off = pausedTrip(groups, parsed.date, prefs.pausedTrips)
      if (off) return reject('paused', parsed, off.name)
      // Outside every trip window: only kept when the user turned on "All bank & UPI payments".
      if (!prefs.outsideTrips) return reject('outside_trip', parsed)
    }
  }

  const captureId = captureIdFor(uid, parsed, extra.receivedAt ?? now, req.text ? extra.raw : undefined)
  const ref = userRef.collection('captures').doc(captureId)
  try {
    await ref.create(captureDoc(captureId, parsed, extra, matched?.id, now.getTime()))
  } catch (e) {
    if ((e as { code?: number }).code === 6) return reject('duplicate', parsed, matched?.name) // ALREADY_EXISTS
    throw e
  }

  const note = captureNote({ captureId, amount: parsed.amount, currency: parsed.currency, merchant: parsed.merchant, groupName: matched?.name })
  const [sent] = await Promise.all([
    sendToUser(uid, matched ? ['captures'] : ['captures', 'unsorted'], note),
    writeLog(userRef, logEntry('captured', req.device, now.getTime(), parsed, matched?.name)),
    count('captured'),
  ])

  const body: CaptureResponse = { ok: true, captureId, parsed, pushed: sent > 0 }
  if (matched) body.matchedGroupId = matched.id
  return { status: 200, body }
}

/** The client's address behind Hosting (first hop of X-Forwarded-For), for the per-IP limit. */
export const clientIp = (forwardedFor: string | undefined, fallback: string | undefined) => (forwardedFor ?? '').split(',')[0].trim() || fallback || 'unknown'

export const capture = onRequest(
  { region: REGION, secrets: AI_SECRETS, cors: APP_ORIGINS, invoker: 'public', maxInstances: 3, concurrency: 20, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST').json({ ok: false, reason: 'bad_request' })
      return
    }
    const declared = Number(req.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES || (req.rawBody?.length ?? 0) > MAX_BODY_BYTES) {
      res.status(413).json({ ok: false, reason: 'bad_request' })
      return
    }
    if (ipLimited(clientIp(req.get('x-forwarded-for'), req.ip), Date.now())) {
      res.status(429).json({ ok: false, reason: 'rate_limited' })
      return
    }
    // Unknown content types arrive unparsed; fall back to the raw bytes.
    const parsedBody = req.body && (typeof req.body === 'string' || Object.keys(req.body).length) ? req.body : req.rawBody
    try {
      const out = await handleCapture({
        body: parsedBody,
        contentType: req.get('content-type'),
        authorization: req.get('authorization'),
        userAgent: req.get('user-agent'),
        query: req.query as Record<string, unknown>,
      })
      res.status(out.status).json(out.body)
    } catch (e) {
      logger.error('capture failed', e)
      res.status(500).json({ ok: false, reason: 'server_error' })
    }
  },
)
