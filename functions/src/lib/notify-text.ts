/** Notification copy. Amounts use Indian grouping (₹1,00,000) via Intl en-IN; whole amounts drop the paise. */

export interface Note {
  title: string
  body: string
  /** app path the notification opens */
  url: string
  /** same tag replaces an earlier notification instead of stacking */
  tag?: string
  /** reminders can wait for the next radio wake-up; everything else is 'high' */
  urgency?: 'high' | 'normal'
}

const fmtCache = new Map<string, Intl.NumberFormat>()

function digits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(minor: number, currency = 'INR'): string {
  const d = digits(currency)
  const value = minor / 10 ** d
  const whole = Number.isInteger(value)
  const key = `${currency}|${whole}`
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : d, maximumFractionDigits: d })
    } catch {
      f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
    }
    fmtCache.set(key, f)
  }
  return f.format(value)
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const groupTitle = (name: string, emoji?: string) => clip(emoji ? `${emoji} ${name}` : name, 60)

export function captureNote(c: { captureId: string; amount: number; currency?: string; merchant?: string; groupName?: string }): Note {
  const spent = `You spent ${formatMoney(c.amount, c.currency)}${c.merchant ? ` at ${clip(c.merchant, 40)}` : ''}`
  return c.groupName
    ? { title: 'New payment', body: `${spent} — add to ${clip(c.groupName, 40)}?`, url: `/capture/${c.captureId}`, tag: `capture-${c.captureId}` }
    : { title: 'Unsorted payment', body: `${spent}. Is it a shared expense?`, url: `/capture/${c.captureId}`, tag: `capture-${c.captureId}` }
}

export function expenseNote(e: {
  groupId: string; expenseId: string; groupName: string; emoji?: string; actorName: string; description: string
  amount: number; currency: string; share: number; paid: number; needsApproval?: boolean
}): Note {
  const parts = [`${clip(e.actorName, 30)} added ${clip(e.description || 'an expense', 40)}`, formatMoney(e.amount, e.currency)]
  if (e.share > 0) parts.push(`your share ${formatMoney(e.share, e.currency)}`)
  else if (e.paid > 0) parts.push(`you paid ${formatMoney(e.paid, e.currency)}`)
  const body = parts.join(' · ') + (e.needsApproval ? ' · needs your approval' : '')
  return { title: groupTitle(e.groupName, e.emoji), body, url: `/groups/${e.groupId}/expenses/${e.expenseId}`, tag: `expense-${e.expenseId}` }
}

/** To the person who was paid. */
export function settlementNote(s: { groupId: string; settlementId: string; groupName: string; emoji?: string; fromName: string; amount: number; currency: string }): Note {
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: `${clip(s.fromName, 30)} paid you ${formatMoney(s.amount, s.currency)}`,
    url: `/groups/${s.groupId}`,
    tag: `settlement-${s.settlementId}`,
  }
}

/** To the person recorded as the payer, when someone else recorded it ("Rahul paid me ₹500"). */
export function settlementRecordedNote(s: { groupId: string; settlementId: string; groupName: string; emoji?: string; toName: string; amount: number; currency: string }): Note {
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: `${clip(s.toName, 30)} recorded that you paid ${formatMoney(s.amount, s.currency)}. Not right? Open it to flag.`,
    url: `/groups/${s.groupId}`,
    tag: `settlement-${s.settlementId}`,
  }
}

export function reminderNote(r: { groupId: string; groupName: string; emoji?: string; owed: number; currency: string }): Note {
  return {
    title: groupTitle(r.groupName, r.emoji),
    body: `Friendly nudge: you owe ${formatMoney(r.owed, r.currency)} in ${clip(r.groupName, 40)}. Settle up when you can.`,
    url: `/groups/${r.groupId}/settle`,
    tag: `reminder-${r.groupId}`,
    urgency: 'normal',
  }
}
