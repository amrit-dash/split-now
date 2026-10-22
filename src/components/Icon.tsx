import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from 'react'
import { IconContext } from '@phosphor-icons/react/dist/lib/context'
import { useAppConfig } from '@/hooks/useAppConfig'
import { effectiveIconStyle, type IconRole, type IconStyle, iconWeight } from '@/lib/icon-style'
import { getIconStylePref, subscribeIconStylePref } from '@/lib/icon-style-pref'
import type { PhIcon } from './icons'

/*
 * The icon style (Outline / Filled, src/lib/icon-style.ts) for the Phosphor icons. The provider
 * sits at the root and hands every Phosphor icon its weight through Phosphor's own context, so an
 * icon only passes `weight` when its role differs from a plain one (a feature picture, the
 * current tab). It also marks <html data-icon-style> for CSS and tests.
 *
 * Which icons are Phosphor: the tab bar, Profile, Settings, Help, the Create sheet and empty
 * screens (src/components/icons.ts). Small control glyphs (chevrons, close, check, spinners) are
 * lucide line icons everywhere and do not follow the style: they are punctuation, not pictures.
 */

/** The style to draw: this person's own choice (Settings → Preferences), else the admin's. */
export function useIconStyle(): IconStyle {
  const admin = useAppConfig().icons
  const mine = useSyncExternalStore(subscribeIconStylePref, getIconStylePref, getIconStylePref)
  return effectiveIconStyle(admin, mine)
}

/** The Phosphor weight for an icon in this role ('ui' by default; 'feature', 'active'). */
export function useIconWeight(role: IconRole = 'ui') {
  return iconWeight(useIconStyle(), role)
}

export function IconStyleProvider({ children }: { children: ReactNode }) {
  const style = useIconStyle()
  const value = useMemo(() => ({ weight: iconWeight(style) }), [style])
  useEffect(() => {
    document.documentElement.setAttribute('data-icon-style', style)
  }, [style])
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>
}

/**
 * A Phosphor icon drawn in the weight its `kind` gets from the style: 'feature' for the big
 * pictures (empty screens, notices), 'ui' otherwise. Decorative: the words beside it say what it
 * is. Pass the icon itself (from ./icons) so each screen's chunk carries only the icons it uses.
 */
export function StyledIcon({ icon: Glyph, kind = 'ui', size = 20, className }: { icon: PhIcon; kind?: IconRole; size?: number; className?: string }) {
  const weight = useIconWeight(kind)
  return <Glyph size={size} weight={weight} className={className} aria-hidden />
}
