import { useEffect, useMemo, useState } from 'react'
import { getRate, type FxRate } from '@/lib/fx'
import { todayISO } from '@/lib/id'
import { type RateBasis, rowTripDates } from '@/lib/trip-rate'

/**
 * Today's ECB rate `from` → `to`, and the trip's (src/lib/trip-rate.ts tripRateDate), for paying a
 * debt in another currency. Each is undefined while loading and null when unavailable (offline,
 * or no trip date); nothing is fetched when the two currencies match or one is missing.
 */
export function useTripRates(
  from: string | undefined,
  to: string | undefined,
  tripDate: string | null,
): { today: FxRate | null | undefined; trip: FxRate | null | undefined } {
  const key = from && to && from !== to ? `${from}|${to}|${tripDate ?? ''}` : ''
  const [state, setState] = useState<{ key: string; today: FxRate | null; trip: FxRate | null }>()
  useEffect(() => {
    if (!key || !from || !to) return
    let live = true
    Promise.all([getRate(from, to, todayISO()), tripDate ? getRate(from, to, tripDate) : Promise.resolve(null)]).then(([today, trip]) => {
      if (live) setState({ key, today, trip })
    })
    return () => {
      live = false
    }
  }, [key, from, to, tripDate])
  if (!key) return { today: null, trip: null }
  return state?.key === key ? { today: state.today, trip: state.trip } : { today: undefined, trip: undefined }
}

/**
 * Each group's own rate into `home` for the rows that use one (src/lib/trip-rate.ts rowTripDates):
 * by SettleRow key, home units per 1 unit of the row's currency, with the day it is from.
 * undefined while loading; rows without one (today's rate) are left out, and so is a day with no
 * rate (offline).
 */
export function useRowTripRates(
  rows: ReadonlyArray<{ key: string; groupId: string; currency: string }> | null,
  data: ReadonlyArray<{ group: { id: string; type?: string; endDate?: string }; expenses: ReadonlyArray<{ date?: string }> }> | null,
  home: string,
  basis: RateBasis = 'trip',
): { rates: Record<string, number>; days: Record<string, string> } | undefined {
  const days = useMemo(() => {
    if (!rows || !data) return {}
    const groups = Object.fromEntries(
      data.map((d) => [d.group.id, { type: d.group.type, endDate: d.group.endDate, expenseDates: d.expenses.map((e) => e.date) }]),
    )
    return rowTripDates(rows, groups, home, todayISO(), basis)
  }, [rows, data, home, basis])
  // What to fetch, as text: the live data refreshing with nothing new must not fetch again.
  const wanted = useMemo(() => {
    const cur = new Map((rows ?? []).map((r) => [r.key, r.currency]))
    return JSON.stringify(Object.entries(days).map(([k, day]) => [k, cur.get(k) ?? '', day]))
  }, [rows, days])
  const [state, setState] = useState<{ key: string; rates: Record<string, number> }>()
  useEffect(() => {
    const list = JSON.parse(wanted) as Array<[string, string, string]>
    if (!list.length) return
    let live = true
    Promise.all(list.map(async ([k, cur, day]) => [k, await getRate(cur, home, day)] as const)).then((pairs) => {
      if (live)
        setState({ key: `${home}|${wanted}`, rates: Object.fromEntries(pairs.filter(([, r]) => r && r.rate > 0).map(([k, r]) => [k, (r as FxRate).rate])) })
    })
    return () => {
      live = false
    }
  }, [wanted, home])
  if (wanted === '[]') return EMPTY
  return state?.key === `${home}|${wanted}` ? { rates: state.rates, days } : undefined
}
const EMPTY = { rates: {}, days: {} }
