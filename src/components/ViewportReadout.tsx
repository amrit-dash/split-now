import { useEffect, useState } from 'react'
import { viewportStats } from '@/hooks/useViewportStats'
import { opensKeyboard } from '@/lib/keyboard'
import { isStandalone } from '@/lib/push'

/** Turned on and off by five taps on Profile's version line; remembered on this device. */
export const READOUT_KEY = 'sn-viewport-readout'
export const READOUT_EVENT = 'sn-viewport-readout'

export function readoutOn(): boolean {
  try {
    return localStorage.getItem(READOUT_KEY) === '1'
  } catch {
    return false
  }
}

export function setReadoutOn(on: boolean) {
  try {
    if (on) localStorage.setItem(READOUT_KEY, '1')
    else localStorage.removeItem(READOUT_KEY)
  } catch {}
  window.dispatchEvent(new Event(READOUT_EVENT))
}

/** One CSS length, measured on a hidden element. */
function cssPx(prop: 'height' | 'paddingBottom' | 'paddingTop', value: string): number {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;visibility:hidden;pointer-events:none'
  el.style[prop] = value
  document.body.appendChild(el)
  const r = prop === 'height' ? el.offsetHeight : Number.parseFloat(getComputedStyle(el)[prop]) || 0
  el.remove()
  return Math.round(r)
}

/** Where `bottom: 0` lands for a fixed element: the bottom of the box iOS lays the app out in. */
function fixedBottom(): number {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none'
  document.body.appendChild(el)
  const b = el.getBoundingClientRect().bottom
  el.remove()
  return Math.round(b)
}

function read(): string[] {
  const vv = window.visualViewport
  const rootBottom = (sel: string) => {
    const el = document.querySelector(sel)
    return el ? Math.round(el.getBoundingClientRect().bottom) : '-'
  }
  const ios = /OS (\d+[_.]\d+(?:[_.]\d+)?)/.exec(navigator.userAgent)?.[1]?.replace(/_/g, '.') ?? '?'
  return [
    `iOS ${ios} · installed ${isStandalone() ? 'yes' : 'no'} · typing ${opensKeyboard(document.activeElement as HTMLElement | null) ? 'yes' : 'no'}`,
    `screen ${window.screen.width}×${window.screen.height} · inner ${window.innerWidth}×${window.innerHeight} · outer ${window.outerHeight}`,
    `html client ${document.documentElement.clientHeight} · scrollY ${Math.round(window.scrollY)} · fixed bottom:0 at ${fixedBottom()}`,
    `vv ${vv ? `${Math.round(vv.height)} @${Math.round(vv.offsetTop)} ×${vv.scale.toFixed(2)}` : 'none'}`,
    `dvh ${cssPx('height', '100dvh')} · lvh ${cssPx('height', '100lvh')} · svh ${cssPx('height', '100svh')} · vh ${cssPx('height', '100vh')}`,
    `safe top ${cssPx('paddingTop', 'env(safe-area-inset-top)')} · bottom ${cssPx('paddingBottom', 'env(safe-area-inset-bottom)')}`,
    `short ${viewportStats.missing} · tallest ${viewportStats.tallest}`,
    `chat bottom ${rootBottom('[data-testid="chat-screen"]')} · tab bar bottom ${rootBottom('nav[aria-label="Main"]')}`,
  ]
}

/**
 * Screen measurements for chasing the installed iPhone app's height after the keyboard
 * (src/lib/keyboard.ts): a small panel under the header, updated twice a second. Off unless turned on.
 */
export function ViewportReadout() {
  const [on, setOn] = useState(readoutOn)
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const sync = () => setOn(readoutOn())
    window.addEventListener(READOUT_EVENT, sync)
    return () => window.removeEventListener(READOUT_EVENT, sync)
  }, [])
  useEffect(() => {
    if (!on) return
    const tick = () => setLines(read())
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [on])
  if (!on) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-2 top-[calc(var(--safe-top)+4.5rem)] z-[100] rounded-xl bg-black/85 px-3 py-2 font-mono text-[11px] leading-snug text-lime-300"
      aria-hidden
      data-testid="viewport-readout"
    >
      {lines.map((l) => (
        <div key={l.slice(0, 12)}>{l}</div>
      ))}
    </div>
  )
}
