import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Megaphone, X } from 'lucide-react'
import { repo } from './data'
import { useAuth } from './hooks/auth'
import { useToast } from './components/Toast'
import { Layout } from './components/Layout'
import { Loading } from './components/Misc'
import { UpdatePrompt } from './components/UpdatePrompt'
import { errText } from './lib/errors'
import {
  announcementActive,
  dismissAnnouncement,
  isAnnouncementDismissed,
  semverOf,
  updateRequired,
  writesOpen,
  type Announcement,
  type AppConfig,
  type BlockInfo,
} from './lib/flags'
import { takeStashedCapture } from './lib/pending'
import { refreshPush, setBadge, watchPrefs } from './lib/push'
import { setAiScan } from './lib/ai'
import { GroupDataProvider } from './hooks/groupData'
import { primeAiStatus, useAiStatus } from './hooks/useAiStatus'
import { useAppConfig, useBlocked } from './hooks/useAppConfig'
import { IDLE_PREFETCH, load, prefetch, routeKey } from './routes'
import Login from './pages/Login'
import Home from './pages/Home'
import Groups from './pages/Groups'

// Lazy screens share their import() thunks with the prefetchers (src/routes.ts).
const GroupForm = lazy(load.GroupForm)
const GroupDetail = lazy(load.GroupDetail)
const ExpenseForm = lazy(load.ExpenseForm)
const SplitBill = lazy(load.SplitBill)
const ExpenseDetail = lazy(load.ExpenseDetail)
const SettleUp = lazy(load.SettleUp)
const Scan = lazy(load.Scan)
const Friends = lazy(load.Friends)
const Insights = lazy(load.Insights)
const Profile = lazy(load.Profile)
const Join = lazy(load.Join)
const Capture = lazy(load.Capture)
const CaptureGuest = lazy(load.CaptureGuest)
const Inbox = lazy(load.Inbox)
const AutoCaptureSetup = lazy(load.AutoCaptureSetup)
const Share = lazy(load.Share)
const Settings = lazy(load.Settings)
const Admin = lazy(load.Admin)
const ImportGroup = lazy(load.ImportGroup)
const Table = lazy(load.Table)
const TableEntry = lazy(() => load.Table().then((m) => ({ default: m.TableEntry })))

/** A same-origin path only: no protocol-relative (//host) or backslash tricks in the stored return URL. */
const safePath = (p: string | null) => (p && /^\/(?![/\\])\S*$/.test(p) ? p : null)

