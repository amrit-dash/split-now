/*
 * Dragging a bottom sheet down to close it (components/Sheet.tsx). The speed is measured from the
 * last few moves, not from the start of the drag: a slow pull that ends in a quick flick should
 * close, and a fast start that stops short should not. Past CLOSE_AT, or a downward flick faster
 * than FLICK, closes it; anything less springs back.
 */

/** px dragged down that always closes */
export const CLOSE_AT = 110
/** px/ms: a downward flick at least this fast closes, however short */
export const FLICK = 0.3
/** only moves this recent (ms) count towards the release speed */
const WINDOW = 100

export type DragSample = { y: number; t: number }

/** Keep the samples the release speed is measured from (the last WINDOW ms, at most 6). */
export function pushSample(samples: DragSample[], s: DragSample): DragSample[] {
  const next = [...samples, s].filter((x) => s.t - x.t <= WINDOW)
  return next.slice(-6)
}

/** Downward speed (px/ms) over the recent samples; 0 with fewer than two or no time between them. */
export function releaseVelocity(samples: DragSample[]): number {
  if (samples.length < 2) return 0
  const a = samples[0],
    b = samples[samples.length - 1]
  const dt = b.t - a.t
  return dt > 0 ? (b.y - a.y) / dt : 0
}

export function shouldCloseSheet(dy: number, velocity: number): boolean {
  return dy > CLOSE_AT || (dy > 0 && velocity > FLICK)
}

/** How a closing sheet leaves: a slide down, or (reduced motion) a short fade. */
export function sheetExit(reduceMotion: boolean): { ms: number; panel: { transform?: string; opacity?: number; transition: string } } {
  return reduceMotion
    ? { ms: 150, panel: { opacity: 0, transition: 'opacity 150ms ease-out' } }
    : { ms: 200, panel: { transform: 'translateY(100%)', transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' } }
}
