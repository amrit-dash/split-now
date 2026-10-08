/**
 * Animated brand surface. 'card' (Home balance card): a gradient that sweeps between the
 * brand and duo colours, plus the two translucent bubbles drifting slowly. 'fab' (the + button):
 * the gradient sweep only. Pure CSS; stops under prefers-reduced-motion. Put it inside a
 * `relative isolate overflow-hidden` parent and give the content `relative`.
 */
export function Aurora({ size = 'card' }: { size?: 'card' | 'fab' }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`absolute inset-0 bg-[length:300%_300%] bg-gradient-to-br from-brand-700 via-duo-500 to-brand-500 ${size === 'fab' ? 'animate-aurora-fab' : 'animate-aurora-shift'}`} />
      {size === 'card' && (
        <>
          <div className="animate-bubble-a absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="animate-bubble-b absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="animate-bubble-c absolute -left-8 top-1/2 h-20 w-20 rounded-full bg-white/[0.06]" />
        </>
      )}
    </div>
  )
}
