/*
 * The mode button in Profile's header (src/components/ModeButton.tsx): a leaf in Simple, and in
 * Advanced one of five pictures (rocket, chip, brain, tools, dev tools), picked at random each time
 * the person switches to Advanced and kept on the device until the next switch (owner, 22 Oct 2026).
 * Switching plays a short pop with a burst of dots and a faint wash of the accent, unless the device
 * or Settings → Animations asks for less motion. Pure: no React, no storage.
 */

import { MODE_INFO, type Mode } from './mode'

/** How many Advanced pictures there are (ModeButton's ADVANCED_ICONS, in this order). */
export const ADVANCED_ICON_COUNT = 5
export const MODE_ICON_KEY = 'splitnow-mode-icon'

/**
 * The stored pick. `spent`: the person has been in Simple since it was picked, so the next time
 * Advanced shows it gets a new one (whichever way they switched: this button, Preferences, another device).
 */
export interface IconPick {
  index: number
  spent: boolean
}

export function parseIconPick(raw: string | null | undefined): IconPick | null {
  const m = /^(\d+)(-?)$/.exec(raw ?? '')
  if (!m) return null
  const index = Number(m[1])
  return index < ADVANCED_ICON_COUNT ? { index, spent: m[2] === '-' } : null
}

export const formatIconPick = (p: IconPick): string => `${p.index}${p.spent ? '-' : ''}`

/** A random picture from `rand` in [0, 1), never the one shown last time, so a switch always looks new. */
export function pickAdvancedIcon(rand: number, prev: number | null): number {
  const r = Math.min(Math.max(rand, 0), 0.999999)
  if (prev === null || prev < 0 || prev >= ADVANCED_ICON_COUNT) return Math.floor(r * ADVANCED_ICON_COUNT)
  // Pick among the other four, then step over the previous one.
  const i = Math.floor(r * (ADVANCED_ICON_COUNT - 1))
  return i >= prev ? i + 1 : i
}

/**
 * What to store now the mode is `mode`, or null when the stored pick stays as it is. Advanced with
 * no pick, or a spent one, gets a new picture; Simple marks the current pick spent.
 */
export function settleIconPick(mode: Mode, stored: IconPick | null, rand: number): IconPick | null {
  if (mode === 'advanced') return !stored || stored.spent ? { index: pickAdvancedIcon(rand, stored?.index ?? null), spent: false } : null
  return stored && !stored.spent ? { ...stored, spent: true } : null
}

/** The icon to draw: 'simple' (the leaf) or the index of an Advanced picture. */
export type ModeIconKey = 'simple' | number
export const modeIconKey = (mode: Mode, pick: IconPick | null): ModeIconKey => (mode === 'simple' ? 'simple' : (pick?.index ?? 0))

export const otherMode = (mode: Mode): Mode => (mode === 'simple' ? 'advanced' : 'simple')

/** The button says which mode is on and what a tap does. */
export const modeButtonLabel = (mode: Mode): string => `Mode: ${MODE_INFO[mode].label}. Switch to ${MODE_INFO[otherMode(mode)].label}`

/** The toast after a switch (with Undo). */
export const modeSwitchToast = (mode: Mode): string => (mode === 'simple' ? 'Simple: everyday features' : 'Advanced: every feature and setting')

/**
 * Whether a mode change plays the switch animation: never on the first paint, and never when the
 * device asks for reduced motion or Settings → Animations is off (then the icon just swaps).
 */
export function modeSwitchMotion(o: { firstRender: boolean; reduced: boolean; motionOn: boolean }): 'animate' | 'instant' {
  return !o.firstRender && !o.reduced && o.motionOn ? 'animate' : 'instant'
}

/** The switch's timeline in ms from the tap (the owner's signed-off board, switch.html). */
export const MODE_SWITCH = {
  /** old icon shrinks to 0.6 and fades */
  exit: 140,
  /** new icon appears (filled) at… */
  enterAt: 100,
  /** …overshoots to 1.22 at… */
  overshootAt: 330,
  /** …and settles at 1 by */
  settleAt: 520,
  /** filled holds until, then cross-fades to the line look by `lineAt` */
  fillUntil: 620,
  lineAt: 900,
  /** the dots */
  dotsAt: 180,
  dotsFor: 480,
  /** the accent wash */
  washAt: 60,
  washFor: 800,
  /** everything is over by */
  total: 900,
} as const

export interface BurstDot {
  /** where it ends, px from the icon's centre */
  dx: number
  dy: number
  tone: 'brand' | 'duo'
}

/** Ten dots evenly round the icon, alternating accent colours, flying 20, 26 or 32 px out. */
export function burstDots(n = 10): BurstDot[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.3
    const r = 20 + (i % 3) * 6
    return { dx: Math.round(Math.cos(a) * r * 10) / 10, dy: Math.round(Math.sin(a) * r * 10) / 10, tone: i % 2 ? 'duo' : 'brand' }
  })
}
