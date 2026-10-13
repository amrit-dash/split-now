import { useEffect } from 'react'
import { missingHeight, needsHeal, opensKeyboard, tallestHeights } from '@/lib/keyboard'
import { isStandalone } from '@/lib/push'

/** What the screen measurements (ViewportReadout) show of this hook's work. */
export const viewportStats = { heals: 0, missing: 0, tallest: 0 }

/**
 * The installed iPhone app after the keyboard (src/lib/keyboard.ts): iOS can give the app about
 * 43pt less screen than it fills, and draws nothing in the strip it took (moving things down into
 * it only cut them off, 6.2.5). Screens that scroll the page got it back by themselves while the
 * chat, whose page never scrolls, kept the band, so once the keyboard has gone and the app is
 * still short of the screen, the page is scrolled a pixel and back to have iOS measure again.
 * Only the installed app: in a browser tab the height changes as the toolbars come and go.
 */
export function useViewportHeal() {
  useEffect(() => {
    if (!isStandalone()) return
    let seen: Record<number, number> = {}
    let last = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const typing = () => opensKeyboard(document.activeElement as HTMLElement | null)
    const measure = () => {
      seen = tallestHeights(seen, window.innerWidth, window.innerHeight)
      viewportStats.tallest = seen[Math.round(window.innerWidth)] ?? 0
      viewportStats.missing = missingHeight({ width: window.innerWidth, height: window.innerHeight }, window.screen, typing())
    }
    const check = () => {
      measure()
      const height = window.innerHeight
      // Short of the screen it fills (or of its own tallest), with nothing being typed.
      const full = Math.max(height + viewportStats.missing, seen[Math.round(window.innerWidth)] ?? 0)
      if (!needsHeal(height, full, typing())) return
      // At most every two seconds: the nudge is invisible but need not run on every event.
      if (Date.now() - last < 2000) return
      last = Date.now()
      nudge()
      viewportStats.heals++
    }
    const later = () => {
      measure()
      for (const t of timers) clearTimeout(t)
      // After the keyboard's slide, and once more in case iOS settles late.
      timers.splice(0, timers.length, setTimeout(check, 150), setTimeout(check, 700))
    }
    measure()
    const vv = window.visualViewport
    vv?.addEventListener('resize', later)
    window.addEventListener('resize', later)
    window.addEventListener('popstate', later)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    document.addEventListener('visibilitychange', later)
    return () => {
      for (const t of timers) clearTimeout(t)
      vv?.removeEventListener('resize', later)
      window.removeEventListener('resize', later)
      window.removeEventListener('popstate', later)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
      document.removeEventListener('visibilitychange', later)
    }
  }, [])
}

/**
 * Scroll the page a pixel and back. A page with nothing to scroll (the chat: everything in it is
 * fixed) is made a pixel taller for the moment so it can; fixed things do not move with it.
 */
function nudge() {
  const html = document.documentElement
  const y = window.scrollY
  const grew = html.scrollHeight <= window.innerHeight + 1
  if (grew) html.style.minHeight = 'calc(100% + 2px)'
  window.scrollTo(0, y + 1)
  requestAnimationFrame(() => {
    window.scrollTo(0, y)
    if (grew) html.style.minHeight = ''
  })
}
