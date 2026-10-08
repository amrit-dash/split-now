import { useEffect, useRef } from 'react'

/**
 * Animated brand surface: a smoke-like blend. Large, heavily blurred patches in a lighter and a
 * darker shade of the theme drift over the brand → duo gradient and fade in and out, so the
 * surface keeps shifting between light and dark areas without ever going flat. 'card' is the
 * Home balance card (plus soft white bubbles); 'fab' is the + button (smaller, quicker). Transform
 * and opacity only; stops under prefers-reduced-motion, and pauses (index.css `.aurora-paused`)
 * while the surface is scrolled off-screen or the tab is hidden, so nothing animates unseen.
 * Put it inside a `relative isolate overflow-hidden` parent and give the content `relative`.
 */
export function Aurora({ size = 'card' }: { size?: 'card' | 'fab' }) {
  const ref = usePauseWhenUnseen()
  if (size === 'fab') {
    return (
      <div
        ref={ref}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-gradient-to-br from-brand-500 via-brand-600 to-duo-600"
      >
        <div className="animate-smoke-a absolute -left-1/3 -top-1/3 h-full w-full rounded-full bg-brand-300/60 blur-md" />
        <div className="animate-smoke-b absolute -bottom-1/3 -right-1/3 h-full w-full rounded-full bg-brand-900/70 blur-md" />
        <div className="animate-smoke-c absolute left-0 top-1/4 h-3/4 w-3/4 rounded-full bg-duo-500/60 blur-md" />
      </div>
    )
  }
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-duo-600">
      {/* colour blobs */}
      <div className="animate-blob-a absolute -left-1/4 -top-1/3 h-[85%] w-[70%] rounded-full bg-duo-500/70 blur-3xl" />
      <div className="animate-blob-b absolute -bottom-1/3 -right-1/4 h-[90%] w-[75%] rounded-full bg-brand-400/60 blur-3xl" />
      <div className="animate-blob-c absolute left-1/3 top-1/4 h-[60%] w-[45%] rounded-full bg-brand-800/50 blur-3xl" />
      {/* smoke: a light and a dark patch phasing in and out */}
      <div className="animate-smoke-a absolute -left-[10%] top-[10%] h-[70%] w-[55%] rounded-full bg-brand-200/45 blur-2xl" />
      <div className="animate-smoke-b absolute -right-[5%] -top-[20%] h-[75%] w-[60%] rounded-full bg-brand-900/60 blur-2xl" />
      <div className="animate-smoke-c absolute bottom-[-25%] left-[25%] h-[65%] w-[50%] rounded-full bg-duo-300/40 blur-2xl" />
      <div className="animate-bubble-a absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="animate-bubble-b absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/[0.08]" />
      <div className="animate-bubble-c absolute -left-8 top-1/2 h-20 w-20 rounded-full bg-white/[0.06]" />
    </div>
  )
}

/** Toggles `.aurora-paused` on the element while it is out of the viewport or the page is hidden. */
function usePauseWhenUnseen() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let visible = true
    const apply = () => el.classList.toggle('aurora-paused', !visible || document.hidden)
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              apply()
            },
            { threshold: 0 },
          )
        : null
    io?.observe(el)
    document.addEventListener('visibilitychange', apply)
    apply()
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])
  return ref
}
