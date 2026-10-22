/*
 * When light passes over the PRO badges (owner's board, 22 Oct 2026). One clock for the whole app,
 * so every PRO on screen catches the light together: an opening round soon after a screen appears
 * (a sweep left to right, a quicker, steeper glint back right to left, another sweep), then passes
 * further and further apart (gaps of 6–9 s, then 10–16 s, then 20–40 s), mostly sweeps. The
 * gaps are random so it never feels like a metronome. Pure: src/components/ProBadge.tsx runs it.
 */

export type ShimmerKind = 'sweep' | 'glint'
export interface ShimmerPass {
  /** ms after the round starts */
  at: number
  kind: ShimmerKind
}

/** How long each pass takes to cross the word, ms. */
export const PASS_MS: Readonly<Record<ShimmerKind, number>> = { sweep: 1100, glint: 600 }

/** A new opening round (on a new screen) at most this often. */
export const ROUND_MIN_GAP_MS = 60_000

const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo)

/**
 * The passes of one round, `count` long (the clock schedules a new round when it runs out, starting
 * from the slow end). `rand` returns [0, 1).
 */
export function shimmerPlan(rand: () => number, count = 12): ShimmerPass[] {
  const out: ShimmerPass[] = []
  let t = 0
  for (let i = 0; i < count; i++) {
    let gap: number
    let kind: ShimmerKind
    if (i < 3) {
      // the opening round: all three inside the first ~3.5 s
      gap = i === 0 ? between(rand, 500, 1000) : i === 1 ? between(rand, 1200, 1400) : between(rand, 1100, 1300)
      kind = i === 1 ? 'glint' : 'sweep'
    } else {
      gap = i < 5 ? between(rand, 6000, 9000) : i < 8 ? between(rand, 10_000, 16_000) : between(rand, 20_000, 40_000)
      kind = rand() < 0.25 ? 'glint' : 'sweep'
    }
    t += gap
    out.push({ at: Math.round(t), kind })
  }
  return out
}

/** The slow tail that follows a round once its passes run out: 20–40 s apart, mostly sweeps. */
export function shimmerTail(rand: () => number, count = 6): ShimmerPass[] {
  const out: ShimmerPass[] = []
  let t = 0
  for (let i = 0; i < count; i++) {
    t += between(rand, 20_000, 40_000)
    out.push({ at: Math.round(t), kind: rand() < 0.25 ? 'glint' : 'sweep' })
  }
  return out
}

/** Whether a newly shown screen may start the opening round again (once a minute at most). */
export function mayRestart(lastStart: number | null, now: number): boolean {
  return lastStart === null || now - lastStart >= ROUND_MIN_GAP_MS
}

/** Where the light starts and ends (translateX of a highlight as wide as the word): sweeps go right, glints come back. */
export function passTravel(kind: ShimmerKind): [string, string] {
  return kind === 'sweep' ? ['-110%', '110%'] : ['110%', '-110%']
}
