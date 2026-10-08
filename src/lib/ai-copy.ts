import type { AiStatusResult, AppAiStatusValue } from '@/data/repo'
import type { AiUnavailableReason as ServerReason } from '@/lib/ai-config'

/*
 * User-facing copy for the AI reader's state. The server answers `{ unavailable: true, reason }`
 * (AiUnavailableReason in shared/ai-config.ts, via src/lib/ai.ts); the UI never shows a
 * successful on-phone fallback as an error, and only points at the key settings when a key
 * would actually help.
 */

/** Why AI reading didn't happen: the server's `unavailable.reason`, plus the client's own cases. */
export type AiUnavailableReason = ServerReason | 'offline' | 'demo' | 'disabled' | 'unknown'

/** One calm sentence for a toast or status line. Never blames the user. */
export function aiUnavailableText(reason: AiUnavailableReason | string | undefined): string {
  switch (reason) {
    case 'quota': return 'Today’s AI limit is used up, so this was read on your phone.'
    case 'off': return 'AI reading is turned off for this app, so this was read on your phone.'
    case 'not_listed': return 'AI reading isn’t turned on for your account, so this was read on your phone.'
    case 'not_configured': return 'AI reading isn’t set up yet, so this was read on your phone.'
    case 'bad_key': return 'Your Gemini key was rejected, so this was read on your phone.'
    case 'server': return 'Gemini didn’t answer, so this was read on your phone.'
    case 'offline': return 'You’re offline, so this was read on your phone.'
    case 'demo': return 'Demo mode reads bills on your phone.'
    case 'disabled': return 'AI reading is off in Settings, so this was read on your phone.'
    default: return 'Read on your phone instead (AI not available right now).'
  }
}

/** Whether adding or fixing the user's own key could change the outcome. */
export function ownKeyWouldHelp(reason: AiUnavailableReason | string | undefined): boolean {
  return reason === 'off' || reason === 'not_listed' || reason === 'not_configured' || reason === 'bad_key'
}

export interface AiAvailability {
  /** Something can read bills right now: the shared key, or the user's own key. */
  images: boolean
  sms: boolean
  /** Short status for the settings screen. */
  text: string
  tone: 'ok' | 'muted' | 'warn'
}

const APP_TEXT: Record<AppAiStatusValue, string> = {
  available: 'Available',
  off: 'Turned off for this app',
  not_listed: 'Not turned on for your account',
  feature_off: 'Turned off for this feature',
}

/**
 * Combine the shared-key status with the user's own key and switch into one answer. `status`
 * is undefined while it is being checked and null when it can't be (offline, demo).
 */
export function aiAvailability(opts: { status: AiStatusResult | null | undefined; hasOwnKey: boolean; ownKeyBroken?: boolean; enabled: boolean }): AiAvailability {
  const { status, hasOwnKey, ownKeyBroken, enabled } = opts
  if (!enabled) return { images: false, sms: false, text: 'Off: nothing is sent to any AI', tone: 'muted' }
  const own = hasOwnKey && !ownKeyBroken
  if (status === undefined) return { images: own, sms: own, text: own ? 'Using your own key' : 'Checking…', tone: own ? 'ok' : 'muted' }
  if (status === null) return { images: own, sms: own, text: own ? 'Using your own key' : 'Can’t check right now (offline, or not set up yet)', tone: own ? 'ok' : 'muted' }
  const images = status.app.images === 'available' || own
  const sms = status.app.sms === 'available' || own
  if (images && sms) return { images, sms, text: status.app.images === 'available' ? 'Available' : 'Using your own key', tone: 'ok' }
  if (images || sms) return { images, sms, text: `Available for ${images ? 'bills' : 'SMS'} only`, tone: 'ok' }
  if (hasOwnKey && ownKeyBroken) return { images, sms, text: 'Your key isn’t working', tone: 'warn' }
  return { images, sms, text: APP_TEXT[status.app.images], tone: 'muted' }
}
