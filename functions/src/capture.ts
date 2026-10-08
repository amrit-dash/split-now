/*
 * POST /api/sms, /api/capture (Hosting rewrites) → capture.
 *
 * An iOS Shortcut "Message" automation or an Android MacroDroid/Tasker SMS macro posts the
 * text of a bank / UPI debit SMS here with the user's capture token. We parse it, check it
 * against the user's trip windows, save it to users/{uid}/captures as pending, and push
 * "You spent ₹840 at Swiggy — add to Goa Trip?".
 *
 * Authentication is the capture token (a 140-bit secret) plus a per-token rate limit.
 * App Check is deliberately not enforced: Shortcuts and MacroDroid can't produce a token.
 *
 * Unscoped captures that match no trip are dropped ('outside_trip') unless the user turned on
 * "All bank & UPI payments" (prefs.outsideTrips); then they land in the inbox unsorted and only
 * notify with prefs.unsorted. A scoped capture (token.groupId or request groupId) outside that
 * group's dates is dropped.
 *
 * User filters (users/{uid}/settings/notifications, Profile → Auto-capture): capturePaused stops
 * everything ('paused'), minAmount drops small INR debits ('below_min'), ignoreWords drops debits
 * mentioning a keyword ('ignored'); a trip with captureOff is skipped ('paused'). All of these
 * answer 200 and store nothing. Every processed request also appends a compact entry (no SMS
 * text) to users/{uid}/captureLog, trimmed to the newest 30: "Recent activity" in the app.
 */
import type { DocumentReference } from 'firebase-admin/firestore'
import { aiReadSms, GEMINI_API_KEY } from './ai'
import type { AiSms } from './lib/gemini'
import { logger } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import { filterReason, type CaptureLogEntry } from '../../shared/capture-filters'
import { db } from './admin'
import { APP_ORIGINS, RATE_LIMIT, REGION } from './config'
import { CAPTURE_LOG_KEEP, STATUS, captureDoc, interpret, logEntry, type Parsed, type Reason } from './lib/capture-core'
import { captureIdFor, tokenKey } from './lib/ids'
import { captureNote } from './lib/notify-text'
import { resolveCapturePrefs } from './lib/prefs'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { isIdShaped, isTokenShaped, readCaptureRequest, type RawRequest } from './lib/request'
import { matchScoped, pausedTrip, pickTrip, type TripGroup } from './lib/trips'
import { sendToUser } from './push'

export type CaptureResponse =
  | { ok: true; captureId: string; parsed: Parsed; matchedGroupId?: string; pushed: boolean }
  | { ok: false; reason: Reason | 'server_error' }

const fail = (reason: Reason) => ({ status: STATUS[reason], body: { ok: false, reason } as CaptureResponse })

interface GroupDoc extends TripGroup {
  memberUids?: string[]
}

async function loadGroup(id: string, uid: string): Promise<GroupDoc | undefined> {
  const s = await db().collection('groups').doc(id).get()
  const g = s.data() as GroupDoc | undefined
  return g && Array.isArray(g.memberUids) && g.memberUids.includes(uid) ? { ...g, id: s.id } : undefined
}

async function rateLimited(token: string, now: number): Promise<boolean> {
  const ref = db().collection('rateLimits').doc(tokenKey(token))
  return db().runTransaction(async (t) => {
    const snap = await t.get(ref)
    const { allowed, next } = applyRateLimit(snap.data() as Partial<RateState> | undefined, now, RATE_LIMIT)
    if (allowed) t.set(ref, { ...next, kind: 'capture', updatedAt: now })
    return !allowed
  })
}

/**
 * Append to users/{uid}/captureLog and trim it to the newest CAPTURE_LOG_KEEP entries.
 * Best-effort: a logging failure never fails the capture.
 */
