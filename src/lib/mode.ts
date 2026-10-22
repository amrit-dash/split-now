/*
 * Simple or Advanced (owner, 22 Oct 2026). Simple is the app for most people: splitting, settling
 * up, private groups and Live table, with the extra controls and most explanations out of the way.
 * Advanced is the whole app. The mode only hides things: every setting keeps its value, and what
 * runs in the background (captured payments, approvals, automations) keeps running. Anything that
 * arrives for the person (an Inbox item) still shows and can be acted on.
 *
 * The person picks it in Settings → Preferences or from Profile's header, and it follows the
 * account like the theme (appearance-sync.ts). Until they pick, 'auto' decides: Simple, unless the
 * account already uses something only Advanced shows (autoMode), so nobody who set those up finds
 * them gone after the update. Pure: no React, no storage.
 */

import { isDefaultMotion, type MotionPrefs } from './motion'

export const MODES = ['simple', 'advanced'] as const
export type Mode = (typeof MODES)[number]

export const MODE_INFO: Record<Mode, { label: string; hint: string }> = {
  simple: { label: 'Simple', hint: 'Splitting and settling up, without the extras.' },
  advanced: { label: 'Advanced', hint: 'Every feature and setting.' },
}

/** A person's choice: a mode, or 'auto' (not picked yet). */
export type ModeChoice = Mode | 'auto'
export const isMode = (v: unknown): v is Mode => typeof v === 'string' && (MODES as readonly string[]).includes(v)
export const resolveModeChoice = (v: unknown): ModeChoice => (isMode(v) ? v : 'auto')

/** What the account already uses that only Advanced shows. Undefined: not known yet (still loading). */
export interface ModeSignals {
  /** detail level, icon style, two-tone or the animations changed from their defaults */
  customLook: boolean
  /** a capture key exists (captured payments from SMS or a share) */
  capture?: boolean
  /** a group they made has an approval setting on (Needs OK, payment OK, merging or new people) */
  approvals?: boolean
}

export function customLook(a: { look: string; icons: string; duo: boolean; motion: MotionPrefs }): boolean {
  return a.look !== 'app' || a.icons !== 'app' || !a.duo || !isDefaultMotion(a.motion)
}

/** Any approval setting a group's creator turns on in New group or Edit group. */
export function groupUsesApprovals(g: { requireApproval?: boolean; paymentApproval?: boolean; mergeNeedsOk?: boolean; approveJoins?: boolean }): boolean {
  return !!(g.requireApproval || g.paymentApproval || g.mergeNeedsOk || g.approveJoins)
}

/** The mode 'auto' stands for: Advanced as soon as one signal says the account uses it. */
export function autoMode(s: ModeSignals): Mode {
  return s.customLook || s.capture || s.approvals ? 'advanced' : 'simple'
}

export function effectiveMode(choice: ModeChoice, s: ModeSignals): Mode {
  return choice === 'auto' ? autoMode(s) : choice
}

/**
 * Whether 'auto' should be settled as Advanced and kept: once the account is known to use an
 * Advanced feature, it stays Advanced even if that use ends, so the screen never changes under
 * them. Simple isn't stored: 'auto' already means Simple, and a later signal may still move it.
 */
export function settleAuto(choice: ModeChoice, s: ModeSignals): Mode | null {
  return choice === 'auto' && autoMode(s) === 'advanced' ? 'advanced' : null
}

/**
 * Simple has its own detail level: When needed (one short line where it helps). Not Minimal: that
 * hides optional features Simple keeps (owner, 22 Oct 2026: Percent / Shares, Settle up's method and
 * note, History). The person's own pick (Settings → Preferences, Advanced only) is kept for Advanced.
 */
export function lookForMode<L extends string>(mode: Mode, look: L): L | 'needed' {
  return mode === 'simple' ? 'needed' : look
}

/**
 * Subtext follows its own level in Simple: Minimal, so only the lines that stop a mistake stay
 * (owner: "keep subtext only where the UI needs it"). Sections still follow lookForMode.
 */
export function hintLookForMode<L extends string>(mode: Mode, look: L): L | 'minimal' {
  return mode === 'simple' ? 'minimal' : look
}

/**
 * What Simple hides (docs/SIMPLE_MODE.md, owner's table of 22 Oct 2026). One list, so the doc and
 * the screens can't drift: every hidden control asks `showsFeature(mode, name)` (useFeature). The
 * settings behind them keep their values, and what they run keeps running.
 */
export const SIMPLE_HIDES = [
  'signingIn', // Profile → Signing in
  'morePayMethods', // Profile → How friends can pay you: everything past UPI ID, bank transfer and PayPal (international)
  'animations', // Settings → Animations
  'automation', // Settings → Automation and its entry points
  'aiFeatures', // Settings → AI features: the per-feature switches and icons (Use AI, free AI and your key stay)
  'approvals', // New group / Edit group approvals section
  'merge', // Members: Merge and its "Needs my OK"
  'wallets', // Personal wallets, everywhere
  'moneyReceived', // the expense form's Money received switch and the group menu item
  'whoseTurn', // the whose-turn chip
  'exportGroup', // group menu → Export CSV (Settings → Data keeps export)
  'waive', // Settle up → Waive the rest
  'capturePromo', // Inbox → set up auto-capture
  'fxRate', // editing the exchange rate (the converted amount still shows)
  'scanAiToggle', // Scan's per-card Read with AI toggle (the Settings choice applies)
] as const
export type SimpleHide = (typeof SIMPLE_HIDES)[number]

export const showsFeature = (mode: Mode, f: SimpleHide): boolean => mode === 'advanced' || !(SIMPLE_HIDES as readonly string[]).includes(f)
