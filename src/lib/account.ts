import type { AccountEmail, AuthUser } from '@/data/repo'

/*
 * Accounts: one person, one account (docs/PLAN.md §4.2 "Accounts"). An email-and-password
 * account confirms its email with Firebase's link before anything else; Google accounts are
 * confirmed by Google. Further emails are added with Firebase's sign-in link (functions/src/accounts.ts).
 */

/** Whether this account still has to confirm its email (Firebase's link) before using the app. */
export function needsEmailCode(u: AuthUser | null | undefined): boolean {
  if (!u || u.isAnonymous || u.emailVerified !== false) return false
  // Sign-in method ids (Firebase providerId values), compared whole.
  const has = (id: string) => (u.providers ?? []).some((p) => p === id)
  return has('password') && !has('google.com')
}

/** users/{uid}/account/emails → the added emails, oldest first; anything malformed is skipped. */
export function accountEmailsOf(d: { list?: unknown } | undefined): AccountEmail[] {
  const list = d?.list
  if (!list || typeof list !== 'object') return []
  return Object.values(list as Record<string, { email?: unknown; addedAt?: unknown }>)
    .filter((e): e is AccountEmail => typeof e?.email === 'string' && typeof e.addedAt === 'number')
    .sort((a, b) => a.addedAt - b.addedAt)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What's wrong with an email as typed, or '' when it looks right. */
export function emailProblem(raw: string): string {
  const s = raw.trim()
  if (!s) return 'Enter your email'
  if (s.length > 254 || !EMAIL.test(s)) return 'That doesn’t look like an email address'
  return ''
}

/** "0:24" countdown text until another link can be sent, or '' when it can. */
export function resendIn(ms: number): string {
  if (ms <= 0) return ''
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