async function writeLog(userRef: DocumentReference, entry: CaptureLogEntry | undefined): Promise<void> {
  if (!entry) return
  try {
    const col = userRef.collection('captureLog')
    await col.add(entry)
    const old = await col.orderBy('at', 'desc').offset(CAPTURE_LOG_KEEP).limit(20).select().get()
    if (!old.empty) {
      const batch = db().batch()
      old.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  } catch (e) {
    logger.warn('capture log', e)
  }
}

export async function handleCapture(raw: RawRequest, now = new Date(), readSms: (uid: string, text: string) => Promise<AiSms | null> = aiReadSms): Promise<{ status: number; body: CaptureResponse }> {
  const req = readCaptureRequest(raw)
  if (!isTokenShaped(req.token)) return fail('bad_token')

  const tokenSnap = await db().collection('captureTokens').doc(req.token).get()
  const uid = tokenSnap.get('uid')
  if (!tokenSnap.exists || typeof uid !== 'string') return fail('bad_token')
  if (await rateLimited(req.token, now.getTime())) return fail('rate_limited')

  // Any request that reached a user counts as "received" (the "last received" line per key).
  tokenSnap.ref.update({ lastUsedAt: now.getTime() }).catch((e) => logger.warn('token lastUsedAt', e))
  const userRef = db().collection('users').doc(uid)
  const reject = async (reason: Reason, parsed?: Parsed, groupName?: string) => {
    await writeLog(userRef, logEntry(reason, req.device, now.getTime(), parsed, groupName))
    return fail(reason)
  }

  const prefs = resolveCapturePrefs((await userRef.collection('settings').doc('notifications').get()).data())
  if (prefs.capturePaused) return reject('paused')

  let it = interpret(req, now)
  // The regex parser came up short: ask Gemini, then run its answer through the same checks.
  if (prefs.aiSms && req.text && ((!it.ok && it.reason === 'unparsed') || (it.ok && !it.parsed.merchant))) {
    const ai = await readSms(uid, req.text)
    if (ai?.kind === 'debit') {
      if (!it.ok && ai.amount) {
        const d = minorDigits(ai.currency)
        it = interpret({ ...req, amount: (ai.amount / 10 ** d).toFixed(d), currency: req.currency ?? ai.currency, merchant: req.merchant ?? ai.merchant, ref: req.ref ?? ai.ref }, now)
      } else if (it.ok && ai.merchant) it.parsed.merchant = ai.merchant
    }
  }
  if (!it.ok) return reject(it.reason)
  const { parsed, extra } = it

  // The user's own filters. The raw text is only read in memory, never stored in the log.
  const filtered = filterReason(prefs, parsed, req.text)
  if (filtered) return reject(filtered, parsed)

  // Scope: the token's group wins over the request's; a group you're no longer in is ignored.
  const tokenGroup = tokenSnap.get('groupId')
  const scopeId = typeof tokenGroup === 'string' && tokenGroup ? tokenGroup : isIdShaped(req.groupId) ? req.groupId : undefined
  const scoped = scopeId ? await loadGroup(scopeId, uid) : undefined
  let matched: TripGroup | undefined
  if (scoped) {
    const r = matchScoped(scoped, parsed.date)
    if (r.kind === 'off') return reject('paused', parsed, scoped.name)
    if (r.kind === 'outside') return reject('outside_trip', parsed, scoped.name)
    matched = r.group
  } else {
    const groups = (await db().collection('groups').where('memberUids', 'array-contains', uid).get())
      .docs.map((d) => ({ ...(d.data() as GroupDoc), id: d.id }))
    matched = pickTrip(groups, parsed.date)
    if (!matched) {
      // Dated inside a trip whose capture is paused: skip it (the pause wins over "all payments").
      const off = pausedTrip(groups, parsed.date)
      if (off) return reject('paused', parsed, off.name)
      // Outside every trip window: only kept when the user turned on "All bank & UPI payments".
      if (!prefs.outsideTrips) return reject('outside_trip', parsed)
    }
  }

  const captureId = captureIdFor(uid, parsed, extra.receivedAt ?? now)
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
  ])

  const body: CaptureResponse = { ok: true, captureId, parsed, pushed: sent > 0 }
  if (matched) body.matchedGroupId = matched.id
  return { status: 200, body }
}

export const capture = onRequest(
  { region: REGION, secrets: [GEMINI_API_KEY], cors: APP_ORIGINS, invoker: 'public', maxInstances: 10, concurrency: 40, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST').json({ ok: false, reason: 'bad_request' })
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

const minorDigits = (c: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2 } catch { return 2 }
}
