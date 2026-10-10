import type { Cents } from '@/types'
import type { CaptureFilterPrefs } from '../../shared/capture-filters'
import { filterReason } from '../../shared/capture-filters'
import { currencyFromAmount, fingerprint, sanitiseRef } from '../../shared/money-core'
import { isBankLikeSms, maskSms, parseBankSms, type SmsKind } from '../../shared/sms-parse'
import { centsToInput, fromHundredths, minorDigits } from './money'
import { findAmounts, parseDate, parsePaymentScreenshot } from './ocr-parse'

// Shared with the capture webhook (shared/trips.ts, shared/money-core.ts): one ranking, one
// currency inference, on both sides.
export { hasTripWindow, inTripWindow, isLiveTrip, liveTripFor, pausedTrip, rankGroupsForCapture, tripCaptureRelevant } from '../../shared/trips'
export { currencyFromAmount, sanitiseRef }

/** What a /capture URL (or an inbox document) describes, after validation. */
export interface CaptureDraft {
  amount: Cents
  currency?: string
  merchant: string
  date: string
  /** original ISO 8601 timestamp, if one was given */
  ts?: string
  source: string
  card?: string
  raw?: string
  note?: string
  /** idempotency key; becomes the capture's document id */
  ref?: string
  /** groupId the link asks to pre-select */
  group?: string
}

/** `token`/`owner` come from `t` and `u`, used only by the signed-out fallback (writes to captureInbox). */
export type CaptureParse = { ok: true; draft: CaptureDraft; token?: string; owner?: string } | { ok: false; error: string }

export const SOURCE_LABEL: Record<string, string> = {
  'sms-ios': 'iPhone SMS',
  'sms-android': 'Android SMS',
  sms: 'SMS',
  'ios-shortcut': 'Apple Pay',
  'android-auto': 'Android',
  share: 'Shared',
  email: 'Email',
  manual: 'Link',
  statement: 'Statement',
}

/** Older/alternative `src` names we accept and normalise. */
const SOURCE_ALIASES: Record<string, string> = {
  applepay: 'ios-shortcut',
  'apple-pay': 'ios-shortcut',
  ios: 'ios-shortcut',
  shortcut: 'ios-shortcut',
  shortcuts: 'ios-shortcut',
  android: 'android-auto',
  tasker: 'android-auto',
  macrodroid: 'android-auto',
  automate: 'android-auto',
  'ios-sms': 'sms-ios',
  'android-sms': 'sms-android',
}

/** Sources that came from a bank/UPI SMS forwarded by the webhook. */
export const isSmsSource = (source: string) => source === 'sms-ios' || source === 'sms-android' || source === 'sms'

export function normaliseSource(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20)
  return SOURCE_ALIASES[s] ?? (s || 'manual')
}

/**
 * Parse an amount from an automation ("A$12.50", "$1,234.56", "12,50 €", "-4.20") to positive cents.
 * Signs are ignored: card apps report purchases as negative or positive depending on locale.
 * Returns NaN when no usable amount is present.
 */
export function parseCaptureAmount(raw: string, currency?: string): Cents {
  let t = raw.replace(/[^\d.,]/g, '')
  if (!t || !/\d/.test(t)) return NaN
  const lastDot = t.lastIndexOf('.')
  const lastComma = t.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal point.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // "12,50" → decimal comma; "1,234" → thousands separator.
    t = /,\d{1,2}$/.test(t) && (t.match(/,/g) ?? []).length === 1 ? t.replace(',', '.') : t.replace(/,/g, '')
  } else if ((t.match(/\./g) ?? []).length > 1) {
    // "1.234.567" → thousands separators only.
    t = t.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN
  // Minor units of the currency when known (whole yen for JPY), else cents.
  const cents = Math.round(Number(t) * 10 ** minorDigits(currency))
  return Number.isFinite(cents) && cents > 0 ? cents : NaN
}

/**
 * Accepts yyyy-mm-dd, a full ISO 8601 timestamp (the date is taken as written, i.e. in the
 * sender's own offset), or the formats the OCR date parser knows. Falls back to `today`.
 */
export function parseCaptureDate(raw: string | null | undefined, today: string): string {
  const s = raw?.trim()
  if (!s) return today
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso[0] ? iso[0] : today
  }
  return parseDate(s) ?? today
}

const clip = (s: string | null | undefined, n: number) => {
  const v = s?.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, n) : undefined
}

/**
 * Validate the query string of a /capture link (URL contract v=1, see docs/AUTO_CAPTURE.md).
 * Aliases accepted: source→src, date→ts (yyyy-mm-dd), token→t.
 * If `amount` is missing, `raw` (the original amount string, e.g. "A$12.50") is parsed instead.
 */
