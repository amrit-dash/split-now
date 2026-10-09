/*
 * config/app: the switches an admin flips in the console (/admin → Flags & app). The document
 * holds no secrets and is readable signed out, so the app watches it once per session and keeps
 * the last copy in localStorage for the first paint.
 *   maintenance, maintenanceMessage  everyone but admins sees a "back in a few minutes" screen;
 *                                    the rules refuse their writes meanwhile (writesOpen)
 *   minVersion                       an app whose version (the semver part of __APP_VERSION__) is
 *                                    older must reload before it can be used
 *   announcement                     a dismissable banner { text, level, until? }
 *   flags                            feature switches; a missing document or key means ON, so
 *                                    nothing regresses when the document doesn't exist yet
 *   signups                          'invite' hides "Create an account" on the sign-in screen unless
 *                                    the link carries an invite code (soft: see docs/FIREBASE_SETUP.md)
 * Pure helpers first; the live store at the bottom loads the Firebase SDK only in firebase mode
 * and never imports '@/data' (the hook passes the mode in).
 */

export const FLAG_NAMES = [
  'aiImages',
  'aiSms',
  'liveTables',
  'autoCapture',
  'quickAdd',
  'nudges',
  'statementImport',
  'payLinks',
  'duplicates',
  'merchantMemory',
  'whoseTurn',
  'budgetAlerts',
] as const
export type FlagName = (typeof FLAG_NAMES)[number]

/** What each switch turns off, in the words the admin console shows. */
export const FLAG_INFO: Record<FlagName, { label: string; hint: string }> = {
  aiImages: {
    label: 'Read bills and statements with AI',
    hint: 'Scan and Statement import stop asking Gemini; the phone reads bills instead. Server-enforced.',
  },
  aiSms: { label: 'Read bank SMS with AI', hint: 'The capture webhook stops sending unreadable messages to Gemini. Server-enforced.' },
  liveTables: { label: 'Live tables', hint: 'The QR shared bill (/split, /t/CODE). Off hides the routes for everyone, guests included.' },
  autoCapture: { label: 'Auto-capture', hint: 'Bank SMS forwarding. Off makes the webhook answer "paused" and hides the setup wizard.' },
  statementImport: { label: 'Statement import', hint: 'Payment-app screenshots → transactions.' },
  quickAdd: { label: 'Quick add', hint: 'The natural-language / voice line in the Create sheet (the + button).' },
  nudges: { label: 'Nudges', hint: 'The "Nudge" push next to Remind.' },
  payLinks: {
    label: 'Pay me links and cards',
    hint: 'Off stops new links: Remind shares the members-only Settle up link, finished tables make no guest links, and the /r/ pay page and “I’ve paid” are hidden. A claim on a link that already exists is still recorded, and payees can still confirm one.',
  },
  duplicates: { label: 'Duplicate warning', hint: 'The "looks like a duplicate" card in the expense form.' },
  merchantMemory: { label: 'Merchant memory', hint: 'Remembering the category you pick for a merchant.' },
  whoseTurn: { label: 'Whose turn', hint: 'The "Rahul’s turn to pay?" chip.' },
  budgetAlerts: { label: 'Budget alerts', hint: 'Pushes at 80% and 100% of a group budget.' },
}

export type AnnouncementLevel = 'info' | 'warn'
export interface Announcement {
  text: string
  level: AnnouncementLevel
  /** epoch ms after which the banner stops showing */
  until?: number
}
export type Signups = 'open' | 'invite'

export interface AppConfig {
  maintenance: boolean
  maintenanceMessage: string
  minVersion: string
  announcement: Announcement | null
  flags: Record<FlagName, boolean>
  signups: Signups
  /** The version shown in Profile (admins set it; the build's own version when missing). */
  version?: string
  updatedAt?: number
  updatedBy?: string
}

export const ALL_ON = Object.fromEntries(FLAG_NAMES.map((f) => [f, true])) as Record<FlagName, boolean>

export const DEFAULT_APP_CONFIG: AppConfig = {
  maintenance: false,
  maintenanceMessage: '',
  minVersion: '0.0.0',
  announcement: null,
  flags: ALL_ON,
  signups: 'open',
}

export const MAX_MESSAGE = 300
const SEMVER = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/
/** What an admin may type as the displayed version: 2.1.1, 2.1, 2.1.1-beta.1 (mirrors firestore.rules). */
export const DISPLAY_VERSION = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]{1,20})?$/

