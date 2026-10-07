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
 * Unscoped captures that match no trip are still saved to the inbox (so nothing is lost), but
 * only notify when the user turned on "Unsorted payments" (prefs.unsorted, off by default).
 * A scoped capture (token.groupId or request groupId) outside that group's dates is dropped.
 */
import { logger } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import { db } from './admin'
import { APP_ORIGINS, RATE_LIMIT, REGION } from './config'
import { STATUS, captureDoc, interpret, type Parsed, type Reason } from './lib/capture-core'
import { captureIdFor, tokenKey } from './lib/ids'
import { captureNote } from './lib/notify-text'
import { applyRateLimit, type RateState } from './lib/ratelimit'
import { isIdShaped, isTokenShaped, readCaptureRequest, type RawRequest } from './lib/request'
import { matchScoped, pickTrip, type TripGroup } from './lib/trips'
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

export async function handleCapture(raw: RawRequest, now = new Date()): Promise<{ status: number; body: CaptureResponse }> {
  const req = readCaptureRequest(raw)
  if (!isTokenShaped(req.token)) return fail('bad_token')

  const tokenSnap = await db().collection('captureTokens').doc(req.token).get()
  const uid = tokenSnap.get('uid')
  if (!tokenSnap.exists || typeof uid !== 'string') return fail('bad_token')
  if (await rateLimited(req.token, now.getTime())) return fail('rate_limited')

  const it = interpret(req, now)
  if (!it.ok) return fail(it.reason)
  const { parsed, extra } = it

  // Scope: the token's group wins over the request's; a group you're no longer in is ignored.
  const tokenGroup = tokenSnap.get('groupId')
  const scopeId = typeof tokenGroup === 'string' && tokenGroup ? tokenGroup : isIdShaped(req.groupId) ? req.groupId : undefined
  const scoped = scopeId ? await loadGroup(scopeId, uid) : undefined
  let matched: TripGroup | undefined
  if (scoped) {
    const r = matchScoped(scoped, parsed.date)
    if (r.kind === 'outside') return fail('outside_trip')
    matched = r.group
  } else {
    const groups = await db().collection('groups').where('memberUids', 'array-contains', uid).get()
    matched = pickTrip(groups.docs.map((d) => ({ ...(d.data() as GroupDoc), id: d.id })), parsed.date)
  }

  const captureId = captureIdFor(uid, parsed, extra.receivedAt ?? now)
  const ref = db().collection('users').doc(uid).collection('captures').doc(captureId)
  try {
    await ref.create(captureDoc(captureId, parsed, extra, matched?.id, now.getTime()))
  } catch (e) {
    if ((e as { code?: number }).code === 6) return fail('duplicate') // ALREADY_EXISTS
    throw e
  }
  tokenSnap.ref.update({ lastUsedAt: now.getTime() }).catch((e) => logger.warn('token lastUsedAt', e))

  const note = captureNote({ captureId, amount: parsed.amount, currency: parsed.currency, merchant: parsed.merchant, groupName: matched?.name })
  const sent = await sendToUser(uid, matched ? ['captures'] : ['captures', 'unsorted'], note)

  const body: CaptureResponse = { ok: true, captureId, parsed, pushed: sent > 0 }
  if (matched) body.matchedGroupId = matched.id
  return { status: 200, body }
}

export const capture = onRequest(
  { region: REGION, cors: APP_ORIGINS, invoker: 'public', maxInstances: 10, concurrency: 40, memory: '256MiB', timeoutSeconds: 30 },
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
