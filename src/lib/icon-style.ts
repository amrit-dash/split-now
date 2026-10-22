/*
 * The icon style: Outline (thin lines, the default) or Filled (solid shapes). An admin picks the
 * default for everyone in Admin → App; each person may pick their own in Settings → Preferences
 * (IconStyleChoice, effectiveIconStyle), and it follows the account like the theme
 * (appearance-sync.ts). The Phosphor icons read it through src/components/Icon.tsx.
 * Pure: no React, no storage.
 */

export const ICON_STYLES = ['outline', 'filled'] as const
export type IconStyle = (typeof ICON_STYLES)[number]

/** Outline keeps the app looking as it did until an admin chooses otherwise. */
export const DEFAULT_ICON_STYLE: IconStyle = 'outline'

export const ICON_STYLE_INFO: Record<IconStyle, { label: string; hint: string }> = {
  outline: { label: 'Outline', hint: 'Light, open line icons.' },
  filled: { label: 'Filled', hint: 'Solid icons that stand out more.' },
}

export const isIconStyle = (v: unknown): v is IconStyle => typeof v === 'string' && (ICON_STYLES as readonly string[]).includes(v)

/** Anything stored that isn't a known style reads as the default. */
export const resolveIconStyle = (v: unknown): IconStyle => (isIconStyle(v) ? v : DEFAULT_ICON_STYLE)

/** A person's own choice: a style, or 'app' to follow the admin's (the default). */
export type IconStyleChoice = IconStyle | 'app'
export const ICON_STYLE_CHOICES: readonly IconStyleChoice[] = ['app', ...ICON_STYLES]
export const isIconStyleChoice = (v: unknown): v is IconStyleChoice => v === 'app' || isIconStyle(v)
export const resolveIconStyleChoice = (v: unknown): IconStyleChoice => (isIconStyleChoice(v) ? v : 'app')

/** The style to draw: the person's own choice, else the admin's. */
export const effectiveIconStyle = (admin: IconStyle, mine: IconStyleChoice): IconStyle => (mine === 'app' ? admin : mine)

/** The Phosphor weights the app draws in. */
export type IconWeight = 'regular' | 'duotone' | 'fill'

/**
 * Where an icon sits, which sets how it follows the style:
 *   ui       row, button and sheet icons: line in Outline, solid in Filled
 *   feature  the big pictures on Help cards and empty screens: line with a soft tint of its
 *            colour inside in Outline (a thin line alone looks faint that large), solid in Filled
 *   active   the place you are (the current tab): always solid, so where you are shows by shape
 *            as well as colour in Outline
 */
export type IconRole = 'ui' | 'feature' | 'active'

export function iconWeight(style: IconStyle, role: IconRole = 'ui'): IconWeight {
  if (role === 'active' || style === 'filled') return 'fill'
  return role === 'feature' ? 'duotone' : 'regular'
}
