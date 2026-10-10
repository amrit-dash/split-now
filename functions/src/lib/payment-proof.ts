/*
 * The pure half of checking a payment screenshot on the server (payment-ok.ts): what the payment
 * should show, and what the check writes back. shared/payment-ok.ts decides the match itself.
 */
import type { PaymentCheck, PaymentExpect, PaymentRead } from '../../../shared/payment-ok'

export interface ProofSettlement {
  to: string
  amount: number
  date: string
  paid?: { currency: string; amount: number }
  proofPath?: string
  needsOk?: boolean
  ok?: unknown
  flag?: unknown
  aiCheck?: unknown
  deletedAt?: number
}

/** Handles a screenshot can name as the payee: never bank account numbers. */
const HANDLE_KEYS = ['upi', 'phone', 'payid', 'paypal', 'revolut'] as const

/** What a screenshot of this payment should show: what changed hands (Settlement.paid when it was another currency), to the payee. */
export function proofExpect(
  s: ProofSettlement,
  g: { currency?: string; members?: Record<string, { name?: string } | undefined> },
  profile: { displayName?: unknown; payment?: Record<string, unknown> } | undefined,
  usedRefs: string[],
): PaymentExpect {
  const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  return {
    amount: s.paid?.amount ?? s.amount,
    currency: s.paid?.currency ?? g.currency ?? 'INR',
    names: [g.members?.[s.to]?.name, profile?.displayName].filter(str),
    handles: HANDLE_KEYS.map((k) => profile?.payment?.[k]).filter(str),
    date: s.date,
    usedRefs,
  }
}

/** Worth checking: needs an OK, has its screenshot at its own path, and nothing decided yet. */
export function shouldCheck(s: ProofSettlement, groupId: string, settlementId: string): boolean {
  return (
    s.needsOk === true && s.proofPath === `settleproofs/${groupId}/${settlementId}.jpg` && !s.ok && !s.flag && !s.aiCheck && typeof s.deletedAt !== 'number'
  )
}

/**
 * The fields the check writes: what it found (aiCheck, with the payment's reference so the same
 * screenshot can't clear a second payment), and the OK when it matched. A payment the payee
 * decided on meanwhile, or that was deleted, keeps their decision.
 */
export function proofUpdate(check: PaymentCheck, read: PaymentRead | null, now: number, current: ProofSettlement): Record<string, unknown> {
  const aiCheck: Record<string, unknown> = { verdict: check.verdict, reasons: check.reasons, at: now }
  if (read?.ref) aiCheck.ref = read.ref.trim().slice(0, 60)
  const undecided = !current.ok && !current.flag && typeof current.deletedAt !== 'number'
  return check.verdict === 'match' && undecided ? { aiCheck, ok: { by: 'ai', at: now, via: 'ai' } } : { aiCheck }
}

/** What the payee just decided, for the payer's push: an OK they gave (not the screenshot's), or a flag. */
export function payeeDecision(
  before: { ok?: { via?: string }; flag?: unknown } | undefined,
  after: { ok?: { via?: string }; flag?: unknown; deletedAt?: number } | undefined,
): 'ok' | 'flag' | null {
  if (!before || !after || typeof after.deletedAt === 'number') return null
  if (after.flag && !before.flag) return 'flag'
  if (after.ok?.via === 'payee' && before.ok?.via !== 'payee') return 'ok'
  return null
}
