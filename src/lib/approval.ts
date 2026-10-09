import type { Cents } from '@/types'
import { convertMinor } from './fx'
import { formatMoney, minorDigits } from './money'

/*
 * Default "Needs your OK" thresholds, per currency.
 *
 * A group with approval on and no threshold of its own uses its currency's figure from
 * APPROVAL_DEFAULTS (in major units: ₹2,000, $100, ¥10,000). firestore.rules carries the same
 * table in minor units (approvalThresholdOf) so the app and the rules agree on which expenses
 * must be marked; approval.test.ts reads the rules file to keep the two in step.
 *
 * A currency outside the table falls back to FALLBACK_APPROVAL_THRESHOLD (the old flat default)
 * there, because the rules cannot look up exchange rates. When the app suggests a threshold
 * for a new group in such a currency it converts the INR default at today's rate instead and
 * writes the result onto the group, so the rules never need to know it.
 */

/** Major units of each currency. Rounded to figures people would pick themselves. */
export const APPROVAL_DEFAULTS: Readonly<Record<string, number>> = {
  INR: 2000,
  USD: 100,
  EUR: 100,
  GBP: 100,
  AUD: 100,
  NZD: 100,
  CAD: 100,
  SGD: 100,
  CHF: 100,
  AED: 300,
  THB: 2000,
  MYR: 300,
  LKR: 10000,
  NPR: 3000,
  JPY: 10000,
  KRW: 100000,
  IDR: 1000000,
  HKD: 500,
  CNY: 500,
  PHP: 5000,
  VND: 2000000,
  ZAR: 1000,
  SEK: 1000,
  NOK: 1000,
  DKK: 500,
}

/** The currency the off-table default is converted from. */
export const APPROVAL_BASE_CURRENCY = 'INR'
/** Minor units, for a currency outside the table when no rate is at hand (and in the rules). */
export const FALLBACK_APPROVAL_THRESHOLD: Cents = 10_000

/** The table's figure for `currency` in its minor units, or undefined when it has none. */
export function tableThreshold(currency: string): Cents | undefined {
  const major = APPROVAL_DEFAULTS[currency]
  return major === undefined ? undefined : Math.round(major * 10 ** minorDigits(currency))
}

/**
 * The nearest "nice" figure (1, 2 or 5 × 10^n), compared on a log scale so 3.2 → 2 and
 * 3.3 → 5 (the geometric middle of the steps). Positive input only; 0 or less gives 0.
 */
export function niceNumber(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0
  const exp = Math.floor(Math.log10(x))
  const scale = 10 ** exp
  const steps = [1, 2, 5, 10]
  let best = steps[0]
  for (const s of steps) if (Math.abs(Math.log(x / (s * scale))) < Math.abs(Math.log(x / (best * scale)))) best = s
  // Rebuild from the exponent so 10^-2 style values don't pick up float noise.
  return exp >= 0 ? best * scale : best / 10 ** -exp
}

/** Round an amount in minor units to a nice figure in its currency's major units; never below one minor unit. */
export function niceMinor(minor: Cents, currency: string): Cents {
  const f = 10 ** minorDigits(currency)
  const nice = niceNumber(minor / f)
  return Math.max(1, Math.round(nice * f))
}

/**
 * The default threshold for a group in `currency`: the table, else the INR default converted at
 * `inrRate` (units of `currency` per 1 INR) and rounded, else the flat fallback.
 */
export function defaultThreshold(currency: string, inrRate?: number | null): Cents {
  const fixed = tableThreshold(currency)
  if (fixed !== undefined) return fixed
  if (inrRate && inrRate > 0) {
    const base = tableThreshold(APPROVAL_BASE_CURRENCY) ?? FALLBACK_APPROVAL_THRESHOLD
    return niceMinor(convertMinor(base, APPROVAL_BASE_CURRENCY, currency, inrRate), currency)
  }
  return FALLBACK_APPROVAL_THRESHOLD
}