export default function App() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  // The admin's switches (config/app): maintenance, minimum version, announcement, feature flags.
  // Admins (aiStatus().admin, cached per sign-in) are exempt from the maintenance and update
  // screens so a typo in the console can't lock them out of fixing it.
  const cfg = useAppConfig()
  const aiStatus = useAiStatus()
  const admin = !!aiStatus?.admin
  const signedIn = !!user && !user.isAnonymous
  const blocked = useBlocked(signedIn ? user.uid : null)
  const open = writesOpen(cfg, !!blocked, admin)

  // Saves resolve locally (so they work offline); a later server rejection lands here.
  useEffect(() => repo.onError((e) => toast(errText(e), 'err')), [toast])

  useEffect(() => {
    if (!user || user.isAnonymous) return
    // A capture link opened while signed out wins over the generic return path.
    const capture = takeStashedCapture()
    const back = safePath(sessionStorage.getItem('splitit-return'))
    sessionStorage.removeItem('splitit-return')
    if (capture?.startsWith('?')) nav(`/capture${capture}`, { replace: true })
    else if (back) nav(back, { replace: true })
  }, [user, nav])

  // public/push-sw.js talks to the open window: a notification tap asks for a screen (shown
  // in-app, no reload), and a push that arrives while the app is focused becomes a toast
  // instead of an OS notification (plus the badge count the server computed).
  useEffect(() => {
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (!sw) return
    const inApp = (url: unknown) => {
      if (typeof url !== 'string') return null
      const u = new URL(url, location.origin)
      return u.origin === location.origin ? u.pathname + u.search + u.hash : null
    }
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: unknown; url?: unknown; data?: { title?: unknown; body?: unknown; url?: unknown; badge?: unknown } } | null
      if (!d) return
      if (d.type === 'navigate') {
        const to = inApp(d.url)
        if (to) nav(to)
      } else if (d.type === 'push' && d.data) {
        const { title, body, badge } = d.data
        const to = inApp(d.data.url)
        const text = [title, body].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' · ')
        if (text) toast(text, 'ok', to ? { action: { label: 'Open', run: () => nav(to) } } : undefined)
        if (typeof badge === 'number' || typeof badge === 'string') setBadge(Number(badge))
      }
    }
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [nav, toast])

  // Keep this browser's push registration fresh (FCM tokens rotate); no-op without permission.
  // Not while writes are frozen (maintenance, blocked): the rules would refuse the write.
  useEffect(() => {
    if (user && !user.isAnonymous && repo.mode === 'firebase' && open) void refreshPush(user.uid)
  }, [user, open])

  // Mirror the account's "read bills with AI" choice onto this device (read synchronously when scanning).
  useEffect(
    () => (user && !user.isAnonymous && repo.mode === 'firebase' ? watchPrefs(user.uid, (p) => setAiScan(p.aiEnabled && p.aiImages)) : undefined),
    [user],
  )

  // AI status (admin flag, shared key) once per sign-in, so Profile doesn't wait for it.
  useEffect(() => primeAiStatus(user && !user.isAnonymous && repo.mode === 'firebase' ? user.uid : null), [user])

  // Pull anything iOS Shortcuts dropped into captureInbox while the app was closed.
  useEffect(() => {
    if (!user || user.isAnonymous || !open) return
    const claim = () => {
      if (document.visibilityState === 'visible') repo.claimInbox(user.uid).catch((e) => console.warn('Inbox sync failed', e))
    }
    claim()
    document.addEventListener('visibilitychange', claim)
    return () => document.removeEventListener('visibilitychange', claim)
  }, [user, open])

  // Feature flags with a signed-out surface: a switched-off feature isn't reachable by URL either.
  const liveTables = cfg.flags.liveTables !== false
  const guestCapture = !loading && !user && loc.pathname === '/capture' && cfg.flags.autoCapture !== false
  // Live table links work without an account (anonymous sign-in); anonymous users see nothing else.
  const tablePath = loc.pathname === '/t' || loc.pathname.startsWith('/t/')
  const guestTable = !loading && (!user || !!user.isAnonymous) && tablePath
  // Remember where they were going (e.g. an invite link) and come back after sign-in.
  if (!loading && !user && !guestCapture && !tablePath && loc.pathname !== '/') {
    const here = safePath(loc.pathname + loc.search)
    if (here) sessionStorage.setItem('splitit-return', here)
  }

  // UpdatePrompt is mounted exactly once, outside the auth switch, so the service worker is
  // registered (and its hourly update timer started) a single time.
  return (
    <>
      <UpdatePrompt />
      {loading ? (
        <Splash />
      ) : guestCapture ? (
        <Suspense fallback={<Splash />}>
          <CaptureGuest />
        </Suspense>
      ) : guestTable ? (
        liveTables ? (
          <Suspense fallback={<Splash />}>
            <TableRoutes />
          </Suspense>
        ) : (
          <GateScreen title="Live tables are off for now" message="The host can still add the bill in the app and settle up from there.">
            <a href="/" className="btn-primary">
              Open Split Now
            </a>
          </GateScreen>
        )
      ) : !user || user.isAnonymous ? (
        <Login />
      ) : blocked === undefined || (cfg.maintenance && !admin && aiStatus === undefined) ? (
        // The block check and (in maintenance) the admin check decide which screen this is; a
        // moment of splash beats flashing the wrong one.
        <Splash />
      ) : blocked ? (
        <BlockedScreen info={blocked} />
      ) : cfg.maintenance && !admin ? (
        <MaintenanceScreen message={cfg.maintenanceMessage} />
      ) : updateRequired(cfg, __APP_VERSION__) && !admin ? (
        <UpdateRequiredScreen minVersion={cfg.minVersion} />
      ) : (
        <AppRoutes cfg={cfg} admin={admin} />
      )}
    </>
  )
}

