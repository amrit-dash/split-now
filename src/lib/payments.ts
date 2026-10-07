import type { Cents, PaymentHandles } from '@/types'

export interface PayOption {
  key: keyof PaymentHandles | 'bank'
  label: string
  value: string
  /** deep link that opens a wallet app, if one exists */
  href?: string
}

export function payOptions(h: PaymentHandles | undefined, amount: Cents, currency: string, note: string): PayOption[] {
  if (!h) return []
  const amt = (amount / 100).toFixed(2)
  const out: PayOption[] = []
  if (h.payid) out.push({ key: 'payid', label: 'PayID', value: h.payid })
  if (h.bsb && h.account) out.push({ key: 'bank', label: 'Bank (BSB / Acc)', value: `${h.bsb} / ${h.account}` })
  if (h.paypal) {
    const user = h.paypal.replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/^@/, '')
    out.push({ key: 'paypal', label: 'PayPal', value: `paypal.me/${user}`, href: `https://paypal.me/${encodeURIComponent(user)}/${amt}${currency}` })
  }
  if (h.upi) {
    const q = new URLSearchParams({ pa: h.upi, am: amt, cu: currency === 'INR' ? 'INR' : currency, tn: note.slice(0, 50) })
    out.push({ key: 'upi', label: 'UPI', value: h.upi, href: `upi://pay?${q}` })
  }
  if (h.revolut) {
    const tag = h.revolut.replace(/^@/, '')
    out.push({ key: 'revolut', label: 'Revolut', value: `@${tag}`, href: `https://revolut.me/${encodeURIComponent(tag)}` })
  }
  return out
}
