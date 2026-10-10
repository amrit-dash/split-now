import { useSyncExternalStore } from 'react'
import { getMotion, subscribeMotion, type MotionPrefs } from '@/lib/motion'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(fn: () => void): () => void {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(QUERY) : undefined
  mq?.addEventListener?.('change', fn)
  return () => mq?.removeEventListener?.('change', fn)
}
const getReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches

/** The animation settings (src/lib/motion.ts) and the device's reduce-motion setting, both live. */
export function useMotion(): { prefs: MotionPrefs; reduced: boolean } {
  const prefs = useSyncExternalStore(subscribeMotion, getMotion, getMotion)
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, () => false)
  return { prefs, reduced }
}
