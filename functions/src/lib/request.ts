/*
 * Normalise a capture webhook request. Automations are sloppy about content types, so this
 * accepts JSON, application/x-www-form-urlencoded and text/plain (either JSON text or the raw
 * SMS itself), and takes the token from the body, an `Authorization: Bearer` header or `?t=`.
 */

export type Device = 'ios' | 'android' | 'other'

export interface CaptureRequest {
  token?: string
  text?: string
  sender?: string
  receivedAt?: string
  groupId?: string
  device: Device
  /** structured fields (same meaning as the /capture URL contract v1) */
  amount?: string
  currency?: string
  merchant?: string
  ts?: string
  ref?: string
}

export interface RawRequest {
  body: unknown
  contentType?: string
  authorization?: string
  userAgent?: string
  query?: Record<string, unknown>
}

const LIMITS: Record<string, number> = {
  token: 64,
  text: 2000,
  sender: 40,
  receivedAt: 40,
  groupId: 64,
  device: 20,
  amount: 40,
  currency: 3,
  merchant: 100,
  ts: 40,
  ref: 64,
}

/**
 * Keep `sender` only when it looks like an SMS sender id ("VM-HDFCBK"), a phone number or a short
 * contact name. Some iPhone Shortcuts can only pass the whole message as "sender"; parsing that
 * as a sender would misread payee handles (e.g. "@hdfcbank") as the issuing bank.
 */
export function senderId(v: string | undefined): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  if (s.length > 24 || (s.match(/\s/g)?.length ?? 0) > 2 || /\d[.,]\d{2}\b|[₹@]|\b(rs|inr)\b/i.test(s)) return undefined
  return s
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v)
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s ? s.slice(0, max) : undefined
}

function bodyObject(body: unknown): Record<string, unknown> {
  let b = body
  if (b instanceof Uint8Array) b = Buffer.from(b).toString('utf8')
  if (typeof b === 'string') {
    const s = b.trim()
    if (s.startsWith('{')) {
      try {
        const j = JSON.parse(s)
        if (j && typeof j === 'object') return j as Record<string, unknown>
      } catch {
        /* not JSON: treat as the SMS */
      }
    }
    return s ? { text: s } : {}
  }
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

/** Shortcuts / MacroDroid / Tasker user agents → device, when the request doesn't say. */
export function deviceFromUserAgent(ua: string | undefined): Device {
  if (!ua) return 'other'
  if (/iPhone|iPad|iOS|CFNetwork|Darwin|Shortcuts/i.test(ua)) return 'ios'
  if (/Android|okhttp|MacroDroid|Tasker|Dalvik/i.test(ua)) return 'android'
  return 'other'
}

export function readCaptureRequest(r: RawRequest): CaptureRequest {
  const b = bodyObject(r.body)
  const q = r.query ?? {}
  const pick = (k: string, ...alts: string[]) => {
    for (const key of [k, ...alts]) {
      const v = str(b[key], LIMITS[k])
      if (v) return v
    }
    return undefined
  }
  const bearer = r.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  const deviceRaw = (pick('device') ?? str(q.device, 20))?.toLowerCase()
  const device: Device = deviceRaw === 'ios' || deviceRaw === 'android' || deviceRaw === 'other' ? deviceRaw : deviceFromUserAgent(r.userAgent)
  const cur = pick('currency')?.toUpperCase()
  return {
    token: pick('token', 't') ?? str(bearer, 64) ?? str(q.t, 64) ?? str(q.token, 64),
    text: pick('text', 'sms', 'message', 'body'),
    sender: senderId(pick('sender', 'from')),
    receivedAt: pick('receivedAt', 'received_at'),
    groupId: pick('groupId', 'group') ?? str(q.groupId, 64) ?? str(q.group, 64),
    device,
    amount: pick('amount', 'raw'),
    currency: cur && /^[A-Z]{3}$/.test(cur) ? cur : undefined,
    merchant: pick('merchant'),
    ts: pick('ts', 'date'),
    ref: pick('ref'),
  }
}

export const isTokenShaped = (t: string | undefined): t is string => !!t && /^[A-Za-z0-9_-]{24,64}$/.test(t)
export const isIdShaped = (t: string | undefined): t is string => !!t && /^[A-Za-z0-9_-]{1,64}$/.test(t)

/** Idempotency key from the contract's `ref` ([A-Za-z0-9_-], 4–64); the same helper the app uses. */
export { sanitiseRef } from '../../../shared/money-core'
