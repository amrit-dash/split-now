import { minorDigitsOf } from '../../../shared/money-core'
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

// ISO 4217 digits, the same table the app stores amounts with (shared/money-core.ts).
const digits = (currency: string): number => minorDigitsOf(currency)

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
  groupId: string
  expenseId: string
  groupName: string
  emoji?: string
  actorName: string
  description: string
  amount: number
  currency: string
  share: number
  paid: number
  needsApproval?: boolean
}): Note {
  const parts = [`${clip(e.actorName, 30)} added ${clip(e.description || 'an expense', 40)}`, formatMoney(e.amount, e.currency)]
  if (e.share > 0) parts.push(`your share ${formatMoney(e.share, e.currency)}`)
  else if (e.paid > 0) parts.push(`you paid ${formatMoney(e.paid, e.currency)}`)
  const body = parts.join(' · ') + (e.needsApproval ? ' · needs your approval' : '')
  return { title: groupTitle(e.groupName, e.emoji), body, url: `/groups/${e.groupId}/expenses/${e.expenseId}`, tag: `expense-${e.expenseId}` }
}

/** To the person who was paid. */
export function settlementNote(s: {
  groupId: string
  settlementId: string
  groupName: string
  emoji?: string
  fromName: string
  amount: number
  currency: string
}): Note {
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: `${clip(s.fromName, 30)} paid you ${formatMoney(s.amount, s.currency)}`,
    url: `/groups/${s.groupId}`,
    tag: `settlement-${s.settlementId}`,
  }
}

/** To the person recorded as the payer, when someone else recorded it ("Rahul paid me ₹500"). */
export function settlementRecordedNote(s: {
  groupId: string
  settlementId: string
  groupName: string
  emoji?: string
  toName: string
  amount: number
  currency: string
}): Note {
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: `${clip(s.toName, 30)} recorded that you paid ${formatMoney(s.amount, s.currency)}. Not right? Open it to flag.`,
    url: `/groups/${s.groupId}`,
    tag: `settlement-${s.settlementId}`,
  }
}

/**
 * To the payee of a payment that needs their OK (Payments need the recipient's OK): cleared by its
 * screenshot, which they can still flag, or waiting for them. Opens the Inbox, where both are.
 */
export function paymentOkNote(s: {
  settlementId: string
  groupName: string
  emoji?: string
  fromName: string
  amount: number
  currency: string
  cleared: boolean
}): Note {
  const who = clip(s.fromName, 30)
  const money = formatMoney(s.amount, s.currency)
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: s.cleared
      ? `${who} paid you ${money}, cleared by their screenshot. Not right? Flag it in the Inbox.`
      : `${who} says they paid you ${money} · needs your OK`,
    url: '/inbox',
    tag: `settlement-${s.settlementId}`,
  }
}

/** To the payer when the payee confirms their payment, or says it hasn't arrived. */
export function paymentDecisionNote(s: {
  groupId: string
  settlementId: string
  groupName: string
  emoji?: string
  toName: string
  amount: number
  currency: string
  decision: 'ok' | 'flag'
}): Note {
  const who = clip(s.toName, 30)
  const money = formatMoney(s.amount, s.currency)
  return {
    title: groupTitle(s.groupName, s.emoji),
    body: s.decision === 'ok' ? `${who} confirmed your ${money}` : `${who} says your ${money} hasn’t arrived. It doesn’t count until they confirm it.`,
    url: `/groups/${s.groupId}`,
    tag: `settlement-${s.settlementId}`,
  }
}

/** A manual nudge from the person owed: opens the debtor's Settle up screen with them and the amount filled in. */
export function nudgeNote(n: {
  groupId: string
  groupName: string
  emoji?: string
  fromName: string
  owed: number
  currency: string
  debtorMemberId: string
  senderMemberId: string
}): Note {
  const q = new URLSearchParams({ from: n.debtorMemberId, to: n.senderMemberId, amount: String(n.owed) })
  return {
    title: groupTitle(n.groupName, n.emoji),
    body: `${clip(n.fromName, 30)} reminded you: you owe ${formatMoney(n.owed, n.currency)} in ${clip(n.groupName, 40)}. Pay in one tap.`,
    url: `/groups/${n.groupId}/settle?${q}`,
    tag: `nudge-${n.groupId}-${n.senderMemberId}`,
  }
}

