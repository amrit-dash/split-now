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

// Nothing can serve this person: say so, and that their own key is the way in.
const APP_TEXT: Record<AppAiStatusValue, string> = {
  available: 'Available',
  off: 'AI features aren’t available. Add your own Gemini key to use them',
  not_listed: 'Not turned on for your account. Add your own Gemini key to use AI',
  feature_off: 'Turned off for this feature. Add your own Gemini key to use it',
}

/** Split Now's AI is the free one (Gemma): it serves a person only after they agree to it. */
export const isFreeAi = (status: Pick<AiStatusResult, 'app'> | null | undefined) => status?.app.engine === 'gemma'

/**
 * Combine the shared-key status with the user's own key and switch into one answer. `status`
 * is undefined while it is being checked and null when it can't be (offline, demo). `freeOk` is
 * the person's agreement to the free AI (aiFreeOk), which the shared key needs when it runs Gemma.
 */
export function aiAvailability(opts: {
  status: AiStatusResult | null | undefined
  hasOwnKey: boolean
  ownKeyBroken?: boolean
  enabled: boolean
  freeOk?: boolean
}): AiAvailability {
  const { hasOwnKey, ownKeyBroken, enabled } = opts
  // Gemma the person hasn't agreed to can't serve them: count it as off, but say how to turn it on.
  const waiting = isFreeAi(opts.status) && !opts.freeOk
  const status =
    opts.status && waiting ? { ...opts.status, app: { ...opts.status.app, images: off(opts.status.app.images), sms: off(opts.status.app.sms) } } : opts.status
  if (!enabled) return { images: false, sms: false, text: 'Off: nothing is sent to any AI', tone: 'muted' }
  const own = hasOwnKey && !ownKeyBroken
  if (status === undefined) return { images: own, sms: own, text: own ? 'Using your own key' : 'Checking…', tone: own ? 'ok' : 'muted' }
  if (status === null)
    return { images: own, sms: own, text: own ? 'Using your own key' : 'Can’t check right now (offline, or not set up yet)', tone: own ? 'ok' : 'muted' }
  const images = status.app.images === 'available' || own
  const sms = status.app.sms === 'available' || own
  const free = isFreeAi(status) && status.app.images === 'available' ? ' · free AI, slower' : ''
  if (images && sms) return { images, sms, text: status.app.images === 'available' ? `Available${own ? '' : free}` : 'Using your own key', tone: 'ok' }
  if (images || sms) return { images, sms, text: `Available for ${images ? 'bills' : 'SMS'} only`, tone: 'ok' }
  if (hasOwnKey && ownKeyBroken) return { images, sms, text: 'Your key isn’t working', tone: 'warn' }
  if (waiting && (opts.status?.app.images === 'available' || opts.status?.app.sms === 'available'))
    return { images, sms, text: 'Free AI is available. Turn on “Use free AI” to use it', tone: 'muted' }
  return { images, sms, text: APP_TEXT[status.app.images], tone: 'muted' }
}

const off = (v: AppAiStatusValue): AppAiStatusValue => (v === 'available' ? 'off' : v)

/**
 * The Settings hub's one-line AI summary: on/off, what it reads, and a warning only when no key
 * can serve it. `status` undefined means the shared key's status is still loading (no warning yet).
 */
export function aiSummaryText(opts: {
  mode: 'firebase' | 'demo'
  prefs: { aiEnabled?: boolean; aiImages?: boolean; aiSms?: boolean; aiQuickAdd?: boolean; aiPayments?: boolean; aiSource?: string; aiFreeOk?: boolean } | null
  /** the user has their own key (AiState.hint) */
  hasOwnKey: boolean
  status: Pick<AiStatusResult, 'app'> | null | undefined
}): string | undefined {
  const { mode, prefs, hasOwnKey, status } = opts
  if (mode !== 'firebase') return undefined
  if (!prefs) return 'Gemini reads bills, statements and hard-to-read SMS'
  if (!prefs.aiEnabled) return 'Off · bills are read on this phone'
  const uses = [prefs.aiImages && 'Bills & statements', prefs.aiSms && 'SMS', prefs.aiQuickAdd && 'Quick add', prefs.aiPayments && 'Payment screenshots']
    .filter(Boolean)
    .join(', ')
  if (!uses) return 'On · nothing selected'
  const shared =
    prefs.aiSource !== 'own' && (status?.app.images === 'available' || status?.app.sms === 'available') && (!isFreeAi(status) || prefs.aiFreeOk === true)
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
    case 'needs_ok':
      return `Free AI is off until you turn on “Use free AI” in Settings → AI features.${phone ? ' Reading on your phone instead.' : ''}`
    default:
      return `AI reading isn’t available right now.${phone ? ' Reading on your phone instead.' : ''}`
  }
}

