import type { AiStatusResult, AppAiStatusValue } from '@/data/repo'
import type { AiUnavailableReason } from '../../shared/ai-config'

/*
 * The AI reader's availability as one answer for the settings screens, the scan toggle and the
 * statement import gate, and the per-call "why not" line (`unavailableText`).
 */

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
export function aiAvailability(opts: {
  status: AiStatusResult | null | undefined
  hasOwnKey: boolean
  ownKeyBroken?: boolean
  enabled: boolean
}): AiAvailability {
  const { status, hasOwnKey, ownKeyBroken, enabled } = opts
  if (!enabled) return { images: false, sms: false, text: 'Off: nothing is sent to any AI', tone: 'muted' }
  const own = hasOwnKey && !ownKeyBroken
  if (status === undefined) return { images: own, sms: own, text: own ? 'Using your own key' : 'Checking…', tone: own ? 'ok' : 'muted' }
  if (status === null)
    return { images: own, sms: own, text: own ? 'Using your own key' : 'Can’t check right now (offline, or not set up yet)', tone: own ? 'ok' : 'muted' }
  const images = status.app.images === 'available' || own
  const sms = status.app.sms === 'available' || own
  if (images && sms) return { images, sms, text: status.app.images === 'available' ? 'Available' : 'Using your own key', tone: 'ok' }
  if (images || sms) return { images, sms, text: `Available for ${images ? 'bills' : 'SMS'} only`, tone: 'ok' }
  if (hasOwnKey && ownKeyBroken) return { images, sms, text: 'Your key isn’t working', tone: 'warn' }
  return { images, sms, text: APP_TEXT[status.app.images], tone: 'muted' }
}

/**
 * The Settings hub's one-line AI summary: on/off, what it reads, and a warning only when no key
 * can serve it. `status` undefined means the shared key's status is still loading (no warning yet).
 */
export function aiSummaryText(opts: {
  mode: 'firebase' | 'demo'
  prefs: { aiEnabled?: boolean; aiImages?: boolean; aiSms?: boolean; aiQuickAdd?: boolean; aiSource?: string } | null
  /** the user has their own key (AiState.hint) */
  hasOwnKey: boolean
  status: Pick<AiStatusResult, 'app'> | null | undefined
}): string | undefined {
  const { mode, prefs, hasOwnKey, status } = opts
  if (mode !== 'firebase') return undefined
  if (!prefs) return 'Gemini reads bills, statements and hard-to-read SMS'
  if (!prefs.aiEnabled) return 'Off · bills are read on this phone'
  const uses = [prefs.aiImages && 'Bills & statements', prefs.aiSms && 'SMS', prefs.aiQuickAdd && 'Quick add'].filter(Boolean).join(', ')
  if (!uses) return 'On · nothing selected'
  const shared = prefs.aiSource !== 'own' && (status?.app.images === 'available' || status?.app.sms === 'available')
  const own = hasOwnKey && prefs.aiSource !== 'app'
  return `On · ${uses}${own || shared || status === undefined ? '' : ' · no key available'}`
}

/**
 * One line per reason, for the Scan / Statement screens. 'off', 'not_listed' and 'not_configured'
 * are not errors (the phone reads the bill instead); 'quota', 'bad_key' and 'server' are worth a
 * neutral mention. `limit` is the daily shared-key allowance, when known. `onPhone: false` is for
 * reads with no on-phone fallback (statement import): the line says why and stops there.
 */
export function unavailableText(reason: AiUnavailableReason | undefined, opts: { limit?: number; onPhone?: boolean } = {}): string {
  const phone = opts.onPhone !== false
  switch (reason) {
    case 'quota':
      return `You’ve used today’s AI limit${opts.limit ? ` (${opts.limit})` : ''}.${phone ? ' Read on your phone for now.' : ''}`
    case 'bad_key':
      return `Google rejected the Gemini key. Check it in Settings → AI features${phone ? '; reading on your phone instead.' : '.'}`
    case 'server':
      return `Gemini didn’t answer.${phone ? ' Reading on your phone instead.' : ''}`
    case 'not_listed':
      return `AI reading is limited to listed accounts.${phone ? ' Reading on your phone instead.' : ''}`
    case 'not_configured':
      return `AI reading isn’t set up for this app.${phone ? ' Reading on your phone instead.' : ''}`
    case 'off':
      return `AI reading is off.${phone ? ' Reading on your phone instead.' : ''}`
    default:
      return `AI reading isn’t available right now.${phone ? ' Reading on your phone instead.' : ''}`
  }
}

/** Reasons that mean "nothing to fix": show nothing, or at most a quiet line. */
export const isQuietReason = (reason: AiUnavailableReason | undefined) => reason === 'off' || reason === 'not_listed' || reason === 'not_configured'
