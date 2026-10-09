import { useEffect, useState } from 'react'
import { getRate, type FxRate } from '@/lib/fx'
import { todayISO } from '@/lib/id'

/**
 * Today's ECB rate from each of `currencies` into `home`, for approximate "≈" totals.
 * `undefined` while loading; a currency maps to null when no rate is available (offline).
 */
export function useTodayRates(home: string, currencies: string[]): Record<string, FxRate | null> | undefined {
  const key = [...new Set(currencies.filter((c) => c !== home))].sort().join(',')
  const [state, setState] = useState<{ key: string; rates: Record<string, FxRate | null> }>()
  useEffect(() => {
    let live = true
    const list = key ? key.split(',') : []
    const date = todayISO()
    Promise.all(list.map(async (c) => [c, await getRate(c, home, date)] as const)).then((pairs) => {
      if (live) setState({ key: `${home}|${key}`, rates: Object.fromEntries(pairs) })
    })
    return () => {
      live = false
    }
  }, [home, key])
  if (!key) return {}
  return state?.key === `${home}|${key}` ? state.rates : undefined
}
