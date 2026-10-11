/**
 * Numbers an admin can tune that the app itself needs (config/app `tuning`, Admin → Limits):
 * how many Updates load at a time, how many recent entries per group the Inbox keeps live, and how
 * long Recently deleted keeps groups, expenses and payments. Rate limits and anything only the
 * functions use stay in config/limits (shared/limits.ts). Shared by the app and the functions;
 * firestore.rules mirrors the ranges.
 */

export interface AppTuning {
  inboxPageSize: number
  activityWindow: number
  trashDays: number
}
export type TuningName = keyof AppTuning

export const TUNING_META: Record<TuningName, { label: string; hint: string; min: number; max: number; default: number }> = {
  inboxPageSize: { label: 'Updates per page', hint: 'Inbox → Updates loads this many, then more on Show older', min: 10, max: 100, default: 20 },
  activityWindow: { label: 'Live updates per group', hint: 'Recent entries each group keeps live for the Inbox', min: 5, max: 50, default: 15 },
  trashDays: { label: 'Recently deleted keeps items for (days)', hint: 'Groups, expenses and payments, before they go for good', min: 7, max: 90, default: 30 },
}
export const TUNING_NAMES = Object.keys(TUNING_META) as TuningName[]
export const DEFAULT_TUNING: AppTuning = Object.fromEntries(TUNING_NAMES.map((k) => [k, TUNING_META[k].default])) as unknown as AppTuning

/** Stored map → every value, the default for anything missing or out of range. */
export function resolveTuning(raw: unknown): AppTuning {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_TUNING }
  for (const k of TUNING_NAMES) {
    const v = r[k]
    const m = TUNING_META[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= m.min && v <= m.max) out[k] = v
  }
  return out
}

// The app's live copy (set from config/app by src/lib/flags.ts). The functions pass what they
// read explicitly and never rely on this.
let live: AppTuning = DEFAULT_TUNING
export const tuning = (): AppTuning => live
export function setTuning(t: AppTuning) {
  live = t
}
