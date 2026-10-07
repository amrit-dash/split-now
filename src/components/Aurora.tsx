/**
 * Soft animated background for brand surfaces (Home balance card, the + button): a slowly
 * drifting gradient plus blurred blobs of light, so there are no hard edges. Pure CSS
 * transforms (GPU-friendly); stops under prefers-reduced-motion. Place inside a
 * `relative overflow-hidden` parent; content goes on top with `relative`.
 */
export function Aurora({ size = 'card' }: { size?: 'card' | 'fab' }) {
  const fab = size === 'fab'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-aurora-shift absolute inset-0 bg-[length:220%_220%] bg-gradient-to-br from-brand-600 via-brand-vivid to-duo-600" />
      <div className={`animate-blob-a absolute rounded-full bg-duo-500/35 blur-2xl ${fab ? '-left-3 -top-3 h-10 w-10 blur-md' : '-right-12 -top-16 h-56 w-56'}`} />
      <div className={`animate-blob-b absolute rounded-full bg-white/12 blur-2xl ${fab ? '-bottom-4 -right-2 h-10 w-10 blur-md' : '-bottom-20 right-6 h-48 w-48'}`} />
      {!fab && <div className="animate-blob-c absolute -left-16 top-1/3 h-40 w-40 rounded-full bg-brand-300/20 blur-3xl" />}
    </div>
  )
}
