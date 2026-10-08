import type { Cents, PaymentHandles } from '@/types'
import { centsToInput, minorDigits } from './money'

/*
 * How to pay someone: their handles turned into copyable values and deep links.
 *
 * UPI (India) is first-class. A UPI payment link follows NPCI's "UPI Linking Specification":
 *   upi://pay?pa=<VPA>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>
 * The same query works with app-specific schemes, which is how you pick an app on iOS:
 *   Google Pay  tez://upi/pay?…      PhonePe  phonepe://pay?…      Paytm  paytmmp://upi/pay?…
 * (schemes as documented by Razorpay / Juspay / Cashfree UPI-intent guides, checked Oct 2026).
 *
 * Platform behaviour:
 *  - Android: upi://pay opens the system chooser listing every installed UPI app.
 *  - iOS: there is no chooser; upi:// opens whichever app iOS registered for it (often the most
 *    recently installed), or nothing. The app-specific buttons are the reliable path there.
 *  - Any phone: the QR code (same upi:// string) can be scanned by any UPI app, which is the
 *    most dependable way for a friend to pay from their own phone.
 * Some apps cap or warn on app-initiated person-to-person payments to unverified VPAs; scanning
 * the QR or paying to the UPI ID by hand still works.
 */

export interface UpiApp {
  id: 'gpay' | 'phonepe' | 'paytm'
  label: string
  base: string
}

export const UPI_APPS: UpiApp[] = [
  { id: 'gpay', label: 'Google Pay', base: 'tez://upi/pay' },
  { id: 'phonepe', label: 'PhonePe', base: 'phonepe://pay' },
  { id: 'paytm', label: 'Paytm', base: 'paytmmp://upi/pay' },
]

export interface PayOption {
  key: keyof PaymentHandles | 'bank'
  label: string
  value: string
  /** deep link that opens a wallet app, if one exists */
  href?: string
  /** UPI only: app-specific links (Google Pay, PhonePe, Paytm) */
  apps?: Array<{ id: UpiApp['id']; label: string; href: string }>
  /** UPI only: the string to show as a QR code (same as href) */
  qr?: string
}

/** name@bank, as UPI VPAs look (e.g. rohan.s@okaxis, 9876543210@ybl). */
export function isUpiId(s: string | undefined): boolean {
  return !!s && /^[A-Za-z0-9._-]{2,100}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(s.trim())
}

/** IFSC: 4 letters, a zero, 6 letters/digits (e.g. HDFC0001234). */
export function isIfsc(s: string | undefined): boolean {
  return !!s && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.trim().toUpperCase())
}

/** UPI apps choke on emoji and odd punctuation in pn/tn; keep it plain and short. */
const plain = (s: string, max: number) =>
  s
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 .,'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
/** Percent-encode, but keep "@" readable: several UPI apps fail to decode %40 in pa. */
const enc = (s: string) => encodeURIComponent(s).replace(/%40/g, '@')

export interface UpiParams {
  /** payee VPA */
  pa: string
  /** payee name */
  pn?: string
  /** minor units (paise); omitted or 0 lets the payer type the amount */
  amount?: Cents
  /** note shown to both sides */
  note?: string
}

/** The query part ("pa=…&pn=…&am=…&cu=INR&tn=…"), in the order apps expect. */
export function upiQuery({ pa, pn, amount, note }: UpiParams): string {
  const parts: Array<[string, string]> = [['pa', pa.trim()]]
  const name = pn ? plain(pn, 30) : ''
  if (name) parts.push(['pn', name])
  if (amount && amount > 0) parts.push(['am', centsToInput(amount, 'INR')])
  parts.push(['cu', 'INR'])
  const tn = note ? plain(note, 30) : ''
  if (tn) parts.push(['tn', tn])
  return parts.map(([k, v]) => `${k}=${enc(v)}`).join('&')
}

/** upi://pay?… — opens the chooser on Android, and is what goes into the QR code. */
export function upiLink(p: UpiParams): string {
  return `upi://pay?${upiQuery(p)}`
}

/** Same payment, opened in a specific app. */
export function upiAppLinks(p: UpiParams): Array<{ id: UpiApp['id']; label: string; href: string }> {
  const q = upiQuery(p)
  return UPI_APPS.map((a) => ({ id: a.id, label: a.label, href: `${a.base}?${q}` }))
}