/**
 * The default edit auto-approve amount: a twentieth of the approval default, rounded (₹2,000 →
 * ₹100, $100 → $5, ¥10,000 → ¥500). Only a suggestion: the setting is off until turned on.
 */
export function defaultEditAutoApprove(currency: string, inrRate?: number | null): Cents {
  return niceMinor(Math.max(1, Math.round(defaultThreshold(currency, inrRate) / 20)), currency)
}

/**
 * An amount moved from one currency to another, rounded to a nice figure (₹200 → $2, A$100 →
 * ¥10,000). Without a rate the amount can't be carried over, so the new currency's default
 * (`fallback`: the approval default unless told otherwise) is used instead. Never 0.
 */
export function convertThreshold(
  amount: Cents,
  from: string,
  to: string,
  rate: number | null | undefined,
  fallback: (currency: string) => Cents = defaultThreshold,
): Cents {
  if (from === to) return amount
  if (!rate || !(rate > 0)) return fallback(to)
  const converted = convertMinor(amount, from, to, rate)
  return converted > 0 ? niceMinor(converted, to) : niceMinor(1, to)
}

/**
 * The user's "Ask for approval on big expenses" setting (users/{uid}.approvalDefault), and the
 * same shape for "Approve small edits automatically" (users/{uid}.editAutoApproveDefault).
 */
export interface ApprovalDefault {
  on: boolean
  /** minor units of `currency` */
  amount: Cents
  currency: string
}

/**
 * The setting as Settings shows it: off at the profile currency's default when never set
 * (`fallback`: defaultThreshold for approval, defaultEditAutoApprove for edits).
 */
export function approvalDefaultOf(
  setting: ApprovalDefault | undefined,
  profileCurrency: string,
  fallback: (currency: string) => Cents = defaultThreshold,
): ApprovalDefault {
  if (setting && setting.amount > 0 && typeof setting.currency === 'string') return setting
  return { on: setting?.on ?? false, amount: fallback(profileCurrency), currency: profileCurrency }
}

/**
 * The setting after the user changes their default currency: the amount follows at `rate`
 * (units of `to` per 1 of the setting's currency), rounded to a nice figure.
 */
export function approvalDefaultInCurrency(
  setting: ApprovalDefault,
  to: string,
  rate: number | null | undefined,
  fallback: (currency: string) => Cents = defaultThreshold,
): ApprovalDefault {
  if (setting.currency === to) return setting
  return { on: setting.on, amount: convertThreshold(setting.amount, setting.currency, to, rate, fallback), currency: to }
}

/**
 * What a new group's form starts with: the user's setting, its amount carried into the group's
 * currency at `rate` (units of the group currency per 1 of the setting's currency). With no
 * setting, approval is off and the amount is the group currency's default (`inrRate` for an
 * off-table currency).
 */
export function newGroupApproval(
  setting: ApprovalDefault | undefined,
  groupCurrency: string,
  rates: { fromSetting?: number | null; inr?: number | null } = {},
): { requireApproval: boolean; threshold: Cents } {
  const { on, amount } = newGroupAmount(setting, groupCurrency, rates, defaultThreshold)
  return { requireApproval: on, threshold: amount }
}

/** The same for edit auto-approve: the user's setting in the group's currency, else off at the currency's default amount. */
export function newGroupEditAutoApprove(
  setting: ApprovalDefault | undefined,
  groupCurrency: string,
  rates: { fromSetting?: number | null; inr?: number | null } = {},
): { on: boolean; amount: Cents } {
  return newGroupAmount(setting, groupCurrency, rates, defaultEditAutoApprove)
}

function newGroupAmount(
  setting: ApprovalDefault | undefined,
  groupCurrency: string,
  rates: { fromSetting?: number | null; inr?: number | null },
  fallback: (currency: string, inrRate?: number | null) => Cents,
): { on: boolean; amount: Cents } {
  if (!setting || !(setting.amount > 0)) return { on: !!setting?.on, amount: fallback(groupCurrency, rates.inr) }
  if (setting.currency === groupCurrency) return { on: setting.on, amount: setting.amount }
  const amount =
    rates.fromSetting && rates.fromSetting > 0
      ? convertThreshold(setting.amount, setting.currency, groupCurrency, rates.fromSetting, (c) => fallback(c, rates.inr))
      : fallback(groupCurrency, rates.inr)
  return { on: setting.on, amount }
}

