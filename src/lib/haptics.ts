/**
 * Short vibrations that confirm what just happened, where the phone has a motor. Kept tiny on
 * purpose: a save is one tap of 8 ms, a sheet pulled past its close point 6 ms, an error a
 * double knock. Nothing when the device asks for less motion or can't vibrate (iPhone Safari).
 */
export type Haptic = 'save' | 'sheetClose' | 'error'

export const HAPTICS: Record<Haptic, number | number[]> = {
  save: 8,
  sheetClose: 6,
  error: [10, 40, 10],
}

/** The pattern to play, or null for none. */
export function hapticPattern(kind: Haptic, env: { reducedMotion: boolean; canVibrate: boolean }): number | number[] | null {
  if (env.reducedMotion || !env.canVibrate) return null
  return HAPTICS[kind] ?? null
}

/** Play one, quietly doing nothing where it isn't offered. */
export function haptic(kind: Haptic): void {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pattern = hapticPattern(kind, { reducedMotion, canVibrate: typeof nav?.vibrate === 'function' })
    if (pattern !== null) nav?.vibrate(pattern)
  } catch {
    /* not offered */
  }
}
