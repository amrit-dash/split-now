/*
 * What Settings → Automation shows in each detail level (src/lib/look.ts). Before a capture key
 * exists there is nothing to switch, filter or pause yet, so every look but Full shows only the
 * intro and Set up (Full keeps the page as it always was). After setup, the less detail, the
 * fewer extras: Minimal keeps what changes what gets captured, the Advanced (Apple Pay Shortcut)
 * block needs at least When needed and a key.
 */

import { type Look, lookDetail } from './look'

export interface CaptureView {
  /** The Capture payments on/off row */
  master: boolean
  /** "Only payments during a trip" or all payments */
  scope: boolean
  /** Minimum amount and ignored words */
  filters: boolean
  /** Pausing capture for a trip */
  trips: boolean
  /** The webhook's recent messages */
  activity: boolean
  /** Advanced: Apple Pay Shortcut and capture links */
  advanced: boolean
}

export function captureView(look: Look, hasKey: boolean): CaptureView {
  const d = lookDetail(look)
  if (look === 'full') return { master: true, scope: true, filters: true, trips: true, activity: true, advanced: true }
  if (!hasKey) return { master: false, scope: false, filters: false, trips: false, activity: false, advanced: d >= 3 }
  return { master: true, scope: true, filters: d >= 2, trips: true, activity: d >= 2, advanced: d >= 2 }
}
