/*
 * Which day's exchange rate a payment in another currency uses (owner, 24 Oct 2026). A group in $
 * whose people pay each other in ₹: the dollar may have moved since the trip, so the person who
 * paid back then (their card charged that day's rate) and the one paying now see different ₹ amounts.
 * Settle up and Remind offer two rates: today's, and the trip's, the rate on the day the trip
 * ended (its end date once it's over, else the day of its last expense). A Trip group starts on
 * the trip's rate, any other group on today's; the person can switch, and the payment records
 * which day's rate it used (Settlement.paid.rateDate). Pure.
 */

export type RateBasis = 'today' | 'trip'

/**
 * The day the trip rate is from: the group's end date once it has passed, else the latest expense
 * date before today. null when there is nothing to go by, or it would be today (the two rates are the same).
 */
export function tripRateDate(g: { endDate?: string }, expenseDates: ReadonlyArray<string | undefined>, today: string): string | null {
  if (g.endDate && g.endDate < today) return g.endDate
  let last: string | null = null
  for (const d of expenseDates) if (d && d < today && (!last || d > last)) last = d
  return last
}

/** Where the choice starts: the trip's rate for a Trip group that has one, today's for the rest. */
export function defaultRateBasis(g: { type?: string }, tripDate: string | null): RateBasis {
  return g.type === 'trip' && tripDate ? 'trip' : 'today'
}

/**
 * The line under the choice: how much more or less the other rate asks for, in the payment's
 * currency (minor units in, a sentence out; `format` turns minor units into money). null when
 * the two come to the same amount.
 */
export function rateGapLine(o: { basis: RateBasis; atToday: number; atTrip: number; format: (minor: number) => string }): string | null {
  const gap = o.atTrip - o.atToday
  if (!gap) return null
  const amount = o.format(Math.abs(gap))
  if (o.basis === 'trip') return gap > 0 ? `${amount} more than at today’s rate` : `${amount} less than at today’s rate`
  return gap > 0 ? `${amount} less than at the trip’s rate` : `${amount} more than at the trip’s rate`
}

/** ECB publishes no rates on weekends and holidays, so "today's" can be dated a few days back. */
const SAME_RATE_DAYS = 4

/**
 * The day an older rate was used ("paid ₹5,280 at the 6 Oct rate"), when a payment's rate is from
 * well before it was paid (the trip's): undefined for today's rate.
 */
export function olderRateDay(paid: { rateDate?: string } | undefined, paidOn: string): string | undefined {
  const r = paid?.rateDate
  if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r) || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return undefined
  const days = (Date.parse(`${paidOn}T00:00:00Z`) - Date.parse(`${r}T00:00:00Z`)) / 86_400_000
  return days > SAME_RATE_DAYS ? r : undefined
}

/** " at the 6 Oct rate" after "paid ₹5,280", or nothing for today's rate. */
export function rateDayNote(paid: { rateDate?: string } | undefined, paidOn: string, format: (iso: string) => string = (d) => d): string {
  const day = olderRateDay(paid, paidOn)
  return day ? ` at the ${format(day)} rate` : ''
}

/**
 * New group / Edit group (before its first expense): a group in another currency than the
 * person's own, which could still be theirs. Kept in theirs, each cost added in the other currency
 * keeps its own day's rate (the expense form locks it), so a later fall in the rate never changes
 * what anyone owes; the trip rate in Settle up is only needed for a group kept in the other one.
 */
export function suggestHomeCurrency(o: { groupCurrency: string; homeCurrency: string; type: string; locked: boolean }): boolean {
  return !o.locked && o.type !== 'personal' && !!o.homeCurrency && o.groupCurrency !== o.homeCurrency
}

/**
 * Settling with someone across groups (Balances, Collect in my currency): the day each group's
 * row converts at, by SettleRow key, for rows in another currency than `home` whose group starts on
 * its trip's rate (defaultRateBasis). 'today' asks for none: every row at today's rate.
 */
export function rowTripDates(
  rows: ReadonlyArray<{ key: string; groupId: string; currency: string }>,
  groups: Record<string, { type?: string; endDate?: string; expenseDates: ReadonlyArray<string | undefined> }>,
  home: string,
  today: string,
  basis: RateBasis = 'trip',
): Record<string, string> {
  const out: Record<string, string> = {}
  if (basis === 'today') return out
  for (const r of rows) {
    const g = groups[r.groupId]
    if (!g || r.currency === home) continue
    const day = tripRateDate(g, g.expenseDates, today)
    if (defaultRateBasis(g, day) === 'trip' && day) out[r.key] = day
  }
  return out
}
