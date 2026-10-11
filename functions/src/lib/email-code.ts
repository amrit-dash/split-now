/*
 * Email codes: a 6-digit code sent to an address proves the person can read it. Used once to
 * verify an email-and-password account, and each time someone adds another email to their
 * account. Only a salted hash is stored (emailCodes/{uid}, server-only), one code per person at
 * a time; a code lasts 10 minutes and allows 5 tries, and a new one can be sent every 30 seconds
 * (with an hourly and daily cap in rateLimits). Pure: the functions store and send (email-codes.ts).
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export type CodePurpose = 'verify' | 'add'

export interface StoredCode {
  email: string
  purpose: CodePurpose
  hash: string
  salt: string
  expiresAt: number
  attempts: number
  sentAt: number
}

export const CODE_TTL_MS = 10 * 60_000
export const MAX_ATTEMPTS = 5
export const RESEND_GAP_MS = 30_000
/** Sends per person, across addresses: enough for typos and a lost email, not for spamming an inbox. */
export const SEND_LIMIT = { perHour: 6, perDay: 15 }

/** Six digits, leading zeros kept. */
export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashCode = (code: string, salt: string): string => createHash('sha256').update(`${salt}:${code}`).digest('hex')

/** What someone typed, as a code: digits only (spaces and dashes from a pasted "123 456" dropped), or '' when it isn't 6 digits. */
export function cleanCode(input: unknown): string {
  const s = typeof input === 'string' ? input.replace(/[\s-]/g, '') : ''
  return /^\d{6}$/.test(s) ? s : ''
}

export type CheckResult = 'ok' | 'missing' | 'other-email' | 'expired' | 'locked' | 'wrong'

/** Whether `code` confirms `email` for this purpose; the caller counts a 'wrong' as a try. */
export function checkCode(stored: StoredCode | undefined, email: string, purpose: CodePurpose, code: string, now: number): CheckResult {
  if (!stored || stored.purpose !== purpose) return 'missing'
  if (stored.email !== email) return 'other-email'
  if (now > stored.expiresAt) return 'expired'
  if (stored.attempts >= MAX_ATTEMPTS) return 'locked'
  const a = Buffer.from(hashCode(code, stored.salt), 'hex')
  const b = Buffer.from(stored.hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'wrong'
}

/** Milliseconds until another code can be sent (0 = now). */
export const resendWait = (stored: Pick<StoredCode, 'sentAt'> | undefined, now: number): number =>
  stored ? Math.max(0, stored.sentAt + RESEND_GAP_MS - now) : 0

/** The message for a failed check, in the app's words. */
export function checkMessage(r: Exclude<CheckResult, 'ok'>): string {
  switch (r) {
    case 'missing':
    case 'other-email':
      return 'Send a new code first'
    case 'expired':
      return 'That code has expired. Send a new one'
    case 'locked':
      return 'Too many tries. Send a new code'
    case 'wrong':
      return 'That code isn’t right. Check the email and try again'
  }
}
