import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTrackNav } from '@/hooks/useBack'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Megaphone, RefreshCw, Wrench, X } from 'lucide-react'
import { repo } from './data'
import { useAuth } from './hooks/auth'
import { useToast } from './components/Toast'
import { useConfirm } from './components/ConfirmSheet'
import { BlockedScreen, GateScreen, MaintenanceScreen, UpdateRequiredScreen } from './components/GateScreen'
import { Marquee } from './components/Marquee'
import { Layout } from './components/Layout'
import { Loading } from './components/Misc'
import { UpdatePrompt } from './components/UpdatePrompt'
import { errText } from './lib/errors'
import {
  adminGateNote,
  announcementActive,
  dismissAnnouncement,
  isAnnouncementDismissed,
  semverOf,
  toAppConfigDoc,
  updateRequired,
  writesOpen,
  type Announcement,
  type AppConfig,
} from './lib/flags'
import { takeStashedCapture } from './lib/pending'
import { isStandalone, refreshPush, setBadge, watchPrefs } from './lib/push'
import { splashHoldMs } from './lib/splash'
import { setAiScan } from './lib/ai'
import { GroupDataProvider } from './hooks/groupData'
import { primeAiStatus, useAiStatus } from './hooks/useAiStatus'
import { useAppConfig, useBlocked } from './hooks/useAppConfig'
import { IDLE_PREFETCH, load, prefetch, prefetchAfter, routeChunks } from './routes'
import Login from './pages/Login'
import Home from './pages/Home'
import Groups from './pages/Groups'

// Lazy screens share their import() thunks with the prefetchers (src/routes.ts).
const GroupForm = lazy(load.GroupForm)
const GroupDetail = lazy(load.GroupDetail)
const GroupMembers = lazy(load.GroupMembers)
const ExpenseForm = lazy(load.ExpenseForm)
const SplitBill = lazy(load.SplitBill)
const ExpenseDetail = lazy(load.ExpenseDetail)
const SettleUp = lazy(load.SettleUp)
const SettleAll = lazy(load.SettleAll)
const SettleWithPerson = lazy(() => load.SettleUp().then((m) => ({ default: m.SettleWithPerson })))
const Scan = lazy(load.Scan)
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
const PayLink = lazy(load.PayLink)

/** A same-origin path only: no protocol-relative (//host) or backslash tricks in the stored return URL. */
const safePath = (p: string | null) => (p && /^\/(?![/\\])\S*$/.test(p) ? p : null)

export default function App() {
  const { user, loading } = useAuth()
  // On an installed-app launch the splash stays over the app (which loads underneath) until its
  // animation has played, then fades away.
  const hold = useSplashHold()
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
  // Pay me links too: the person paying needs no account (src/pages/PayLink.tsx). The payLinks
  // flag off hides this guest page (links already made still record; lib/paylinks payLinkFeatures).
  const payLinks = cfg.flags.payLinks !== false
  const payPath = loc.pathname.startsWith('/r/')
  const guestPay = !loading && (!user || !!user.isAnonymous) && payPath
  // Remember where they were going (e.g. an invite link) and come back after sign-in.
  if (!loading && !user && !guestCapture && !tablePath && !payPath && loc.pathname !== '/') {
    const here = safePath(loc.pathname + loc.search)
    if (here) sessionStorage.setItem('splitit-return', here)
  }

  // UpdatePrompt is mounted exactly once, outside the auth switch, so the service worker is
  // registered (and its hourly update timer started) a single time.
  return (
    <>
      <UpdatePrompt />
      {hold !== 'off' && <Splash leaving={hold === 'leaving'} />}
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
            <a href="/" className="btn bg-white text-slate-900 shadow-lg shadow-black/15">
              Open Split Now
            </a>
          </GateScreen>
        )
      ) : guestPay ? (
        payLinks ? (
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="r/:code" element={<PayLink />} />
            </Routes>
          </Suspense>
        ) : (
          <GateScreen title="Pay me links are off for now" message="Ask the person you owe for their UPI ID, or settle up in the app.">
            <a href="/" className="btn bg-white text-slate-900 shadow-lg shadow-black/15">
              Open Split Now
            </a>
          </GateScreen>
        )
      ) : !user || user.isAnonymous ? (
        <Login />
      ) : blocked === undefined || (cfg.maintenance && !admin && aiStatus === undefined && repo.mode === 'firebase') ? (
        // The block check and (in maintenance) the admin check decide which screen this is; a
        // moment of splash beats flashing the wrong one. Demo mode has no admins to wait for.
        <Splash />
      ) : blocked ? (
        <BlockedScreen reason={blocked.reason} />
      ) : cfg.maintenance && !admin ? (
        <MaintenanceScreen message={cfg.maintenanceMessage} />
      ) : updateRequired(cfg, __APP_VERSION__) && !admin ? (
        <UpdateRequired minVersion={cfg.minVersion} />
      ) : (
        <AppRoutes cfg={cfg} admin={admin} />
      )}
    </>
  )
}

