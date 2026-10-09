import { useCallback, useEffect, useRef, useState } from 'react'
import { PartyPopper } from 'lucide-react'

/*
 * "All settled up" celebration: a party-popper icon that pops and throws a little confetti
 * (WAAPI, ~1.3 s). Plays once on mount and again on each tap of the icon. Under
 * prefers-reduced-motion it's just a static icon.
 */

const reducedQuery = '(prefers-reduced-motion: reduce)'
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(reducedQuery).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(reducedQuery)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const isDark = () => document.documentElement.classList.contains('dark')

function palette() {
  const dark = isDark()
  return {
    dark,
    colors: dark
      ? [cssVar('--color-brand-300', '#c4b5fd'), cssVar('--color-duo-400', '#e879f9'), cssVar('--color-brand-400', '#a78bfa')]
      : [cssVar('--color-brand-500', '#8b5cf6'), cssVar('--color-duo-500', '#d946ef'), cssVar('--color-brand-600', '#7c3aed')],
    gold: dark ? '#fcd34d' : '#f59e0b',
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

const CONFETTI = Array.from({ length: 12 }, (_, i) => i)

export function Celebrate({ size = 88 }: { size?: number }) {
  const reduced = useReducedMotion()
  const iconRef = useRef<HTMLSpanElement>(null)
  const bitsRef = useRef<HTMLSpanElement>(null)
  const anims = useRef<Animation[]>([])

  const popIcon = useCallback(() => {
    anims.current.forEach((a) => a.cancel())
    anims.current = []
    const icon = iconRef.current
    if (icon?.animate) {
      anims.current.push(
        icon.animate(
          [
            { transform: 'rotate(-24deg) scale(0.6)', offset: 0 },
            { transform: 'rotate(14deg) scale(1.14)', offset: 0.45 },
            { transform: 'rotate(-6deg) scale(0.97)', offset: 0.7 },
            { transform: 'rotate(0deg) scale(1)', offset: 1 },
          ],
          { duration: 760, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
        ),
      )
    }
    const { colors, gold } = palette()
    const bits = bitsRef.current?.children
    if (!bits) return
    for (let i = 0; i < bits.length; i++) {
      const el = bits[i] as HTMLElement
      el.style.background = i % 3 === 2 ? gold : colors[i % 2]
      // The popper's mouth points up-right: throw the bits into that quarter.
      const a = (-90 + rand(-25, 95)) * (Math.PI / 180)
      const d = size * rand(0.45, 0.85)
      const x = Math.cos(a) * d,
        y = Math.sin(a) * d
      const spin = rand(-360, 360)
      anims.current.push(
        el.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg) scale(0.4)', opacity: 0 },
            { transform: `translate(${x * 0.7}px, ${y * 0.7}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${x}px, ${y + size * 0.35}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
          ],
          { duration: rand(900, 1200), delay: 120 + rand(0, 90), easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)', fill: 'backwards' },
        ),
      )
    }
  }, [size])

  const play = useCallback(() => {
    if (reduced) return
    popIcon()
  }, [reduced, popIcon])

  useEffect(() => {
    if (reduced) return
    const t = setTimeout(popIcon, 150) // after the page has painted
    return () => {
      clearTimeout(t)
      anims.current.forEach((a) => a.cancel())
      anims.current = []
    }
  }, [reduced, popIcon])

  const badge = (
    <span
      className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-duo-100 text-brand-600 ring-1 ring-brand-500/15 dark:from-brand-900/60 dark:to-duo-900/40 dark:text-brand-200 dark:ring-white/10"
      style={{ width: size, height: size }}
    >
      <span ref={iconRef} className="flex" style={{ transformOrigin: '35% 70%' }}>
        <PartyPopper size={size * 0.5} strokeWidth={1.8} aria-hidden />
      </span>
      {!reduced && (
        <span ref={bitsRef} aria-hidden className="pointer-events-none absolute" style={{ left: '58%', top: '34%' }}>
          {CONFETTI.map((i) => (
            <span key={i} className="absolute block opacity-0" style={{ width: i % 2 ? 6 : 4, height: i % 2 ? 3 : 6, borderRadius: i % 4 === 0 ? 9 : 1 }} />
          ))}
        </span>
      )}
    </span>
  )

  if (reduced)
    return (
      <div data-testid="celebrate" aria-hidden>
        {badge}
      </div>
    )
  return (
    <button type="button" onClick={play} aria-label="Celebrate again" data-testid="celebrate" className="rounded-full transition active:scale-95">
      {badge}
    </button>
  )
}
