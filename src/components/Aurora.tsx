/**
 * Animated brand surface. 'card' (Home balance card): a brand → duo gradient with large, blurred
 * colour blobs floating over it so the colours blend into each other, plus soft white bubbles.
 * 'fab' (the + button): a slowly turning conic gradient. Transform-only animations (no moving
 * background-position, which read as a diagonal shine). Stops under prefers-reduced-motion. Put it
 * inside a `relative isolate overflow-hidden` parent and give the content `relative`.
 */
export function Aurora({ size = 'card' }: { size?: 'card' | 'fab' }) {
  if (size === 'fab') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-brand-600">
        <div className="animate-aurora-spin absolute -inset-1/2 bg-[conic-gradient(from_0deg,var(--color-brand-500),var(--color-duo-500),var(--color-brand-700),var(--color-duo-600),var(--color-brand-500))]" />
      </div>
    )
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-duo-600">
      <div className="animate-blob-a absolute -left-1/4 -top-1/3 h-[85%] w-[70%] rounded-full bg-duo-500/70 blur-3xl" />
      <div className="animate-blob-b absolute -bottom-1/3 -right-1/4 h-[90%] w-[75%] rounded-full bg-brand-400/60 blur-3xl" />
      <div className="animate-blob-c absolute left-1/3 top-1/4 h-[60%] w-[45%] rounded-full bg-brand-800/50 blur-3xl" />
      <div className="animate-bubble-a absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="animate-bubble-b absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/[0.08]" />
      <div className="animate-bubble-c absolute -left-8 top-1/2 h-20 w-20 rounded-full bg-white/[0.06]" />
    </div>
  )
}