/** Reasons that mean "nothing to fix": show nothing, or at most a quiet line. */
export const isQuietReason = (reason: AiUnavailableReason | undefined) =>
  reason === 'off' || reason === 'not_listed' || reason === 'not_configured' || reason === 'needs_ok'

/**
 * Where what AI reads goes, for the AI settings card. On Split Now's Gemini key it stays on
 * Google Cloud (Split Now's functions in Mumbai, then Google's paid Gemini API, which doesn't train
 * on it); on the free AI (Gemma) the "Use free AI" switch carries the warning (FREE_AI_NOTE).
 */
export function aiDataNote(status: Pick<AiStatusResult, 'app'> | null | undefined): string {
  const what = 'Bills, statements, payment screenshots, and bank SMS or Quick add lines the app can’t read'
  const tail = 'Nothing else leaves your phone, and nothing is sent while this is off.'
  const shared = status?.app.images === 'available' || status?.app.sms === 'available'
  if (shared && isFreeAi(status))
    return `${what} go to Google: to Gemma, Google’s free model, only if you turn on “Use free AI” below, else only to your own Gemini key. ${tail}`
  if (shared)
    return `${what} go to Google Gemini. On Split Now’s key they pass through our servers in Mumbai (Google Cloud, asia-south1) to Google’s paid Gemini API, which doesn’t train on them. Split Now keeps only what you save. ${tail}`
  return `${what} go to Google Gemini. ${tail}`
}

/**
 * Which AI the feature rows should name ("Photos go to Gemma…"): the one that reads first for this
 * person. The free Gemma only when they turned on "Use free AI" and their key choice allows it
 * (planAi puts it first on Automatic); their own key is Gemini; Split Now's paid key is Gemini.
 * "the AI" when none can serve them yet (the status line says why).
 */
export function aiReaderName(o: { free: boolean; freeOk: boolean; source: string; hasOwnKey: boolean; appAvailable: boolean }): 'Gemma' | 'Gemini' | 'the AI' {
  const gemma = o.free && o.freeOk && o.appAvailable && o.source !== 'own'
  const paidApp = !o.free && o.appAvailable && o.source !== 'own'
  const own = o.hasOwnKey && o.source !== 'app'
  if (o.source === 'auto' && gemma) return 'Gemma'
  if (own) return 'Gemini'
  if (gemma) return 'Gemma'
  if (paidApp) return 'Gemini'
  return 'the AI'
}

/**
 * Quick add with AI: which key reads the lines, and, only when it's Split Now's free AI (Gemma), a
 * note that it isn't the best reader and their own key gives the best results (owner, 24 Oct 2026:
 * the free key stays free, so the note points people with harder lines to their own).
 */
export function quickAddKeyLine(o: Parameters<typeof aiReaderName>[0]): { uses: string; note?: string } | null {
  const reader = aiReaderName(o)
  if (reader === 'the AI') return null
  const own = o.hasOwnKey && o.source !== 'app' && !(o.source === 'auto' && reader === 'Gemma')
  if (reader === 'Gemma')
    return {
      uses: 'Uses Split Now’s free AI (Gemma)',
      note: 'The free AI misreads some long or uneven lines. Add your own Gemini key below for the best results.',
    }
  return { uses: own ? 'Uses your own key (Gemini)' : 'Uses Split Now’s key (Gemini)' }
}

/** The "Use free AI" switch: what the free AI reads, and the price of free. */
export const FREE_AI_NOTE =
  'Reads bills, statements, payment screenshots, bank SMS and Quick add lines, slower than the paid AI. It’s free because Google may use what you send, including names, UPI IDs and amounts, to improve its products, and people at Google may read it. Not allowed for people in the EU, the UK or Switzerland.'
