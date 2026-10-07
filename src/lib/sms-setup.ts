import type { Group } from '@/types'
import { hasTripWindow } from './capture'

/**
 * Pure helpers for the SMS auto-capture setup wizard (src/pages/AutoCaptureSetup.tsx).
 * The webhook contract is documented in docs/AUTO_CAPTURE.md §3.
 */

export type SmsDevice = 'ios' | 'android' | 'other'

/** Reasons POST /api/capture can reject a message with. */
export type WebhookReason = 'bad_token' | 'not_a_debit' | 'unparsed' | 'outside_trip' | 'duplicate' | 'rate_limited' | 'bad_request'

export interface ParsedSms {
  /** minor units (paise for INR) */
  amount: number
  currency: string
  merchant?: string
  direction: 'debit'
  ref?: string
  /** yyyy-mm-dd */
  date: string
}

export type WebhookOk = { ok: true; captureId: string; parsed: ParsedSms; matchedGroupId?: string; pushed: boolean }
export type WebhookResponse = WebhookOk | { ok: false; reason: WebhookReason | string }

export interface WebhookBody {
  token: string
  text: string
  sender?: string
  receivedAt?: string
  groupId?: string
  device?: SmsDevice
}

export const webhookUrl = (origin: string) => `${origin.replace(/\/+$/, '')}/api/capture`

/** Placeholders the user swaps for variables inside the automation app. */
export const IOS_VARS = { text: '[Shortcut Input]', sender: '[Sender]' } as const
export const MACRODROID_VARS = { text: '[sms_message]', sender: '[sms_number]' } as const

/**
 * JSON body template for an automation. A scoped token already names its group on the
 * server, so groupId is not needed in the body.
 */
export function bodyTemplate(token: string, device: 'ios' | 'android'): Record<string, string> {
  const vars = device === 'ios' ? IOS_VARS : MACRODROID_VARS
  return { token, text: vars.text, sender: vars.sender, device }
}

export function bodyTemplateText(token: string, device: 'ios' | 'android'): string {
  return JSON.stringify(bodyTemplate(token, device), null, 2)
}

/**
 * Words that appear in Indian bank / UPI debit alerts. iOS "Message Contains" takes a single
 * string, so each needs its own automation.
 */
export const DEBIT_KEYWORDS = ['debited', 'spent', 'sent Rs'] as const

/** Label stored on a token so the user can tell their keys apart. */
export function tokenLabel(group?: Pick<Group, 'name'> | null): string {
  return (group ? group.name : 'All my trips').slice(0, 60)
}

export type ScopeCheck =
  | { ok: true; state: 'live' | 'upcoming' | 'ended' | 'open'; message: string }
  | { ok: false; state: 'no_dates' | 'personal'; message: string }

/**
 * Can this group be a capture scope? A scoped token only accepts messages dated inside the
 * group's trip window, so a group without dates would accept nothing.
 */
export function checkScope(g: Pick<Group, 'type' | 'startDate' | 'endDate'>, today: string): ScopeCheck {
  if (g.type === 'personal') return { ok: false, state: 'personal', message: 'The personal wallet can’t be a trip. Pick a shared group.' }
  if (!hasTripWindow(g)) return { ok: false, state: 'no_dates', message: 'This group has no trip dates, so a key for it would never match a payment. Add dates first.' }
  if (g.startDate && today < g.startDate) return { ok: true, state: 'upcoming', message: 'The trip hasn’t started yet. Payments are captured once it does.' }
  if (g.endDate && today > g.endDate) return { ok: true, state: 'ended', message: 'This trip has ended, so new payments won’t match it.' }
  if (!g.startDate || !g.endDate) return { ok: true, state: 'open', message: 'The trip is open-ended on one side.' }
  return { ok: true, state: 'live', message: 'The trip is on now. Debits from today are captured.' }
}

/** Date for the test SMS: today, moved into the trip window when the trip isn't live. */
export function sampleDate(today: string, g?: Pick<Group, 'startDate' | 'endDate'> | null): string {
  if (!g) return today
  if (g.startDate && today < g.startDate) return g.startDate
  if (g.endDate && today > g.endDate) return g.endDate
  return today
}

/** yyyy-mm-dd → dd-mm-yy, the way HDFC and ICICI alerts write dates. */
export function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y.slice(2)}`
}

/** A realistic UPI debit alert for the "Send a test" button. */
export function sampleSms(date: string, ref = '123456789012'): string {
  return `Rs.250.00 debited from a/c XX1234 on ${ddmmyy(date)} to VPA swiggy@icici (UPI Ref No ${ref})`
}

/** A fresh 12-digit UPI reference, so repeated tests aren't rejected as duplicates. */
export function randomRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b, i) => (i === 0 ? 1 + (b % 9) : b % 10)).join('')
}

export const REASON_TEXT: Record<WebhookReason, string> = {
  bad_token: 'The key wasn’t recognised. It may have been revoked, so create a new one.',
  not_a_debit: 'That message isn’t a debit. Credits, OTPs and balance alerts are ignored.',
  unparsed: 'The message couldn’t be read as a payment.',
  outside_trip: 'The payment date is outside the trip’s dates, so it was skipped.',
  duplicate: 'Already captured (same reference number).',
  rate_limited: 'Too many messages in a short time. Try again in a minute.',
  bad_request: 'The request was malformed. Check the body fields.',
}

export type TestOutcome =
  | { kind: 'ok'; response: WebhookOk }
  | { kind: 'rejected'; reason: string; message: string }
  | { kind: 'not_deployed'; message: string }
  | { kind: 'error'; message: string }

/** Interpret a reply from POST /api/capture. Pass `json` = null when the body wasn't JSON. */
export function interpretResponse(status: number, json: unknown): TestOutcome {
  const r = json as WebhookResponse | null
  if (r && typeof r === 'object' && 'ok' in r) {
    if (r.ok) return { kind: 'ok', response: r }
    const reason = String(r.reason)
    return { kind: 'rejected', reason, message: REASON_TEXT[reason as WebhookReason] ?? `Rejected: ${reason}` }
  }
  // Hosting without the function rewrite answers 404/405, or serves the SPA's index.html.
  if (status === 404 || status === 405 || (status >= 200 && status < 300)) {
    return { kind: 'not_deployed', message: 'Backend not deployed yet: /api/capture isn’t answering on this site.' }
  }
  return { kind: 'error', message: `The server answered ${status}.` }
}

/** Name the shared iPhone Shortcut must have for the in-app "Test on this iPhone" button. */
export const IOS_SHORTCUT_NAME = 'Split Now SMS'

/**
 * Deep link that runs an installed Shortcut with text input, the same way the Message automation
 * does with a real SMS (Shortcut Input = the text). Opens the Shortcuts app on iOS.
 */
export function runShortcutUrl(name: string, text: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(text)}`
}
