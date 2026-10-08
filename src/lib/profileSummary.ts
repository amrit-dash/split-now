/** One-line summaries shown on collapsed Profile sections. Pure, so they are unit-tested. */
import type { PaymentHandles } from '@/types'
import type { NotificationPrefs } from '@/lib/push'

const mask = (v: string) => {
  const digits = v.replace(/\s+/g, '')
  return digits.length > 4 ? `••••${digits.slice(-4)}` : digits
}

/** Methods in the order a payer would most likely use them, per region. */
const ORDER: Record<'IN' | 'AU' | 'INTL', Array<keyof PaymentHandles>> = {
  IN: ['upi', 'phone', 'account', 'payid', 'paypal', 'revolut'],
  AU: ['payid', 'account', 'upi', 'phone', 'paypal', 'revolut'],
  INTL: ['paypal', 'revolut', 'upi', 'payid', 'account', 'phone'],
}

function describe(k: keyof PaymentHandles, p: PaymentHandles): string {
  const v = (p[k] ?? '').trim()
  switch (k) {
    case 'upi':
      return `UPI · ${v}`
    case 'phone':
      return `UPI phone · ${v}`
    case 'account':
      return p.bsb?.trim() ? `Bank · ${p.bsb.trim()} ${mask(v)}` : `Bank · ${mask(v)}`
    case 'payid':
      return `PayID · ${v}`
    case 'paypal':
      return `PayPal · ${v}`
    case 'revolut':
      return `Revolut · ${v}`
    default:
      return v
  }
}

/** "UPI · amrit@okaxis", "UPI · amrit@okaxis +2 more", or "Not set". */
export function paymentSummary(p: PaymentHandles | undefined, region: 'IN' | 'AU' | 'INTL' = 'IN'): string {
  if (!p) return 'Not set'
  const filled = ORDER[region].filter((k) => (p[k] ?? '').trim())
  if (!filled.length) return 'Not set'
  const first = describe(filled[0], p)
  return filled.length > 1 ? `${first} +${filled.length - 1} more` : first
}

export interface NotificationState {
  iosNeedsInstall: boolean
  supported: boolean
  perm: NotificationPermission | 'unsupported'
  prefs: NotificationPrefs
}

/** "On · 4 types", "Off", "Blocked in browser settings", … */
export function notificationSummary(s: NotificationState): string {
  if (s.iosNeedsInstall) return 'Install the app to turn on'
  if (!s.supported) return 'Not available in this browser'
  if (s.perm === 'denied') return 'Blocked in browser settings'
  if (s.perm !== 'granted') return 'Off'
  const { outsideTrips: _capture, ...types } = s.prefs // a capture setting, not a notification type
  const n = Object.values(types).filter(Boolean).length
  return n === 0 ? 'On · all types muted' : `On · ${n} type${n === 1 ? '' : 's'}`
}

/** From the user's capture keys (trip-scoped ones come from the SMS wizard). */
export function autoCaptureSummary(tokens: Array<{ groupId?: string }> | null): string {
  if (tokens === null) return ''
  if (!tokens.length) return 'Not set up'
  const sms = tokens.filter((t) => t.groupId).length
  const other = tokens.length - sms
  const parts = [sms && `SMS for ${sms} trip${sms === 1 ? '' : 's'}`, other && `${other} capture key${other === 1 ? '' : 's'}`].filter(Boolean)
  return `On · ${parts.join(' · ')}`
}

/** "Friends · Install app" style list of the links inside a section. */
export function linksSummary(labels: string[]): string {
  return labels.filter(Boolean).join(' · ')
}
