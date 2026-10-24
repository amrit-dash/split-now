import { useEffect, useState } from 'react'
import { getRate, type FxRate } from '@/lib/fx'
import { todayISO } from '@/lib/id'

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