function AppRoutes({ cfg, admin }: { cfg: AppConfig; admin: boolean }) {
  usePrefetch()
  const liveTables = cfg.flags.liveTables !== false
  const autoCapture = cfg.flags.autoCapture !== false
  // Layout has its own Suspense around the Outlet (the tab bar stays while a screen loads);
  // this one covers the full-screen routes below.
  return (
    <GroupDataProvider>
      <AnnouncementBanner cfg={cfg} admin={admin} />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/new" element={<GroupForm />} />
            <Route path="groups/import" element={<ImportGroup />} />
            <Route path="groups/:groupId" element={<GroupDetail />} />
            <Route path="groups/:groupId/edit" element={<GroupForm />} />
            <Route path="groups/:groupId/settle" element={<SettleUp />} />
            <Route path="groups/:groupId/expenses/:expenseId" element={<ExpenseDetail />} />
            <Route path="friends" element={<Friends />} />
            <Route path="insights" element={<Insights />} />
            <Route path="profile" element={<Profile />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="settings/auto-capture" element={autoCapture ? <AutoCaptureSetup /> : <Navigate to="/settings" replace />} />
            <Route path="settings/*" element={<Settings />} />
            <Route path="admin/*" element={<Admin />} />
          </Route>
          <Route path="add" element={<ExpenseForm />} />
          <Route path="groups/:groupId/expenses/:expenseId/edit" element={<ExpenseForm />} />
          <Route path="split" element={liveTables ? <SplitBill /> : <Navigate to="/" replace />} />
          <Route path="scan" element={<Scan />} />
          <Route path="capture" element={autoCapture ? <Capture /> : <Navigate to="/inbox" replace />} />
          <Route path="capture/:captureId" element={autoCapture ? <Capture /> : <Navigate to="/inbox" replace />} />
          <Route path="share" element={<Share />} />
          <Route path="join/:code" element={<Join />} />
          <Route path="t" element={liveTables ? <TableEntry /> : <Navigate to="/" replace />} />
          <Route path="t/:code" element={liveTables ? <Table /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </GroupDataProvider>
  )
}

/**
 * The admin's announcement (config/app.announcement), at the top of every screen until dismissed
 * on this device (a changed text comes back). Admins also see here when maintenance mode or an
 * update requirement is on, since they are the only ones who don't get those screens.
 */
function AnnouncementBanner({ cfg, admin }: { cfg: AppConfig; admin: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const a: Announcement | null = announcementActive(cfg.announcement) ? cfg.announcement : null
  const show = a && !isAnnouncementDismissed(a) && dismissed !== a.text
  const adminNote = admin
    ? cfg.maintenance
      ? 'Maintenance mode is on: only admins can use the app right now.'
      : updateRequired(cfg, __APP_VERSION__)
        ? `Update required is on for builds below ${cfg.minVersion}; you are on ${semverOf(__APP_VERSION__)}.`
        : null
    : null
  if (!show && !adminNote) return null
  return (
    <div className="mx-auto max-w-2xl space-y-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]" data-testid="announcement">
      {adminNote && (
        <div
          className="flex items-center gap-2 rounded-2xl bg-amber-100 px-3.5 py-2.5 text-sm font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          role="status"
        >
          <span className="min-w-0 flex-1">{adminNote}</span>
          <a href="/admin/flags" className="shrink-0 font-bold underline">
            Admin
          </a>
        </div>
      )}
      {show && (
        <div
          className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm ${
            a.level === 'warn'
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
              : 'bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100'
          }`}
          role="status"
        >
          <Megaphone size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 py-0.5">{a.text}</span>
          <button
            type="button"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            aria-label="Dismiss announcement"
            onClick={() => {
              dismissAnnouncement(a)
              setDismissed(a.text)
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

/** A full-screen notice on the splash gradient: title, a sentence, and whatever action fits. */
function GateScreen({ title, message, children, testId }: { title: string; message?: string; children?: React.ReactNode; testId?: string }) {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-brand-700 to-duo-700 px-6 text-center text-white"
      data-testid={testId}
    >
      <img src="/favicon.svg" alt="" className="mb-6 h-16 w-16 drop-shadow-[0_20px_30px_rgb(0_0_0/0.35)]" />
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {message && <p className="mt-2 max-w-sm text-white/85">{message}</p>}
      {children && <div className="mt-6 flex flex-col items-center gap-3">{children}</div>}
    </main>
  )
}

function MaintenanceScreen({ message }: { message: string }) {
  return (
    <GateScreen
      title="Back in a few minutes"
      message={message || 'Split Now is being looked after. Your groups and expenses are safe; nothing can be changed until it is done.'}
      testId="maintenance-screen"
    >
      <button type="button" className="btn bg-white text-slate-900" onClick={() => location.reload()}>
        Try again
      </button>
      <button type="button" className="min-h-11 text-sm text-white/80 underline" onClick={() => void repo.signOut()}>
        Sign out
      </button>
    </GateScreen>
  )
}

function UpdateRequiredScreen({ minVersion }: { minVersion: string }) {
  const [busy, setBusy] = useState(false)
  const update = async () => {
    setBusy(true)
    let reloaded = false
    const reload = () => {
      if (!reloaded) {
        reloaded = true
        location.reload()
      }
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update().catch(() => {})
      navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true })
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      else reload()
    } catch {
      reload()
    }
    setTimeout(reload, 3000)
  }
  return (
    <GateScreen
      title="Update Split Now"
      message={`This copy (${semverOf(__APP_VERSION__)}) is older than the app now needs (${minVersion}). Reload once to get the latest.`}
      testId="update-required-screen"
    >
      <button type="button" className="btn bg-white text-slate-900" onClick={update} disabled={busy}>
        {busy ? 'Updating…' : 'Reload and update'}
      </button>
    </GateScreen>
  )
}

function BlockedScreen({ info }: { info: BlockInfo }) {
  return (
    <GateScreen
      title="This account is paused"
      message={info.reason ? `An admin paused it: ${info.reason}` : 'An admin paused it. Nothing can be added or changed from it.'}
      testId="blocked-screen"
    >
      <button type="button" className="btn bg-white text-slate-900" onClick={() => void repo.signOut()}>
        Sign out
      </button>
    </GateScreen>
  )
}

/**
 * Lazy chunks before they are asked for: the usual next screens on idle after the first
 * signed-in paint, and any in-app link's screen on pointerdown (which lands ~100 ms before the
 * click React Router acts on). React Router runs navigations as transitions, so a chunk that is
 * still downloading shows as a frozen tap; this is what keeps that rare.
 */
function usePrefetch() {
  useEffect(() => {
    // Data Saver: a tap still prefetches (the user asked for that screen); idle time does not.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    let cancelIdle = () => {}
    if (!saveData) {
      const idle = () => {
        for (const k of IDLE_PREFETCH) prefetch(k)
      }
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(idle, { timeout: 4000 })
        cancelIdle = () => window.cancelIdleCallback(id)
      } else {
        const id = window.setTimeout(idle, 2000)
        cancelIdle = () => window.clearTimeout(id)
      }
    }
    const onPointerDown = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== location.origin) return
      prefetch(routeKey(a.pathname))
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    return () => {
      cancelIdle()
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
}

function TableRoutes() {
  return (
    <Routes>
      <Route path="t" element={<TableEntry />} />
      <Route path="t/:code" element={<Table />} />
    </Routes>
  )
}

/** The sign-in wait: the same gradient and mark as the HTML splash (index.html, #root:empty), so the hand-over is invisible. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-700 to-duo-700">
      <img src="/favicon.svg" alt="Split Now" className="h-20 w-20 drop-shadow-[0_20px_30px_rgb(0_0_0/0.35)]" />
    </div>
  )
}
