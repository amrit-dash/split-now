/** Loading placeholders that keep the layout steady (no spinner flash on tab switches). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-2xl bg-slate-200/70 dark:bg-ink-800 ${className}`} />
}

export function ListSkeleton({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {avatar && <Skeleton className="h-10 w-10 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ className = 'h-40' }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />
}
