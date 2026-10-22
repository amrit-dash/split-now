/*
 * Which "How friends can pay you" sections Profile shows (src/pages/Profile.tsx). Pure.
 *
 * Advanced: the region's sections, plus handles from other regions once filled in or asked for
 * ("Show all payment options"); the Minimal look keeps the region's main way to pay and any
 * section already filled in. Simple (owner, 22 Oct 2026): UPI ID, bank transfer and PayPal for
 * international, nothing more and no "show all"; anything else already saved keeps its value.
 */

export interface PaySection<K extends string> {
  title: string
  keys: K[]
}

/** The only handles Simple offers. PayID is Australia's UPI, so it stays with the bank details there. */
export const SIMPLE_PAY_KEYS = ['upi', 'account', 'ifsc', 'payid', 'bsb', 'paypal'] as const

export function shownPaySections<K extends string>(
  region: PaySection<K>[],
  o: { simple: boolean; showAll: boolean; allHandles: boolean; allKeys: K[]; filled: (k: K) => boolean },
): PaySection<K>[] {
  if (o.simple) {
    const keep = (k: K) => (SIMPLE_PAY_KEYS as readonly string[]).includes(k)
    return region.map((s) => ({ ...s, keys: s.keys.filter(keep) })).filter((s) => s.keys.length)
  }
  const listed = new Set(region.flatMap((s) => s.keys))
  const extra = o.allKeys.filter((k) => !listed.has(k) && (o.allHandles || o.filled(k)))
  const all = extra.length ? [...region, { title: 'Other', keys: extra }] : region
  return o.showAll ? all : all.filter((s, i) => i === 0 || s.keys.some(o.filled))
}
