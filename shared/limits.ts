/*
 * Operational limits an admin can tune without a deploy: config/limits (admins read and write
 * it; the Cloud Functions read it, cached for a minute, and fall back to these defaults when
 * the document is missing or a field is out of range). Pure: no Firebase imports.
 *
 * The shared Gemini key's own limits (perHour, perDay, globalPerDay) live in config/ai with
 * the rest of that key's settings (shared/ai-config.ts), so there is one place for them.
 */

export interface Limits {
  /** capture webhook, per capture key */
  capturePerHour: number
  capturePerDay: number
  /** AI calls on a user's own Gemini key (their bill, but a loop must not run up function costs) */
  aiOwnPerHour: number
  aiOwnPerDay: number
  /** "Nudge" pushes from one person to one debtor about one group, per day */
  nudgePerDay: number
  /** refreshFx callable, per user */
  fxPerUserPerHour: number
  fxPerUserPerDay: number
}

export type LimitName = keyof Limits

export interface LimitMeta {
  label: string
  hint: string
  min: number
  max: number
  default: number
}

/** Order is the order the admin console shows them in; min/max are mirrored in firestore.rules. */
export const LIMIT_META: Record<LimitName, LimitMeta> = {
  capturePerHour: { label: 'Captures per key, per hour', hint: 'Bank SMS forwarded with one capture key', min: 1, max: 1000, default: 60 },
  capturePerDay: { label: 'Captures per key, per day', hint: '', min: 1, max: 10000, default: 300 },
  aiOwnPerHour: { label: 'AI calls on an own key, per hour', hint: 'People who added their own Gemini key', min: 1, max: 1000, default: 120 },
  aiOwnPerDay: { label: 'AI calls on an own key, per day', hint: '', min: 1, max: 10000, default: 600 },
  nudgePerDay: {
    label: 'Nudges per person, per debtor and group, per day',
    hint: '"Remind" pushes between two people about one group',
    min: 1,
    max: 20,
    default: 1,
  },
  fxPerUserPerHour: { label: 'Exchange-rate refreshes per person, per hour', hint: 'The Refresh button next to the currency', min: 1, max: 500, default: 30 },
  fxPerUserPerDay: { label: 'Exchange-rate refreshes per person, per day', hint: '', min: 1, max: 5000, default: 200 },
}

export const LIMIT_NAMES = Object.keys(LIMIT_META) as LimitName[]

export const DEFAULT_LIMITS: Limits = Object.fromEntries(LIMIT_NAMES.map((k) => [k, LIMIT_META[k].default])) as unknown as Limits

const inRange = (v: unknown, m: LimitMeta): v is number => typeof v === 'number' && Number.isInteger(v) && v >= m.min && v <= m.max

/** Stored document → every limit, with the default for anything missing or out of range. */
export function resolveLimits(raw: unknown): Limits {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_LIMITS }
  for (const k of LIMIT_NAMES) if (inRange(r[k], LIMIT_META[k])) out[k] = r[k]
  return out
}

/** Clamp an edited value into its range (the console does this as the admin types). */
export function clampLimit(name: LimitName, v: number): number {
  const m = LIMIT_META[name]
  if (!Number.isFinite(v)) return m.default
  return Math.min(m.max, Math.max(m.min, Math.round(v)))
}

/** The pair the rate limiter takes, for one kind of call. */
export const limitPair = (l: Limits, hour: LimitName, day: LimitName) => ({ perHour: l[hour], perDay: l[day] })