/** The stored document → a complete config; anything missing or mistyped falls back to the default (everything on). */
export function resolveAppConfig(raw: unknown): AppConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const f = (r.flags && typeof r.flags === 'object' ? r.flags : {}) as Record<string, unknown>
  const flags = { ...ALL_ON }
  for (const k of FLAG_NAMES) if (f[k] === false) flags[k] = false
  const a = r.announcement as Record<string, unknown> | null | undefined
  const announcement: Announcement | null =
    a && typeof a === 'object' && typeof a.text === 'string' && a.text.trim()
      ? {
          text: a.text.trim().slice(0, MAX_MESSAGE),
          level: a.level === 'warn' ? 'warn' : 'info',
          ...(typeof a.until === 'number' && Number.isFinite(a.until) ? { until: a.until } : {}),
        }
      : null
  return {
    maintenance: r.maintenance === true,
    maintenanceMessage: typeof r.maintenanceMessage === 'string' ? r.maintenanceMessage.slice(0, MAX_MESSAGE) : '',
    minVersion: typeof r.minVersion === 'string' && SEMVER.test(r.minVersion) ? r.minVersion : '0.0.0',
    announcement,
    flags,
    signups: r.signups === 'invite' ? 'invite' : 'open',
    ...(typeof r.version === 'string' && DISPLAY_VERSION.test(r.version) ? { version: r.version } : {}),
    ...(typeof r.updatedAt === 'number' ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === 'string' ? { updatedBy: r.updatedBy } : {}),
  }
}

/** What to write back: the resolved shape, with the audit fields. Flags that are on are written too, so the console shows the truth. */
export function toAppConfigDoc(cfg: AppConfig, by: string, now = Date.now()): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    maintenance: cfg.maintenance,
    minVersion: SEMVER.test(cfg.minVersion) ? cfg.minVersion : '0.0.0',
    announcement: cfg.announcement?.text.trim() ? { ...cfg.announcement, text: cfg.announcement.text.trim().slice(0, MAX_MESSAGE) } : null,
    flags: { ...cfg.flags },
    signups: cfg.signups,
    updatedAt: now,
    updatedBy: by,
  }
  // The displayed version is edited separately (Profile → Admin); a flags save must not drop it.
  if (cfg.version && DISPLAY_VERSION.test(cfg.version)) doc.version = cfg.version
  if (cfg.maintenanceMessage.trim()) doc.maintenanceMessage = cfg.maintenanceMessage.trim().slice(0, MAX_MESSAGE)
  if (doc.announcement && (doc.announcement as Announcement).until === undefined) delete (doc.announcement as Announcement).until
  return doc
}

export const isSemver = (v: string) => SEMVER.test(v)

/** '0.1.0+2d165f0' → '0.1.0'; anything that isn't a version ('dev') counts as 0.0.0. */
export function semverOf(version: string): string {
  const m = /^\s*v?(\d{1,5}\.\d{1,5}\.\d{1,5})/.exec(version)
  return m ? m[1] : '0.0.0'
}

/** -1, 0 or 1 like a comparator; both inputs may carry a build suffix. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = semverOf(a).split('.').map(Number)
  const pb = semverOf(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** Is this build older than the admin's minimum? (`version` is __APP_VERSION__.) */
export function updateRequired(cfg: Pick<AppConfig, 'minVersion'>, version: string): boolean {
  return compareSemver(version, cfg.minVersion) < 0
}

export function announcementActive(a: Announcement | null | undefined, now = Date.now()): a is Announcement {
  return !!a && !!a.text && (a.until === undefined || a.until > now)
}

/** Identifies one announcement for the per-device dismiss: a new text (or deadline) comes back. */
export function announcementKey(a: Announcement): string {
  let h = 0
  const s = `${a.level}|${a.until ?? ''}|${a.text}`
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const DISMISS_KEY = 'splitnow-announcement-dismissed'
export function isAnnouncementDismissed(a: Announcement): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === announcementKey(a)
  } catch {
    return false
  }
}
export function dismissAnnouncement(a: Announcement): void {
  try {
    localStorage.setItem(DISMISS_KEY, announcementKey(a))
  } catch {
    /* private mode */
  }
}

/** Invite-only sign-ups: the sign-in screen offers "Create an account" only with an invite link (/join/CODE). */
export function signupsOpen(cfg: Pick<AppConfig, 'signups'> & Partial<Pick<AppConfig, 'maintenance'>>, pathname: string): boolean {
  // Maintenance refuses every non-admin write, so a new account couldn't even save its profile.
  if (cfg.maintenance) return false
  return cfg.signups !== 'invite' || /^\/join\/[A-Za-z0-9]+/.test(pathname)
}

/** Why "Create an account" is hidden on the sign-in screen (when signupsOpen is false). */
export function signupsClosedText(cfg: Partial<Pick<AppConfig, 'maintenance'>>): string {
  return cfg.maintenance
    ? 'Split Now is down for a few minutes of maintenance. New accounts open again shortly; existing accounts can sign in.'
    : 'Split Now is invite only right now. Ask a friend for their group link to join.'
}

