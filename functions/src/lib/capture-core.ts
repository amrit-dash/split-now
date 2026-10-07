import { maskSms, parseAmountMinor, parseBankSms } from '../../../shared/sms-parse'
import { RAW_MAX } from '../config'
import type { CaptureRequest } from './request'
import { sanitiseRef } from './request'
import { parseInstant, transactionDate } from './time'

export type Reason = 'bad_token' | 'not_a_debit' | 'unparsed' | 'outside_trip' | 'duplicate' | 'rate_limited' | 'bad_request'

/**
 * HTTP status per failure. "Handled, nothing to do" outcomes are 200 so automations don't
 * retry; `unparsed` is 422 (the same message will never parse, but it's worth surfacing).
 */
export const STATUS: Record<Reason, number> = {
  bad_token: 401, not_a_debit: 200, unparsed: 422, outside_trip: 200, duplicate: 200, rate_limited: 429, bad_request: 400,
}

export interface Parsed {
  /** minor units */
  amount: number
  currency: string
  merchant?: string
  direction: 'debit'
  ref?: string
  /** yyyy-mm-dd, IST */
  date: string
}

export interface CaptureExtra {
  source: string
  card?: string
  raw?: string
  ts?: string
  receivedAt?: Date
}

export type Interpretation = { ok: true; parsed: Parsed; extra: CaptureExtra } | { ok: false; reason: Reason }

const CURRENCY_HINTS: Array<[RegExp, string]> = [[/₹|\bINR\b|\bRs\b/i, 'INR'], [/US\$|\bUSD\b/i, 'USD'], [/€|\bEUR\b/i, 'EUR'], [/£|\bGBP\b/i, 'GBP'], [/\bAED\b/i, 'AED']]

const clean = (s: string | undefined, n: number) => {
  const v = s?.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, n) : undefined
}

/** Turn a normalised request into what to save, or the reason not to. Pure. */
export function interpret(req: CaptureRequest, now: Date): Interpretation {
  if (!req.text && !req.amount) return { ok: false, reason: 'bad_request' }

  const sms = req.text ? parseBankSms(req.text, { sender: req.sender }) : undefined
  if (sms && sms.kind !== 'debit') {
    // A message we couldn't classify can still be saved from structured fields.
    if (!(sms.kind === 'unknown' && req.amount)) return { ok: false, reason: sms.kind === 'unknown' ? 'unparsed' : 'not_a_debit' }
  }

  const currency = req.currency
    ?? (req.amount ? CURRENCY_HINTS.find(([re]) => re.test(req.amount!))?.[1] : undefined)
    ?? sms?.currency ?? 'INR'
  const amount = req.amount ? parseAmountMinor(req.amount, currency) : sms?.amount
  if (!amount || !Number.isFinite(amount) || amount > 10_000_000_000) return { ok: false, reason: 'unparsed' }

  const receivedAt = parseInstant(req.receivedAt) ?? parseInstant(req.ts)
  const tsDate = req.ts?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const date = transactionDate(sms?.date ?? tsDate, receivedAt, now)

  const smsSource = { ios: 'sms-ios', android: 'sms-android', other: 'sms' }[req.device]
  const linkSource = { ios: 'ios-shortcut', android: 'android-auto', other: 'manual' }[req.device]
  const parsed: Parsed = { amount, currency, direction: 'debit', date }
  const merchant = clean(req.merchant, 100) ?? sms?.merchant
  if (merchant) parsed.merchant = merchant
  const ref = sanitiseRef(req.ref ?? sms?.ref)
  if (ref) parsed.ref = ref

  return {
    ok: true,
    parsed,
    extra: {
      source: req.text ? smsSource : linkSource,
      card: sms?.bank ? `${sms.bank}${sms.account ? ` ••${sms.account}` : ''}` : undefined,
      raw: req.text ? maskSms(req.text, RAW_MAX) : clean(req.amount, 40),
      ts: clean(req.receivedAt ?? req.ts, 40),
      receivedAt,
    },
  }
}

/** users/{uid}/captures/{id} in the Capture shape of src/types.ts (undefined fields dropped). */
export function captureDoc(id: string, p: Parsed, x: CaptureExtra, suggestedGroup: string | undefined, now: number): Record<string, unknown> {
  const d: Record<string, unknown> = {
    id, amount: p.amount, currency: p.currency, merchant: p.merchant ?? 'Payment', date: p.date, ts: x.ts, source: x.source,
    card: x.card, raw: x.raw, suggestedGroup, status: 'pending', createdAt: now, updatedAt: now,
  }
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined))
}