/** "Goa trip", "Goa trip and Flat", "Goa trip, Flat and Office"; past `max` names, "… and 2 more groups". */
export function groupList(names: string[], max = 3): string {
  const shown = names.slice(0, max).map((n) => clip(n, 40))
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} and ${rest} more group${rest === 1 ? '' : 's'}`
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/**
 * One nudge about everything the debtor owes the sender across several groups (the Balances
 * screen's "by person" row): one push with the total, opening the debtor's cross-group Settle up.
 */
export function nudgeAcrossNote(n: { fromName: string; total: number; currency: string; groupNames: string[]; url: string; senderUid: string }): Note {
  return {
    title: 'Settle up',
    body: `${clip(n.fromName, 30)} reminded you: you owe ${formatMoney(n.total, n.currency)} across ${groupList(n.groupNames)}. Pay in one tap.`,
    url: n.url,
    tag: `nudge-p-${n.senderUid}`,
  }
}

/** The group crossed 80% or 100% of its budget (shared/budget.ts thresholds). To every member with expense pushes on. */
export function budgetNote(b: {
  groupId: string
  groupName: string
  emoji?: string
  threshold: number
  spent: number
  budget: number
  currency: string
}): Note {
  const name = clip(b.groupName, 40)
  const body =
    b.threshold >= 100
      ? `${name} is over its ${formatMoney(b.budget, b.currency)} budget: ${formatMoney(b.spent, b.currency)} spent so far.`
      : `${name} has used ${Math.round((b.spent / b.budget) * 100)}% of its ${formatMoney(b.budget, b.currency)} budget (${formatMoney(b.spent, b.currency)}).`
  return { title: groupTitle(b.groupName, b.emoji), body, url: `/insights?group=${b.groupId}`, tag: `budget-${b.groupId}-${b.threshold}`, urgency: 'normal' }
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

/**
 * To the payee, when someone tapped "I've paid" on their Pay me link. `recorded`: the payment is
 * in the group now (the payee deletes it there if it isn't right); otherwise (a live table closed
 * without a group) this is the only record.
 */
export function payLinkPaidNote(p: {
  code: string
  groupName: string
  emoji?: string
  payerName: string
  amount: number
  currency: string
  recorded: boolean
  withProof?: boolean
}): Note {
  const head = `${clip(p.payerName, 30)} marked ${formatMoney(p.amount, p.currency)} paid · ${clip(p.groupName, 40)}`
  const proof = p.withProof ? ' Screenshot attached.' : ''
  const tail = p.recorded ? ' It’s recorded as a payment; not right? Delete it in the group.' : ''
  return { title: groupTitle(p.groupName, p.emoji), body: `${head}.${proof}${tail}`, url: `/r/${p.code}`, tag: `paylink-${p.code}` }
}

/** To a live table's host, when a guest says they paid on a link the host confirms (open → claimed). */
export function payLinkClaimedNote(p: {
  code: string
  groupName: string
  emoji?: string
  payerName: string
  amount: number
  currency: string
  withProof?: boolean
}): Note {
  const proof = p.withProof ? ' Screenshot attached.' : ''
  return {
    title: groupTitle(p.groupName, p.emoji),
    body: `${clip(p.payerName, 30)} says they’ve paid ${formatMoney(p.amount, p.currency)} · confirm.${proof} It counts once you confirm it.`,
    url: `/r/${p.code}`,
    tag: `paylink-${p.code}`,
  }
}

/** To the other members when someone deletes a group: it's in Recently deleted, and any of them can restore it. */
export function groupDeletedNote(g: { groupId: string; groupName: string; emoji?: string; byName: string; days: number }): Note {
  return {
    title: groupTitle(g.groupName, g.emoji),
    body: `${clip(g.byName, 30)} deleted this group. You can restore it within ${g.days} days.`,
    url: `/groups/${g.groupId}`,
    tag: `group-deleted-${g.groupId}`,
  }
}
