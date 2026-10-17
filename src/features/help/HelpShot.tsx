import { useEffect, useRef } from 'react'
import { Camera } from 'lucide-react'
import { type HelpShot, markBox, shotSrc } from '@/lib/help'

/**
 * A section's screenshot from the app (scripts/help-media.mjs), shown as a picture and nothing
 * else: a phone frame labelled Screenshot, nothing in it reacts to a tap, and the step being read
 * is lit by dimming the rest of the picture around its control, with small numbered badges for the
 * others. The steps beside it are what you tap. A tall picture scrolls itself to the lit step. The
 * picture matches the person's theme and accent. The file loads only when the panel is opened (it
 * isn't in the installed app's first download).
 */
export function HelpShotView({ id, shot, active, still }: { id: string; shot: HelpShot; active: number; still: boolean }) {
  const frame = useRef<HTMLDivElement>(null)
  const lit = useRef<HTMLSpanElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the lit step changes
  useEffect(() => {
    const f = frame.current
    const el = lit.current
    if (!f || !el || f.scrollHeight <= f.clientHeight) return
    f.scrollTo({ top: Math.max(0, el.offsetTop - f.clientHeight / 3), behavior: still ? 'auto' : 'smooth' })
  }, [active, still])
  const shown = shot.marks.find((m) => m.step === active)
  // The picture in the theme and accent the app is showing right now (set on <html> by theme.ts and accent.ts).
  const root = typeof document === 'undefined' ? null : document.documentElement
  const src = shotSrc(id, { dark: !!root?.classList.contains('dark'), accent: root?.getAttribute('data-accent') })
  return (
    <figure className="m-0" data-testid="help-shot">
      <div className="mx-auto max-w-xs rounded-[1.75rem] border-[5px] border-slate-800 bg-slate-800 shadow-lg dark:border-ink-700 dark:bg-ink-700">
        <div className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold text-white/80">
          <span className="flex items-center gap-1">
            <Camera size={11} aria-hidden /> Screenshot
          </span>
          <span>{shown ? `Step ${shown.step}` : ''}</span>
        </div>
        <div ref={frame} className="relative max-h-[24rem] select-none overflow-y-auto rounded-[1.3rem] bg-white" aria-hidden>
          <div className="pointer-events-none relative" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
            <img src={src} width={shot.w} height={shot.h} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full" draggable={false} />
            {shot.marks.map((m) => {
              const b = markBox(m)
              const on = m.step === active
              return (
                <span
                  key={m.step}
                  ref={on ? lit : undefined}
                  className={`absolute rounded-xl transition-[box-shadow,opacity] duration-500 ${on ? 'z-10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]' : ''}`}
                  style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }}
                  data-testid="help-shot-mark"
                  data-on={on || undefined}
                >
                  <span
                    className={`absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold shadow ${on ? `bg-fill text-on-fill ${still ? '' : 'animate-pop'}` : 'bg-white/90 text-slate-700'}`}
                  >
                    {m.step}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
      <figcaption className="text-muted mt-2 text-center text-xs">A screenshot of the app. Your screen may look a little different.</figcaption>
    </figure>
  )
}