/** Mirrors the rules' writesOpen(): admins always may; others not in maintenance and not blocked. */
export function writesOpen(cfg: Pick<AppConfig, 'maintenance'>, blocked: boolean, admin: boolean): boolean {
  return admin || (!cfg.maintenance && !blocked)
}

/** The maintenance screen's sentence when the admin left the message empty. */
export const MAINTENANCE_FALLBACK = 'We’re making Split Now better. Your data is safe.'

/** What the maintenance screen (and its preview in the console) says: the admin's message, or the fallback. */
export function maintenanceText(message: string | undefined): string {
  return message?.trim() || MAINTENANCE_FALLBACK
}

/**
 * The one-line strip admins see at the top of the app while a gate is on that everyone else is
 * stopped by (admins never get those screens, so this is how they notice it). Maintenance comes
 * first: it is the one that locks people out right now, and the strip offers to turn it off.
 */
export function adminGateNote(
  cfg: Pick<AppConfig, 'maintenance' | 'minVersion'>,
  version: string,
  admin: boolean,
): { kind: 'maintenance' | 'update'; text: string } | null {
  if (!admin) return null
  if (cfg.maintenance) return { kind: 'maintenance', text: 'Maintenance mode is on · only admins can use the app' }
  if (updateRequired(cfg, version))
    return { kind: 'update', text: `Update required is on for builds below ${cfg.minVersion} · you are on ${semverOf(version)}` }
  return null
}

/** blocked/{uid}, written by the adminBlockUser callable. */
export interface BlockInfo {
  reason: string
  at: number
  by: string
}

export function resolveBlockInfo(raw: unknown): BlockInfo | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!r) return null
  return { reason: typeof r.reason === 'string' ? r.reason : '', at: typeof r.at === 'number' ? r.at : 0, by: typeof r.by === 'string' ? r.by : '' }
}

// ---- Live store ----------------------------------------------------------------------------

type Unsub = () => void
const CACHE_KEY = 'splitnow-app-config'

function readCache(): AppConfig | null {
  try {
    const s = localStorage.getItem(CACHE_KEY)
    return s ? resolveAppConfig(JSON.parse(s)) : null
  } catch {
    return null
  }
}

let current: AppConfig = readCache() ?? DEFAULT_APP_CONFIG
let started: 'firebase' | 'demo' | null = null
let stop: Unsub | null = null
const subs = new Set<() => void>()

function set(next: AppConfig) {
  current = next
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next))
  } catch {
    /* private mode */
  }
  for (const f of subs) f()
}

async function sdk() {
  const [{ getApp }, f] = await Promise.all([import('firebase/app'), import('firebase/firestore')])
  return { f, db: f.getFirestore(getApp()) }
}

/**
 * Start watching config/app (once; later calls are no-ops). Demo mode keeps the defaults (or
 * whatever a previous firebase session cached, which is how the gates can be tried locally).
 */
export function startAppConfig(mode: 'firebase' | 'demo'): void {
  if (started) return
  started = mode
  if (mode !== 'firebase') return
  let cancelled = false
  void sdk()
    .then(({ f, db }) => {
      if (cancelled) return
      stop = f.onSnapshot(
        f.doc(db, 'config', 'app'),
        (s) => {
          // A cached "missing" snapshot says nothing; wait for the server before dropping what we knew.
          if (!s.exists() && s.metadata.fromCache) return
          set(resolveAppConfig(s.data()))
        },
        (e) => console.warn('config/app unavailable', e),
      )
    })
    .catch((e) => console.warn('config/app unavailable', e))
  stop = () => {
    cancelled = true
  }
}

export function subscribeAppConfig(fn: () => void): Unsub {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export const getAppConfig = (): AppConfig => current

/** Tests: forget everything. */
export function resetAppConfig(): void {
  stop?.()
  stop = null
  started = null
  current = DEFAULT_APP_CONFIG
  subs.clear()
}

/** blocked/{uid}: null when not blocked (or unreadable); the entry when the account is blocked. */
export function watchBlocked(uid: string, cb: (b: BlockInfo | null) => void): Unsub {
  let unsub: Unsub | null = null
  let cancelled = false
  void sdk()
    .then(({ f, db }) => {
      if (cancelled) return
      unsub = f.onSnapshot(
        f.doc(db, 'blocked', uid),
        (s) => cb(s.exists() ? resolveBlockInfo(s.data()) : null),
        () => cb(null),
      )
    })
    .catch(() => cb(null))
  return () => {
    cancelled = true
    unsub?.()
  }
}
