import { useEffect } from 'react'
import { needsHeal, opensKeyboard, tallestHeights } from '@/lib/keyboard'
import { isStandalone } from '@/lib/push'

/**
 * Gives the installed iPhone app its height back after the keyboard (src/lib/keyboard.ts): once the
 * keyboard has gone and the app is still short of its tallest height, the page is hidden and shown
 * again in one go, which makes WebKit measure the screen again. Scroll positions are put back and
 * nothing is painted in between. Only the installed app: in a browser tab the height changes as the
 * toolbars come and go, which is not this bug.
 */
export function useViewportHeal() {
  useEffect(() => {
    if (!isStandalone()) return
    let seen: Record<number, number> = {}
    let tried: number | undefined
    const timers: ReturnType<typeof setTimeout>[] = []
    const measure = () => {
      seen = tallestHeights(seen, window.innerWidth, window.innerHeight)
    }
    const check = () => {
      measure()
      const height = window.innerHeight
      const typing = opensKeyboard(document.activeElement as HTMLElement | null)
      if (!needsHeal(height, seen[Math.round(window.innerWidth)], typing, tried)) return
      // A sheet's entrance would play again: wait for it to close (the next focus change checks again).
      if (document.querySelector('[role="dialog"]')) return
      tried = height
      remeasure()
    }
    const later = () => {
      for (const t of timers) clearTimeout(t)
      // After the keyboard's slide, and once more in case iOS settles late.
      timers.splice(0, timers.length, setTimeout(check, 150), setTimeout(check, 600))
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

/** Hide the page and show it again within one task (no paint in between), keeping every scroll position. */
function remeasure() {
  const body = document.body
  const scrolled: [HTMLElement, number][] = []
  for (const el of body.querySelectorAll<HTMLElement>('*')) if (el.scrollTop > 0) scrolled.push([el, el.scrollTop])
  const y = window.scrollY
  body.style.display = 'none'
  void body.offsetHeight
  body.style.display = ''
  void body.offsetHeight
  for (const [el, top] of scrolled) el.scrollTop = top
  if (y) window.scrollTo(0, y)
}
