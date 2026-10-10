/*
 * The lazily loaded screens, in one place so App.tsx's lazy() and the prefetchers share the
 * same import() thunks (Vite resolves them to one chunk and one request). Login, Home, Groups
 * and Layout stay in the entry chunk.
 */
export const load = {
  GroupForm: () => import('./pages/GroupForm'),
  GroupDetail: () => import('./pages/GroupDetail'),
  GroupMembers: () => import('./pages/GroupMembers'),
  ExpenseForm: () => import('./pages/ExpenseForm'),
  SplitBill: () => import('./pages/SplitBill'),
  ExpenseDetail: () => import('./pages/ExpenseDetail'),
  SettleUp: () => import('./pages/SettleUp'),
  Scan: () => import('./pages/Scan'),
  SettleAll: () => import('./pages/SettleAll'),
  Insights: () => import('./pages/Insights'),
  Profile: () => import('./pages/Profile'),
  Join: () => import('./pages/Join'),
  Capture: () => import('./pages/Capture'),
  CaptureGuest: () => import('./pages/CaptureGuest'),
  Inbox: () => import('./pages/Inbox'),
  AutoCaptureSetup: () => import('./pages/AutoCaptureSetup'),
  Share: () => import('./pages/Share'),
  Settings: () => import('./pages/Settings'),
  // Settings' own screens (src/pages/Settings.tsx lazy-loads these), so they can be prefetched too.
  SettingsPreferences: () => import('./pages/settings/Preferences'),
  SettingsNotifications: () => import('./pages/settings/Notifications'),
  SettingsAutomation: () => import('./pages/settings/Automation'),
  SettingsAi: () => import('./pages/settings/Ai'),
  SettingsData: () => import('./pages/settings/Data'),
  SettingsAnimations: () => import('./pages/settings/Animations'),
  Admin: () => import('./pages/Admin'),
  ImportGroup: () => import('./pages/ImportGroup'),
  Table: () => import('./pages/Table'),
  PayLink: () => import('./pages/PayLink'),
}
export type RouteKey = keyof typeof load

/** Which lazy screen a path renders; undefined for eager screens and unknown paths. Mirrors the routes in App.tsx. */
export function routeKey(pathname: string): RouteKey | undefined {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/add' || /^\/groups\/[^/]+\/expenses\/[^/]+\/edit$/.test(p)) return 'ExpenseForm'
  if (p === '/groups/new' || /^\/groups\/[^/]+\/edit$/.test(p)) return 'GroupForm'
  if (p === '/groups/import') return 'ImportGroup'
  if (/^\/groups\/[^/]+\/settle$/.test(p)) return 'SettleUp'
  if (/^\/groups\/[^/]+\/members$/.test(p)) return 'GroupMembers'
  if (/^\/groups\/[^/]+\/expenses\/[^/]+$/.test(p)) return 'ExpenseDetail'
  if (/^\/groups\/[^/]+$/.test(p)) return 'GroupDetail'
  if (p === '/settle' || p === '/friends') return 'SettleAll'
  if (p.startsWith('/settle/with/')) return 'SettleUp'
  if (p === '/insights') return 'Insights'
  if (p === '/profile') return 'Profile'
  if (p === '/inbox') return 'Inbox'
  if (p === '/scan') return 'Scan'
  if (p === '/split') return 'SplitBill'
  if (p === '/share') return 'Share'
  if (p === '/capture' || p.startsWith('/capture/')) return 'Capture'
  if (p.startsWith('/join/')) return 'Join'
  if (p === '/t' || p.startsWith('/t/')) return 'Table'
  if (p.startsWith('/r/')) return 'PayLink'
  if (p === '/settings/auto-capture') return 'AutoCaptureSetup'
  if (p === '/settings' || p.startsWith('/settings/')) return 'Settings'
  if (p === '/admin' || p.startsWith('/admin/')) return 'Admin'
  return undefined
}

const started = new Set<RouteKey>()

/** Start downloading a screen's chunk; a no-op once started. A failure is forgotten so the real navigation retries. */
export function prefetch(key: RouteKey | undefined): void {
  if (!key || started.has(key)) return
  started.add(key)
  load[key]().catch(() => started.delete(key))
}

/**
 * The screens a session almost always opens next; fetched on idle after the first signed-in paint.
 * Settings is small (about 3 kB gzip) and opened straight from Profile, often before Profile's own
 * idle prefetch (prefetchAfter) has run; its areas wait for that.
 */
export const IDLE_PREFETCH: readonly RouteKey[] = ['GroupDetail', 'ExpenseForm', 'Insights', 'Profile', 'Settings']

/** /settings/<area> → the chunk of that settings screen (the Settings chunk only holds the list). */
const SETTINGS_AREAS: Readonly<Record<string, RouteKey>> = {
  preferences: 'SettingsPreferences',
  notifications: 'SettingsNotifications',
  automation: 'SettingsAutomation',
  ai: 'SettingsAi',
  data: 'SettingsData',
  animations: 'SettingsAnimations',
}
const SETTINGS_SCREENS: readonly RouteKey[] = Object.values(SETTINGS_AREAS)

/** Every chunk a path needs before it can render: its screen and, under /settings/, the area inside it. */
export function routeChunks(pathname: string): RouteKey[] {
  const key = routeKey(pathname)
  if (!key) return []
  if (key !== 'Settings') return [key]
  const name = pathname.replace(/\/+$/, '').split('/')[2] ?? ''
  // Own keys only: "/settings/constructor" must not find Object.prototype.constructor.
  return Object.hasOwn(SETTINGS_AREAS, name) ? [key, SETTINGS_AREAS[name]] : [key]
}

/**
 * Screens worth fetching on idle once this one is showing, because it is the only way to them:
 * Profile leads to Settings, and Settings to its areas. Without this each first visit waits for
 * its own chunk (a round trip each, about 0.6 s on a slow phone network), which is most of why
 * Settings felt slow the first time round. All of it is about 20 kB gzip.
 */
const NEXT: Partial<Record<RouteKey, readonly RouteKey[]>> = {
  Profile: ['Settings', ...SETTINGS_SCREENS],
  Settings: SETTINGS_SCREENS,
}
export function prefetchAfter(pathname: string): readonly RouteKey[] {
  const key = routeKey(pathname)
  return (key && NEXT[key]) || []
}