export function parseCaptureParams(params: URLSearchParams, today: string): CaptureParse {
  const v = params.get('v')
  if (v && v !== '1') return { ok: false, error: `This link uses capture format v${v.slice(0, 5)}, which this version of Split Now doesn’t understand.` }

  const raw = clip(params.get('raw'), 40)
  const amountStr = params.get('amount')?.trim() || raw
  if (!amountStr) return { ok: false, error: 'The link has no amount.' }
  const cur = params.get('currency')?.trim().toUpperCase()
  const currency = cur && /^[A-Z]{3}$/.test(cur) ? cur : (currencyFromAmount(amountStr) ?? (raw ? currencyFromAmount(raw) : undefined))
  const amount = parseCaptureAmount(amountStr, currency)
  if (!Number.isFinite(amount)) return { ok: false, error: `“${amountStr.slice(0, 30)}” isn’t a valid amount.` }
  if (amount > 100_000_000) return { ok: false, error: 'That amount looks too large.' }

  const merchant = clip(params.get('merchant'), 100)
  if (!merchant) return { ok: false, error: 'The link has no merchant.' }

  const ts = clip(params.get('ts'), 40)

  return {
    ok: true,
    token: clip(params.get('t') ?? params.get('token'), 64),
    owner: clip(params.get('u'), 128),
    draft: {
      amount,
      currency,
      merchant,
      date: parseCaptureDate(ts ?? params.get('date'), today),
      ts,
      source: normaliseSource(params.get('src') ?? params.get('source')),
      card: clip(params.get('card'), 40),
      raw,
      note: clip(params.get('note'), 200),
      ref: sanitiseRef(params.get('ref')),
      group: clip(params.get('group'), 64),
    },
  }
}

/** Build a /capture query string (contract v=1). */
export function captureQuery(d: Partial<CaptureDraft> & { amount: Cents | string }): string {
  const p = new URLSearchParams({ v: '1' })
  p.set('amount', typeof d.amount === 'number' ? centsToInput(d.amount, d.currency) : d.amount)
  const keys: Array<[keyof CaptureDraft, string]> = [
    ['currency', 'currency'],
    ['merchant', 'merchant'],
    ['ts', 'ts'],
    ['source', 'src'],
    ['card', 'card'],
    ['raw', 'raw'],
    ['note', 'note'],
    ['ref', 'ref'],
    ['group', 'group'],
  ]
  for (const [k, name] of keys) if (d[k]) p.set(name, String(d[k]))
  if (d.date && !d.ts) p.set('date', d.date)
  return p.toString()
}

// ---- Background inbox (captureInbox/{id}, written by Shortcuts via the Firestore REST API) ----

/** A raw captureInbox document as written by an unauthenticated automation. */
export interface InboxDoc {
  token: string
  uid: string
  amount?: number
  raw?: string
  currency?: string
  merchant: string
  ts?: string
  src?: string
  card?: string
}

/** Turn an inbox document into a capture draft, or null if no amount can be recovered. */
export function inboxToDraft(d: InboxDoc, today: string): CaptureDraft | null {
  const cur = d.currency?.trim().toUpperCase()
  const currency = cur && /^[A-Z]{3}$/.test(cur) ? cur : d.raw ? currencyFromAmount(d.raw) : undefined
  // An integer `amount` is already in minor units (see docs/AUTO_CAPTURE.md).
  const amount = typeof d.amount === 'number' && Number.isInteger(d.amount) && d.amount > 0 ? d.amount : d.raw ? parseCaptureAmount(d.raw, currency) : NaN
  if (!Number.isFinite(amount)) return null
  return {
    amount,
    currency,
    merchant: clip(d.merchant, 100) ?? 'Unknown merchant',
    date: parseCaptureDate(d.ts, today),
    ts: clip(d.ts, 40),
    source: normaliseSource(d.src ?? 'ios-shortcut'),
    card: clip(d.card, 40),
    raw: clip(d.raw, 40),
  }
}

/** Random capture token: 28 chars from a 32-letter alphabet (140 bits). */
export function newCaptureToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(28))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

// ---- Share target -----------------------------------------------------

/**
 * What a text shared into the app turned out to be:
 *  capture   a payment; `draft` is ready for the /capture prompt
 *  ignored   a bank message that isn't a payment (`kind`: credit, otp, balance, promo, failed,
 *            request, reminder, transfer), or a debit the user's filters drop (`filtered`)
 *  none      no amount in the text
 */
export type SharedTextOutcome =
  | { outcome: 'capture'; draft: CaptureDraft }
  | { outcome: 'ignored'; kind: Exclude<SmsKind, 'debit' | 'unknown'> }
  | { outcome: 'ignored'; kind: 'debit'; filtered: 'below_min' | 'ignored' }
  | { outcome: 'none' }