/**
 * Payment options for a payee, best first for the currency: UPI → UPI number → bank (IFSC)
 * for INR, PayID → BSB for AUD, PayPal / Revolut otherwise. Amount-carrying UPI links and the
 * QR are only produced for INR (UPI settles in rupees only).
 */
export function payOptions(h: PaymentHandles | undefined, amount: Cents, currency: string, note: string, payeeName?: string): PayOption[] {
  if (!h) return []
  const amt = centsToInput(amount, currency)
  const by: Partial<Record<PayOption['key'], PayOption>> = {}

  if (h.upi?.trim()) {
    const pa = h.upi.trim()
    if (currency === 'INR' && isUpiId(pa)) {
      const p: UpiParams = { pa, pn: payeeName, amount, note }
      const link = upiLink(p)
      by.upi = { key: 'upi', label: 'UPI', value: pa, href: link, qr: link, apps: upiAppLinks(p) }
    } else {
      by.upi = { key: 'upi', label: 'UPI', value: pa }
    }
  }
  if (h.phone?.trim()) by.phone = { key: 'phone', label: 'UPI number / phone', value: h.phone.trim() }
  if (h.payid) by.payid = { key: 'payid', label: 'PayID', value: h.payid }
  if (h.account && h.ifsc) {
    by.bank = { key: 'bank', label: 'Bank (A/c / IFSC)', value: `${h.account} / ${h.ifsc.toUpperCase()}` }
  } else if (h.account && h.bsb) {
    by.bank = { key: 'bank', label: 'Bank (BSB / Acc)', value: `${h.bsb} / ${h.account}` }
  }
  if (h.paypal) {
    const user = h.paypal.replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/^@/, '')
    by.paypal = { key: 'paypal', label: 'PayPal', value: `paypal.me/${user}`, href: `https://paypal.me/${encodeURIComponent(user)}/${amt}${currency}` }
  }
  if (h.revolut) {
    const tag = h.revolut.replace(/^@/, '')
    by.revolut = { key: 'revolut', label: 'Revolut', value: `@${tag}`, href: `https://revolut.me/${encodeURIComponent(tag)}` }
  }

  const order: Array<PayOption['key']> =
    currency === 'INR'
      ? ['upi', 'phone', 'bank', 'paypal', 'revolut', 'payid']
      : currency === 'AUD'
        ? ['payid', 'bank', 'paypal', 'revolut', 'upi', 'phone']
        : ['paypal', 'revolut', 'bank', 'payid', 'upi', 'phone']
  return order.map((k) => by[k]).filter((o): o is PayOption => !!o)
}

/** Method chips on the settle-up screen, most likely first. */
export function settleMethods(currency: string): string[] {
  if (currency === 'INR') return ['UPI', 'Cash', 'Bank transfer', 'Other']
  if (currency === 'AUD') return ['PayID', 'Bank transfer', 'Cash', 'PayPal', 'Other']
  return ['Bank transfer', 'Cash', 'PayPal', 'Revolut', 'UPI', 'Other']
}

/**
 * How a settlement's method reads in lists. 'waived' is written by Settle up's "Waive the rest"
 * (the person owed let the remainder go); any other method is shown as stored.
 */
export function methodLabel(method: string): string {
  return method === 'waived' ? 'Waived' : method
}

/**
 * Round figures near a debt for a part payment, nearest below and above (₹1,247 → ₹1,200 and
 * ₹1,250; ₹83 → ₹80 and ₹90). The step grows with the amount; a debt already on a round figure
 * gets nothing.
 */
export function roundSuggestions(owed: Cents, currency: string): Cents[] {
  if (!Number.isFinite(owed) || owed <= 0) return []
  const unit = 10 ** minorDigits(currency)
  const major = owed / unit
  const step = (major < 50 ? 5 : major < 200 ? 10 : major < 2000 ? 50 : major < 20000 ? 500 : 1000) * unit
  const down = Math.floor(owed / step) * step
  const up = Math.ceil(owed / step) * step
  return [...new Set([down, up])].filter((v) => v > 0 && v !== owed)
}

/** The settlement method a pay option implies. */
export function methodFor(o: PayOption): string {
  if (o.key === 'bank') return 'Bank transfer'
  if (o.key === 'phone' || o.key === 'upi') return 'UPI'
  return o.label
}

/** Rough platform check for the UPI hint text (iOS has no app chooser for upi://). */
export function isIOS(
  ua = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}
