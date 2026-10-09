import { useEffect, useRef, useState } from 'react'
import { getRate, parseRate, type FxRate } from '@/lib/fx'

/**
 * The exchange rate for a foreign-currency entry. Fetched when the currency pair or the date
 * changes; a rate the user typed survives a date change, and an edited expense keeps its locked
 * rate until the currency or date changes. `rateEdit` is the manual-rate field's text, null
 * while it is closed ('' opens it empty, which is what happens when no rate can be found).
 */
export function useFxRate({ cur, to, date, fx, onFx }: { cur: string; to: string; date: string; fx: FxRate | null; onFx: (fx: FxRate | null) => void }) {
  const foreign = cur !== to
  const [loading, setLoading] = useState(false)
  const [rateEdit, setRateEdit] = useState<string | null>(null)
  const fxFor = useRef(fx ? `${cur}|${to}|${date}` : '')
  const latest = useRef({ fx, onFx })
  useEffect(() => {
    latest.current = { fx, onFx }
  }, [fx, onFx])
  useEffect(() => {
    if (!foreign) return
    const k = `${cur}|${to}|${date}`
    if (fxFor.current === k) return
    const keepManual = latest.current.fx?.source === 'manual' && fxFor.current.startsWith(`${cur}|${to}|`)
    fxFor.current = k
    if (keepManual) return
    latest.current.onFx(null)
    setRateEdit(null)
    setLoading(true)
    getRate(cur, to, date).then((r) => {
      // A later change already asked for another rate; this answer is stale.
      if (fxFor.current !== k) return
      latest.current.onFx(r)
      setLoading(false)
      if (!r) setRateEdit('')
    })
  }, [cur, to, date, foreign])
  /** Use the typed rate; false (and nothing changes) when it isn't a number above 0. */
  const applyRate = () => {
    const r = parseRate(rateEdit ?? '')
    if (!Number.isFinite(r) || r <= 0) return false
    onFx({ rate: r, date, source: 'manual' })
    setRateEdit(null)
    return true
  }
  return { foreign, loading, rateEdit, setRateEdit, applyRate }
}
