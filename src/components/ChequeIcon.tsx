import { useEffect, useRef, useState } from 'react'
import { useMe } from '@/hooks/auth'
import { currencySymbol } from '@/lib/money'

/*
 * The settle-up icon: a cheque book (a cheque on a rolled spine, the next page peeking below)
 * with the user's currency on it, and a pen that signs in the bottom-right corner. The pen's tip
 * follows the signature path exactly (getPointAtLength each frame) while the ink draws on behind
 * it, then the pen lifts away.
 *
 *  play 'loop'  signs again and again, often at first and then further and further apart (Home card)
 *  play 'once'  signs once when it appears (buttons; nobody needs to watch it)
 *  play 'none'  static, already signed
 * Reduced motion: static, already signed. Pauses while the tab is hidden.
 */

const SIGNATURE = 'M17.2 19.9 c0.7-2.3 1.9-2.8 2.2-0.7 c0.25 1.8 1 2 1.75 0.2 c0.7-1.7 1.5-1.9 2 0.2 c0.4 1.3 1.15 1.25 2.05-0.4'
/** ms before each signing in loop mode; after the list, every last value. */
const LOOP_GAPS = [900, 5000, 9000, 15000, 24000, 38000, 60000]

export function ChequeIcon({
  size = 20,
  play = 'once',
  currency,
  className = '',
}: {
  size?: number
  play?: 'loop' | 'once' | 'none'
  currency?: string
  className?: string
}) {
  const { profile } = useMe()
  const ink = useRef<SVGPathElement>(null)
  const pen = useRef<SVGGElement>(null)
  const [signed, setSigned] = useState(play === 'none')

  useEffect(() => {
    const path = ink.current,
      p = pen.current
    if (!path || !p) return
    const len = path.getTotalLength()
    path.style.strokeDasharray = `${len}`
    if (play === 'none' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      path.style.strokeDashoffset = '0'
      setSigned(true)
      return
    }
    path.style.strokeDashoffset = `${len}`
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let n = 0
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
    const place = (d: number, lift = 0, alpha = 1) => {
      const pt = path.getPointAtLength(d)
      p.setAttribute('transform', `translate(${(pt.x + lift * 0.7).toFixed(2)} ${(pt.y - lift).toFixed(2)})`)
      p.style.opacity = String(alpha)
    }
    const next = () => {
      if (play !== 'loop' && n > 0) return
      const gap = play === 'loop' ? LOOP_GAPS[Math.min(n, LOOP_GAPS.length - 1)] : 500
      timer = setTimeout(() => (document.hidden ? next() : sign()), gap)
    }
    const sign = () => {
      n++
      const t0 = performance.now(),
        IN = 320,
        WRITE = 1300,
        OUT = 420
      const frame = (now: number) => {
        const t = now - t0
        if (t < IN) {
          const k = t / IN
          place(0, 4 * (1 - k), k)
          path.style.strokeDashoffset = `${len}`
        } else if (t < IN + WRITE) {
          const d = ease((t - IN) / WRITE) * len
          place(d)
          path.style.strokeDashoffset = `${len - d}`
        } else if (t < IN + WRITE + OUT) {
          const k = (t - IN - WRITE) / OUT
          place(len, 4 * k, 1 - k)
          path.style.strokeDashoffset = '0'
        } else {
          p.style.opacity = '0'
          setSigned(true)
          next()
          return
        }
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }
    next()
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [play])

  const sym = currencySymbol(currency ?? profile.currency)
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`shrink-0 overflow-visible ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* the next page, peeking out under the cheque */}
      <path d="M8.4 24.7 H25.6 V22.6" strokeWidth="1.6" />
      {/* the cheque */}
      <rect x="8.4" y="8.4" width="19.2" height="14.2" rx="1.2" strokeWidth="1.7" />
      {/* the rolled spine on the left */}
      <rect x="4.4" y="8.4" width="4" height="16.3" rx="2" strokeWidth="1.7" />
      <path d="M6.4 11.2 V21.6" strokeWidth="1" opacity="0.55" />
      <text x="12.5" y="17" textAnchor="middle" fontSize={sym.length > 1 ? 4.6 : 6.6} fontWeight="800" fill="currentColor" stroke="none">
        {sym}
      </text>
      <path d="M16.2 12.3 H25 M16.2 15.1 H22.6" strokeWidth="1.45" />
      <path d="M10.8 20.2 H13.6" strokeWidth="1.45" />
      <path ref={ink} d={SIGNATURE} strokeWidth="1.3" style={{ strokeDashoffset: signed ? 0 : undefined }} />
      {/*
       * pen: tip at (0,0), leaning right, moved along the signature. A mostly solid barrel (80%,
       * owner's call: the see-through one looked like glass) with a lighter grip band and clip line
       * cut into it, and a solid nib, so it reads as a real pen over the cheque.
       */}
      <g ref={pen} style={{ opacity: 0 }}>
        <g transform="rotate(34)">
          <path d="M0 0 L-1.45 -3.1 H1.45 Z" fill="currentColor" fillOpacity="0.8" strokeWidth="0.85" />
          <path d="M0 0 L-0.55 -1.2 H0.55 Z" fill="currentColor" stroke="none" />
          <rect x="-1.75" y="-14" width="3.5" height="10.9" rx="1.2" fill="currentColor" fillOpacity="0.8" strokeWidth="0.95" />
          <rect x="-1.75" y="-5.6" width="3.5" height="2.5" rx="0.4" fill="#fff" fillOpacity="0.45" stroke="none" />
          <path d="M-1.75 -11.2 H1.75" stroke="#fff" strokeWidth="0.75" opacity="0.6" />
          <path d="M1.75 -13.2 h1.05 v4.2" strokeWidth="0.95" />
        </g>
      </g>
    </svg>
  )
}