const IGNORED_TEXT: Record<Exclude<SmsKind, 'debit' | 'unknown'>, string> = {
  credit: 'That’s money you received, not a payment.',
  otp: 'That’s a one-time code, not a payment.',
  balance: 'That’s a balance alert, not a payment.',
  promo: 'That’s an offer, not a payment.',
  failed: 'That payment failed or was reversed, so there’s nothing to add.',
  request: 'That’s a request to pay, not a payment.',
  reminder: 'That’s a reminder, not a payment.',
  transfer: 'That’s a transfer between your own accounts, not a payment.',
}

/** Plain-English line for an ignored share, for the Share screen. */
export function sharedTextIgnoredText(o: Extract<SharedTextOutcome, { outcome: 'ignored' }>): string {
  if (o.kind !== 'debit') return IGNORED_TEXT[o.kind]
  return o.filtered === 'below_min'
    ? 'That payment is below your minimum amount (Settings → Automation).'
    : 'That message matches one of your ignore keywords (Settings → Automation).'
}

/**
 * Classify text shared into the app (Android share sheet): a bank / UPI SMS goes through the
 * same parser, masking and user filters as the capture webhook, so a credit, an OTP or a UPI
 * Lite top-up is never saved as a payment and the stored note never holds an account number.
 * Other text ("You paid $12.50 to Cafe Luna", a card app's notification) falls back to the
 * payment-screenshot parser. `filters` are the user's auto-capture filters, when known.
 */
export function classifySharedText(
  parts: { title?: string | null; text?: string | null; url?: string | null },
  today: string,
  filters?: Pick<CaptureFilterPrefs, 'minAmount' | 'ignoreWords'>,
): SharedTextOutcome {
  const text = [parts.title, parts.text].filter(Boolean).join('\n').trim()
  if (!text) return { outcome: 'none' }
  const sms = parseBankSms(text)
  if (sms.kind !== 'debit' && sms.kind !== 'unknown') return { outcome: 'ignored', kind: sms.kind }
  if (sms.kind === 'debit' && sms.amount) {
    const parsed = { amount: sms.amount, currency: sms.currency, merchant: sms.merchant }
    const filtered = filters ? filterReason(filters, parsed, text) : undefined
    if (filtered) return { outcome: 'ignored', kind: 'debit', filtered }
    const masked = maskSms(text, 200)
    // The bank reference dedupes the same SMS however it arrives; without one, the message itself does.
    const ref = sanitiseRef(sms.ref ? `sms_${sms.ref}` : `shr_${fingerprint(masked.toLowerCase().replace(/\s+/g, ' '))}`)
    return {
      outcome: 'capture',
      draft: compactDraft({
        amount: sms.amount,
        currency: sms.currency,
        merchant: sms.merchant ?? (sms.method === 'atm' ? 'ATM withdrawal' : 'Payment'),
        date: sms.date ?? today,
        source: 'share',
        card: sms.bank ? `${sms.bank}${sms.account ? ` ••${sms.account}` : ''}` : undefined,
        note: masked,
        ref,
      }),
    }
  }
  const payment = parsePaymentScreenshot(text)
  const found = payment.amount && payment.amount > 0 ? payment.amount : findAmounts(text).find((a) => a > 0)
  if (!found) return { outcome: 'none' }
  const currency = currencyFromAmount(text)
  // The text parsers return hundredths; convert to the currency's minor units.
  const amount = fromHundredths(found, currency)
  const merchant = payment.payee ?? text.match(/\bat\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/)?.[1]
  // Even a message the parser can't classify gets its numbers masked before it is stored.
  const note = isBankLikeSms(text) ? maskSms(text, 200) : clip(text, 200)
  return {
    outcome: 'capture',
    draft: compactDraft({
      amount,
      currency,
      merchant: clip(merchant, 100) ?? 'Shared payment',
      date: payment.date ?? today,
      source: 'share',
      note,
    }),
  }
}

const compactDraft = (d: CaptureDraft): CaptureDraft => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as CaptureDraft

/**
 * Turn text shared into the app into a capture, or null when there is nothing to capture
 * (no amount, or a bank message that isn't a payment). classifySharedText says which.
 */
export function captureFromSharedText(
  parts: { title?: string | null; text?: string | null; url?: string | null },
  today: string,
  filters?: Pick<CaptureFilterPrefs, 'minAmount' | 'ignoreWords'>,
): CaptureDraft | null {
  const r = classifySharedText(parts, today, filters)
  return r.outcome === 'capture' ? r.draft : null
}
