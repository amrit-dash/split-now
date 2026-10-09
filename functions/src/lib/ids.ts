import { createHash } from 'node:crypto'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** Document id for a token's rate-limit counter (the token itself never becomes a doc id twice). */
export const tokenKey = (token: string) => sha(`rl|${token}`).slice(0, 32)

/**
 * Idempotency: the same bank message (or a retry of the same automation) always maps to the
 * same capture id. With a bank reference: (uid, ref). Without one: (uid, amount, merchant,
 * the minute it was received), so an automation retrying within the minute doesn't duplicate.
 */
export function captureIdFor(uid: string, p: { ref?: string; amount: number; currency?: string; merchant?: string }, receivedAt: Date): string {
  const key = p.ref
    ? `${uid}|ref|${p.ref.toUpperCase()}`
    : `${uid}|${p.amount}|${p.currency ?? ''}|${(p.merchant ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${receivedAt.toISOString().slice(0, 16)}`
  return `sms_${sha(key).slice(0, 24)}`
}
