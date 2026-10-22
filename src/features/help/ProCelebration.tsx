import { useState } from 'react'
import './help-motion.css'
import { Link } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useMotion } from '@/hooks/useMotion'
import { usePro } from '@/hooks/usePro'
import { FeatureIcon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { errText } from '@/lib/errors'
import { celebration } from '@/lib/help-progress'

/** Claimed in this visit: the thank-you line stays until they leave Help (module state, not stored). */
let claimedThisVisit = false

/**
 * The guide finished (owner, 22 Oct 2026): a banner with the confetti picture, "Congratulations",
 * and Claim your Pro badge. Claiming awards Pro (repo.markPro, once ever), bursts a little accent
 * glitter, and the banner says where to show or hide it. Already Pro: nothing (the ring's tick says it).
 */
export function ProCelebration({ pct }: { pct: number }) {
  const { user } = useMe()
  const { earned } = usePro()
  const toast = useToast()
  const motion = useMotion()
  const [claimed, setClaimed] = useState(claimedThisVisit)
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)
  const state = celebration(pct, earned, claimed)
  if (!state) return null
  const claim = async () => {
    setBusy(true)
    try {
      await repo.markPro(user.uid)
      claimedThisVisit = true
      setClaimed(true)
      if (!motion.reduced && motion.prefs.on) setBurst((n) => n + 1)
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="card relative flex items-center gap-3 overflow-visible bg-gradient-to-br from-brand-50 to-duo-50 p-4 animate-[rise_0.45s_cubic-bezier(0.2,0.9,0.3,1)] dark:from-brand-900/40 dark:to-duo-900/20"
      role="status"
      data-testid="pro-celebration"
    >
      <span className="relative shrink-0">
        <FeatureIcon name="confetti" size={36} />
        {burst > 0 && <Glitter key={burst} />}
      </span>
      {state === 'claim' ? (
        <div className="min-w-0 flex-1">
          <div className="font-bold">Congratulations</div>
          <div className="text-muted text-sm">You finished the guide.</div>
          <button type="button" className="btn-primary btn-sm mt-2 min-h-11" disabled={busy} onClick={() => void claim()} data-testid="pro-claim">
            Claim your Pro badge
          </button>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="font-bold">Pro is yours</div>
          <div className="text-muted text-sm">
            Show or hide it in{' '}
            <Link to="/settings/preferences" className="font-semibold text-brand-700 underline dark:text-brand-300">
              Preferences
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  )
}

/** A small burst of accent dots from the confetti picture: transform and opacity only, once. */
function Glitter() {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.2
    const r = 26 + (i % 3) * 8
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: i % 2 ? 'var(--color-duo-500)' : 'var(--color-brand-500)', d: (i % 4) * 30 }
  })
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {dots.map((p, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of dots
          key={i}
          className="pro-glitter absolute h-1.5 w-1.5 rounded-full"
          style={{ background: p.c, ['--gx' as string]: `${p.x}px`, ['--gy' as string]: `${p.y}px`, animationDelay: `${p.d}ms` }}
        />
      ))}
    </span>
  )
}
