import { type ComponentType, createContext, type ReactElement, type ReactNode, type SVGProps, useContext, useEffect, useId, useSyncExternalStore } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { effectiveIconStyle, type IconStyle, type IconVariant, iconVariant } from '@/lib/icon-style'
import { getIconStylePref, subscribeIconStylePref } from '@/lib/icon-style-pref'
import type { UiIconName } from '@/lib/ui-icons'

/*
 * The app's icons, one family per role, so each kind of picture looks the same wherever it is:
 *
 *   UI icons       Fluent UI System Icons, Regular / Filled (src/components/icons.tsx): the tab
 *                  bar, Profile and Settings rows, sheets, the Create sheet, group / expense /
 *                  settle actions. The owner's pick for its refined, even line; its Filled
 *                  drawings keep their inner details. Live table is Fluent's fork and knife,
 *                  Insights its ascending bar chart, Quick add its bot; Help's lifebuoy is ours
 *                  on the same grid (Fluent has none).
 *   Feature art    Solar line duotone / bold duotone (FeatureIcon below): Help cards and rows,
 *                  empty screens, notices. Larger, softer pictures painted in the accent's own
 *                  gradient (the + button's colours), so Help looks like the rest of the app.
 *   Controls       lucide (chevrons, close, check, spinners, the small glyphs inside a line of
 *                  text): punctuation, not pictures; they don't follow the style.
 *
 * The style (Outline / Filled, src/lib/icon-style.ts) comes from IconStyleProvider at the root:
 * every icon draws its line or its solid version from it, so a screen only says `solid` where an
 * icon differs from the rest (the current tab). Drawings are built by scripts/icon-art.mjs.
 */

/** The style to draw: this person's own choice (Settings → Preferences), else the admin's. */
export function useIconStyle(): IconStyle {
  const admin = useAppConfig().icons
  const mine = useSyncExternalStore(subscribeIconStylePref, getIconStylePref, getIconStylePref)
  return effectiveIconStyle(admin, mine)
}

const VariantContext = createContext<IconVariant>('line')

export function IconStyleProvider({ children }: { children: ReactNode }) {
  const style = useIconStyle()
  const variant = iconVariant(style)
  useEffect(() => {
    document.documentElement.setAttribute('data-icon-style', style)
  }, [style])
  // Fetch this style's Help / empty-screen pictures once the app is idle, so they are there
  // before anyone opens Help (a few kB; the other style's set is fetched only if picked).
  useEffect(() => {
    const go = () => void loadArt(variant).catch(() => {})
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(go, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(go, 2000)
    return () => clearTimeout(t)
  }, [variant])
  return <VariantContext.Provider value={variant}>{children}</VariantContext.Provider>
}

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'ref'> & {
  size?: number | string
  /** Draw the solid version whatever the style (the current tab), or the line one (false). */
  solid?: boolean
}
export type AppIcon = ComponentType<IconProps>

/**
 * A UI icon from its two drawings (scripts/icon-art.mjs writes the calls). Decorative unless
 * given an aria-label: the words beside an icon say what it is.
 */
export function makeIcon(name: string, line: ReactElement, solid: ReactElement): AppIcon {
  function Icon({ size = 24, solid: forceSolid, ...rest }: IconProps) {
    const styled = useContext(VariantContext)
    const variant: IconVariant = forceSolid === undefined ? styled : forceSolid ? 'solid' : 'line'
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden={rest['aria-label'] ? undefined : true}
        focusable="false"
        data-icon={name}
        data-variant={variant}
        {...rest}
      >
        {variant === 'solid' ? solid : line}
      </svg>
    )
  }
  Icon.displayName = `${name}Icon`
  return Icon
}

/* ---------------------------------------------------------------- feature art */

type Art = Record<UiIconName, ReactElement>
const loaders: Record<IconVariant, () => Promise<{ default: Art }>> = {
  line: () => import('./feature-art-line'),
  solid: () => import('./feature-art-bold'),
}
const loaded: Partial<Record<IconVariant, Art>> = {}
const pending: Partial<Record<IconVariant, Promise<void>>> = {}
const artListeners = new Set<() => void>()

function loadArt(v: IconVariant): Promise<void> {
  pending[v] ??= loaders[v]().then(
    (m) => {
      loaded[v] = m.default
      for (const fn of artListeners) fn()
    },
    (e) => {
      delete pending[v] // a failed fetch (offline) may be retried by the next icon
      throw e
    },
  )
  return pending[v]
}
const subscribeArt = (fn: () => void) => {
  artListeners.add(fn)
  return () => artListeners.delete(fn)
}

/**
 * A Help / empty-screen picture by name (src/lib/ui-icons.ts), in Solar duotone. `tone` 'brand'
 * (the default) paints it in the accent's gradient; 'current' takes the text colour, for a
 * picture on a coloured background. The drawings load on their own (a few kB per style); until
 * they arrive the icon keeps its space, so nothing jumps.
 */
export function FeatureIcon({
  name,
  size = 28,
  className = '',
  tone = 'brand',
}: {
  name: UiIconName
  size?: number
  className?: string
  tone?: 'brand' | 'current'
}) {
  const variant = useContext(VariantContext)
  const art = useSyncExternalStore(
    subscribeArt,
    () => loaded[variant],
    () => loaded[variant],
  )
  useEffect(() => {
    if (!art) loadArt(variant).catch(() => {})
  }, [art, variant])
  // A gradient per icon (ids must be unique on the page); useId's punctuation isn't valid in url(#…).
  const id = `art${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const brand = tone === 'brand'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={`${brand ? 'feature-art' : ''} ${className}`.trim()}
      style={brand ? ({ '--art': `url(#${id})` } as React.CSSProperties) : undefined}
      data-icon={name}
      data-variant={variant}
    >
      {brand && (
        <defs>
          <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--art-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--art-to)' }} />
          </linearGradient>
        </defs>
      )}
      {art?.[name]}
    </svg>
  )
}