function AppRoutes({ cfg, admin }: { cfg: AppConfig; admin: boolean }) {
  usePrefetch()
  // Remembers which screen sits at each history entry, so back buttons return where you came from.
  useTrackNav()
  const liveTables = cfg.flags.liveTables !== false
  const autoCapture = cfg.flags.autoCapture !== false
  // Layout has its own Suspense around the Outlet (the tab bar stays while a screen loads);
  // this one covers the full-screen routes below.
  return (
    <GroupDataProvider>
      <PrefetchNext />
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
            <Route path="groups/:groupId/members" element={<GroupMembers />} />
            <Route path="groups/:groupId/expenses/:expenseId" element={<ExpenseDetail />} />
            <Route path="settle" element={<SettleAll />} />
            <Route path="settle/with/:key" element={<SettleWithPerson />} />
            <Route path="friends" element={<Navigate to="/settle" replace />} />
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
          {/* Always routed for accounts: with the payLinks flag off the payee can still confirm or check a link (the page hides paying). */}
          <Route path="r/:code" element={<PayLink />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </GroupDataProvider>
  )
}

/**
 * The top band of every in-app screen: the admin strip (admins only, while maintenance or an update
 * requirement is on, since they are the only ones who don't get those screens) and the admin's
 * announcement (config/app.announcement) until it is dismissed on this device (a changed text
 * comes back). It is sticky and owns the notch inset while it shows; its measured height goes to
 * <html> as --banner-h with data-banner set, so pages drop their own inset (--safe-top) and their
 * sticky headers stick just under it (src/index.css). Each line stays one line and loops sideways
 * when it is too long (Marquee).
 */
function AnnouncementBanner({ cfg, admin }: { cfg: AppConfig; admin: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const a: Announcement | null = announcementActive(cfg.announcement) ? cfg.announcement : null
  const show = a && !isAnnouncementDismissed(a) && dismissed !== a.text
  const note = adminGateNote(cfg, __APP_VERSION__, admin)
  const visible = !!(show || note)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const html = document.documentElement
    if (!visible || !el) return
    const set = () => html.style.setProperty('--banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    html.setAttribute('data-banner', '')
    set()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set)
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      html.removeAttribute('data-banner')
      html.style.removeProperty('--banner-h')
    }
  }, [visible])

  if (!visible) return null
  return (
    <div
      ref={ref}
      className="sticky top-0 z-40 bg-slate-50/95 pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] backdrop-blur-xl dark:bg-ink-950/95"
      data-testid="announcement"
    >
      <div className="mx-auto max-w-2xl space-y-2 px-4">
        {note && <AdminStrip cfg={cfg} kind={note.kind} text={note.text} />}
        {show && (
          <div
            className={`marquee-host flex items-center gap-2 rounded-2xl py-0.5 pl-3.5 pr-1 text-sm font-medium ${
              a.level === 'warn'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                : 'bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100'
            }`}
            role="status"
            data-testid="announcement-text"
          >
            <Megaphone size={18} className="shrink-0" aria-hidden />
            <Marquee text={a.text} className="flex-1 py-1.5" />
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
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
    </div>
  )
}

/**
 * Admins only: maintenance or an update requirement is on. One line with the state, a link to the
 * console, and (for maintenance) a confirmed "Turn off" that saves config/app the way the console
 * does (toAppConfigDoc + saveConfig, the console's api loaded on first use).
 */
function AdminStrip({ cfg, kind, text }: { cfg: AppConfig; kind: 'maintenance' | 'update'; text: string }) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const turnOff = async () => {
    const ok = await confirm({
      title: 'Turn off maintenance mode?',
      message: 'Everyone can use the app and save changes again straight away.',
      confirmLabel: 'Turn off',
    })
    if (!ok || !user) return
    setBusy(true)
    try {
      const { saveConfig } = await import('./pages/admin/api')
      await saveConfig('app', toAppConfigDoc({ ...cfg, maintenance: false }, user.uid))
      toast('Maintenance mode is off')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="marquee-host flex items-center gap-2 rounded-2xl bg-amber-100 py-0.5 pl-3.5 pr-1 text-sm font-semibold text-amber-950 ring-1 ring-amber-500/25 dark:bg-amber-900/35 dark:text-amber-100 dark:ring-amber-400/20"
      role="status"
      data-testid="admin-strip"
    >
      {kind === 'maintenance' ? <Wrench size={17} className="shrink-0" aria-hidden /> : <RefreshCw size={17} className="shrink-0" aria-hidden />}
      <Marquee text={text} className="flex-1 py-1.5" />
      {kind === 'maintenance' && (
        <button
          type="button"
          className="min-h-9 shrink-0 rounded-xl bg-amber-900 px-3 text-xs font-bold text-amber-50 disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950"
          onClick={turnOff}
          disabled={busy}
          data-testid="admin-strip-off"
        >
          {busy ? 'Turning off…' : 'Turn off'}
        </button>
      )}
      <Link
        to="/admin/flags"
        className="flex min-h-9 shrink-0 items-center rounded-xl px-2.5 text-xs font-bold underline underline-offset-2"
        aria-label="Open Flags & app in the admin console"
      >
        Admin
      </Link>
    </div>
  )
}

function UpdateRequired({ minVersion }: { minVersion: string }) {
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
  return <UpdateRequiredScreen version={semverOf(__APP_VERSION__)} minVersion={minVersion} busy={busy} onUpdate={update} />
}

/**
 * Lazy chunks before they are asked for: the usual next screens on idle after the first
 * signed-in paint, and any in-app link's screen (plus a settings area's own chunk, routeChunks) on pointerdown (which lands ~100 ms before the
 * click React Router acts on). React Router runs navigations as transitions, so a chunk that is
 * still downloading shows as a frozen tap; this is what keeps that rare.
 */
function usePrefetch() {
  useEffect(
    () =>
      onIdle(() => {
        for (const k of IDLE_PREFETCH) prefetch(k)
      }),
    [],
  )
  useEffect(() => {
    const onPointerDown = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== location.origin) return
      for (const k of routeChunks(a.pathname)) prefetch(k)
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])
}

