import './help-motion.css'

/**
 * Help's progress, top right of the guide (owner, 22 Oct 2026): a ring in the accent's gradient
 * with the percentage inside it, and no label beside it. Its name says the numbers for screen
 * readers ("Help 40% done, 14 of 35 sections"). At 100% the number gives way to a tick drawn in;
 * a section added later brings the number back.
 */
export function HelpRing({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  const complete = pct >= 100
  return (
    <div
      className="flex h-11 w-11 items-center justify-center"
      role="img"
      aria-label={complete ? 'Help complete' : `Help ${pct}% done, ${done} of ${total} sections`}
      data-testid="help-ring"
      data-complete={complete || undefined}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
        <defs>
          <linearGradient id="help-ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-600)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-duo-500)' }} />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="url(#help-ring-g)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 22 22)"
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
        {complete ? (
          <path
            d="M14.5 22.5l5 5 10-11"
            fill="none"
            stroke="url(#help-ring-g)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="help-tick"
          />
        ) : (
          <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-current text-[11px] font-extrabold">
            {pct}%
          </text>
        )}
      </svg>
    </div>
  )
}
