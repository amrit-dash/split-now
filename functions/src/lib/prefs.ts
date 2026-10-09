import { resolveFilters, type CaptureFilterPrefs } from '../../../shared/capture-filters'
/**
 * users/{uid}/settings/notifications. Owner-only (firestore.rules). Missing fields use the
 * defaults below; the client (src/components/NotificationSettings.tsx) writes the same keys.
 */
export interface NotificationPrefs {
  /** a bank SMS matched one of your trips */
  captures: boolean
  /** a captured payment matched no trip ("Unsorted payment"); off by default */
  unsorted: boolean
  /** someone else added an expense that involves you */
  expenses: boolean
  /** someone paid you */
  settlements: boolean
  /** weekly nudge when you owe money */
  reminders: boolean
  /**
   * Capture setting (not a push type): save debit SMS that match no trip dates to the inbox.
   * Off by default: only payments inside a trip window are captured.
   */
  outsideTrips: boolean
}

export type PrefKey = keyof NotificationPrefs

export const DEFAULT_PREFS: NotificationPrefs = { captures: true, unsorted: false, expenses: true, settlements: true, reminders: true, outsideTrips: false }

export function resolvePrefs(raw: unknown): NotificationPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_PREFS }
  for (const k of Object.keys(DEFAULT_PREFS) as PrefKey[]) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean
  return out
}

/** Capture settings stored in the same doc (Settings → Automation). */
export interface CapturePrefs extends CaptureFilterPrefs {
  outsideTrips: boolean
}

export function resolveCapturePrefs(raw: unknown): CapturePrefs {
  return { outsideTrips: resolvePrefs(raw).outsideTrips, ...resolveFilters(raw) }
}
