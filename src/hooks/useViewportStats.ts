import { useEffect } from 'react'
import { missingHeight, opensKeyboard, tallestHeights } from '@/lib/keyboard'
import { isStandalone } from '@/lib/push'

/** What the screen measurements (ViewportReadout) show of the installed app's height. */
export const viewportStats = { missing: 0, tallest: 0 }

/**
 * Keeps viewportStats current in the installed app (src/lib/keyboard.ts): how far short of the
 * screen iOS has the app, and the tallest it has been. Only measures, for the screen measurements.
 */
export function useViewportStats() {
  useEffect(() => {
    if (!isStandalone()) return
    let seen: Record<number, number> = {}
    const measure = () => {
      seen = tallestHeights(seen, window.innerWidth, window.innerHeight)
      viewportStats.tallest = seen[Math.round(window.innerWidth)] ?? 0
      const typing = opensKeyboard(document.activeElement as HTMLElement | null)
      viewportStats.missing = missingHeight({ width: window.innerWidth, height: window.innerHeight }, window.screen, typing)
    }
    measure()
    const vv = window.visualViewport
    vv?.addEventListener('resize', measure)
    window.addEventListener('resize', measure)
    document.addEventListener('focusout', measure)
    return () => {
      vv?.removeEventListener('resize', measure)
      window.removeEventListener('resize', measure)
      document.removeEventListener('focusout', measure)
    }
  }, [])
}