/** Shape check for a stored setting (a profile is read from the server and may be anything). */
export function isApprovalDefault(x: unknown): x is ApprovalDefault {
  const o = x as ApprovalDefault | null
  return (
    !!o &&
    typeof o === 'object' &&
    typeof o.on === 'boolean' &&
    Number.isInteger(o.amount) &&
    o.amount > 0 &&
    typeof o.currency === 'string' &&
    o.currency.length === 3
  )
}

/** Money without zero decimals, for short labels: ₹2,000 rather than ₹2,000.00 (₹20.50 stays). */
export const shortMoney = (amount: Cents, currency: string) => formatMoney(amount, currency).replace(/[.,]0+$/, '')

/**
 * The Settings hub's words for the two settings ("Approval over ₹2,000, edits within ₹100
 * pass"), or null when approval is off (edit auto-approve means nothing without it).
 */
export function approvalSummary(setting: ApprovalDefault | undefined, edits?: ApprovalDefault): string | null {
  if (!setting?.on || !(setting.amount > 0)) return null
  const base = `Approval over ${shortMoney(setting.amount, setting.currency)}`
  return edits?.on && edits.amount > 0 ? `${base}, edits within ${shortMoney(edits.amount, edits.currency)} pass` : base
}

// ---- Deciding what an edit does to approval ---------------------------------------------

/** The approval fields of a group (src/types.ts Group). */
export interface ApprovalGroup {
  requireApproval?: boolean
  approvalThreshold?: Cents
  currency?: string
  editAutoApprove?: Cents
}

/**
 * The group's approval threshold: its own, else its currency's default. No rate here: an
 * off-table currency gets the flat fallback, as in the rules (approvalThresholdOf).
 */
export const groupThreshold = (g: ApprovalGroup): Cents => g.approvalThreshold ?? defaultThreshold(g.currency ?? '')

/** Whether an expense of this amount needs approval in this group: approval on and strictly above the threshold. */
export const approvalNeeded = (g: ApprovalGroup, amount: Cents): boolean => !!g.requireApproval && amount > groupThreshold(g)

/**
 * What an edit does to an expense's approval (mirrors firestore.rules):
 *  - 'clear': the new amount needs no approval (at or below the threshold, or approval off),
 *    so requiresApproval goes and the expense counts at once;
 *  - 'keep': nothing to ask again. Either the amount didn't change (a description, category or
 *    split edit keeps today's state), or the expense was already marked and the group's edit
 *    auto-approve covers the change (|new − old| ≤ editAutoApprove): approvals given stay, a
 *    pending one stays pending;
 *  - 'rerequest': the amount changed beyond that (or auto-approve is off), so it is marked and
 *    everyone charged approves again.
 */
export type EditApprovalOutcome = 'clear' | 'keep' | 'rerequest'

export function editApprovalOutcome({
  group,
  before,
  after,
}: {
  group: ApprovalGroup
  before: { amount: Cents; requiresApproval?: boolean }
  after: { amount: Cents }
}): EditApprovalOutcome {
  if (!approvalNeeded(group, after.amount)) return 'clear'
  if (after.amount === before.amount) return 'keep'
  const limit = group.editAutoApprove
  if (before.requiresApproval && limit && limit > 0 && Math.abs(after.amount - before.amount) <= limit) return 'keep'
  return 'rerequest'
}

/** An amount change that edit auto-approve let through (the activity line says so). */
export function editAutoApproved(args: Parameters<typeof editApprovalOutcome>[0]): boolean {
  return args.after.amount !== args.before.amount && editApprovalOutcome(args) === 'keep'
}
