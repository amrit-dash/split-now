/**
 * Help's progress, top right of the guide (owner, 22 Oct 2026): a ring in the accent's gradient
 * with the percentage inside it, and no label beside it. Its name says the numbers for screen
 * readers ("Help 40% done, 14 of 35 sections").
 */
export function HelpRing({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div
      className="flex h-11 w-11 items-center justify-center"
      role="img"
      aria-label={`Help ${pct}% done, ${done} of ${total} sections`}
      data-testid="help-ring"
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
        <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-current text-[11px] font-extrabold">
          {pct}%
        </text>
      </svg>
    </div>
  )
}
