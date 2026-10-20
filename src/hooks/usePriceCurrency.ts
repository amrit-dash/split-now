import { useEffect, useState } from 'react'
import { useMe } from '@/hooks/auth'
import { useTodayRates } from '@/hooks/useFx'
import { setPriceCurrency } from '../../shared/icon-ai'

/**
 * AI picture prices are Google's, in US dollars: this sets today's dollar rate for the person's
 * currency so every price line shows their money first (shared/icon-ai.ts priceText). Mounted
 * once, in AppRoutes (src/App.tsx); it re-renders the screen when the rate arrives.
 */
export function usePriceCurrency() {
  const { profile } = useMe()
  const home = profile.currency
  const rates = useTodayRates(home, ['USD'])
  const perUsd = home === 'USD' ? 1 : (rates?.USD?.rate ?? 0)
  const [, bump] = useState(0)
  useEffect(() => {
    setPriceCurrency(perUsd ? { currency: home, perUsd } : null)
    bump((n) => n + 1)
  }, [home, perUsd])
}