/**
 * The screens only reachable from the one showing (Profile → Settings → its areas), on idle once
 * it has painted. Its own component so a route change doesn't re-render AppRoutes.
 */
function PrefetchNext() {
  const { pathname } = useLocation()
  useEffect(() => {
    const next = prefetchAfter(pathname)
    return next.length
      ? onIdle(() => {
          for (const k of next) prefetch(k)
        })
      : undefined
  }, [pathname])
  return null
}

/** Run `fn` when the main thread is idle (at the latest after 4 s); returns a cancel. Data Saver: never (a tap still prefetches, since the user asked for that screen). */
function onIdle(fn: () => void): () => void {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true) return () => {}
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 2000)
  return () => window.clearTimeout(id)
}

function TableRoutes() {
  return (
    <Routes>
      <Route path="t" element={<TableEntry />} />
      <Route path="t/:code" element={<Table />} />
    </Routes>
  )
}

/** ms since the page started, on the splash's clock (index.html sets window.__bootT0). */
const bootElapsed = () => performance.now() - ((window as Window & { __bootT0?: number }).__bootT0 ?? 0)

/**
 * The sign-in wait: the same markup as the HTML splash (index.html, styled there), with --t set
 * to the time already elapsed so the animation continues instead of starting again.
 */
function Splash({ leaving = false }: { leaving?: boolean }) {
  const [t] = useState(bootElapsed)
  return (
    <div
      className={`boot transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : ''}`}
      role="img"
      aria-label="Split Now"
      style={{ '--t': `${Math.round(t)}ms` } as React.CSSProperties}
    >
      <div className="boot-stack">
        <img className="boot-logo" src="/favicon.svg" alt="" />
        <p className="boot-tag" aria-hidden>
          <span className="boot-l1">Spending is wise, splitting is free.</span>
          <span className="boot-l2">Split Now!</span>
        </p>
      </div>
    </div>
  )
}

/** 'on' while an installed-app launch keeps the splash up for its animation (src/lib/splash.ts), then 'leaving' while it fades. */
function useSplashHold(): 'on' | 'leaving' | 'off' {
  const [ms] = useState(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem('splitit-splash') === '1'
      sessionStorage.setItem('splitit-splash', '1')
    } catch {
      /* no sessionStorage: hold this once */
    }
    const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return splashHoldMs({ elapsed: bootElapsed(), standalone: isStandalone(), seen, reducedMotion })
  })
  const [state, setState] = useState<'on' | 'leaving' | 'off'>(ms > 0 ? 'on' : 'off')
  useEffect(() => {
    if (!ms) return
    const a = setTimeout(() => setState('leaving'), ms)
    const b = setTimeout(() => setState('off'), ms + 300)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [ms])
  return state
}
