import { useEffect, useRef } from 'react'
import { reportAppError } from '@/lib/app-errors'
import { type LayoutSample, layoutProblem } from '@/lib/layout-check'

/** env(safe-area-inset-bottom) in px, read through a hidden probe (CSS is the only way to see it). */
function insetBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const px = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return px
}

/** The first element whose right edge is past the page's width, as tag.class, for the 'wide' case. */
function widest(limit: number): string | undefined {
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect()
    if (r.width && r.right > limit + 1) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : ''
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}`.slice(0, 120)
    }
  }
  return undefined
}

function measure(route: string, from: string | undefined, when: string): LayoutSample {
  const de = document.documentElement
  const vv = window.visualViewport
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]')
  const nr = nav?.getBoundingClientRect()
  const s: LayoutSample = {
    route,
    from,
    when,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    clientW: de.clientWidth,
    scrollW: de.scrollWidth,
    vvW: vv?.width ?? window.innerWidth,
    vvH: vv?.height ?? window.innerHeight,
    vvScale: vv?.scale ?? 1,
    vvLeft: vv?.offsetLeft ?? 0,
    vvTop: vv?.offsetTop ?? 0,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    insetBottom: insetBottom(),
  }
  if (nr?.height) {
    s.navBottom = nr.bottom
    s.navHeight = nr.height
  }
  if (s.scrollW > s.clientW + 1) s.wide = widest(s.clientW)
  return s
}

/**
 * The layout diagnostic (lib/layout-check.ts): after each page change, and when Chrome resizes the
 * visible area, measure the window, the visible area and the tab bar, and file a 'layout' report
 * when something is off. Only for installed apps on touch phones, where the glitch was seen, and
 * only while signed in (the report sink drops it otherwise).
 */
export function useLayoutCheck(pathname: string): void {
  const prev = useRef<string | undefined>(undefined)
  const on = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  useEffect(() => {
    if (!on) return
    const from = prev.current
    prev.current = pathname
    const check = (when: string) => {
      try {
        const line = layoutProblem(measure(pathname, from, when))
        if (line) reportAppError(line, 'layout')
      } catch {
        // a diagnostic never breaks the page
      }
    }
    const timers = [window.setTimeout(() => check('500'), 500), window.setTimeout(() => check('2000'), 2000)]
    let debounce = 0
    const onResize = () => {
      window.clearTimeout(debounce)
      // Typing brings the keyboard up and shrinks the visible area: that is expected, not a glitch.
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      if (!typing) debounce = window.setTimeout(() => check('resize'), 600)
    }
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      for (const t of timers) window.clearTimeout(t)
      window.clearTimeout(debounce)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [pathname, on])
}
