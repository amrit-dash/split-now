import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { repo } from './data'
import { useAuth } from './hooks/auth'
import { useToast } from './components/Toast'
import { Layout } from './components/Layout'
import { Loading } from './components/Misc'
import { UpdatePrompt } from './components/UpdatePrompt'
import { errText } from './lib/errors'
import { takeStashedCapture } from './lib/pending'
import { refreshPush, setBadge, watchPrefs } from './lib/push'
import { setAiScan } from './lib/ai'
import { GroupDataProvider } from './hooks/groupData'
import { primeAiStatus } from './hooks/useAiStatus'
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
  useEffect(() => {
    if (user && !user.isAnonymous && repo.mode === 'firebase') void refreshPush(user.uid)
  }, [user])

  // Mirror the account's "read bills with AI" choice onto this device (read synchronously when scanning).
  useEffect(
    () => (user && !user.isAnonymous && repo.mode === 'firebase' ? watchPrefs(user.uid, (p) => setAiScan(p.aiEnabled && p.aiImages)) : undefined),
    [user],
  )

  // AI status (admin flag, shared key) once per sign-in, so Profile doesn't wait for it.
  useEffect(() => primeAiStatus(user && !user.isAnonymous && repo.mode === 'firebase' ? user.uid : null), [user])

  // Pull anything iOS Shortcuts dropped into captureInbox while the app was closed.
  useEffect(() => {
    if (!user || user.isAnonymous) return
    const claim = () => {
      if (document.visibilityState === 'visible') repo.claimInbox(user.uid).catch((e) => console.warn('Inbox sync failed', e))
    }
    claim()
    document.addEventListener('visibilitychange', claim)
    return () => document.removeEventListener('visibilitychange', claim)
  }, [user])

  const guestCapture = !loading && !user && loc.pathname === '/capture'
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
        <Suspense fallback={<Splash />}>
          <TableRoutes />
        </Suspense>
      ) : !user || user.isAnonymous ? (
        <Login />
      ) : (
        <AppRoutes />
      )}
    </>
  )
}

function AppRoutes() {
  usePrefetch()
  // Layout has its own Suspense around the Outlet (the tab bar stays while a screen loads);
  // this one covers the full-screen routes below.
  return (
    <GroupDataProvider>
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
            <Route path="settings/auto-capture" element={<AutoCaptureSetup />} />
            <Route path="settings/*" element={<Settings />} />
          </Route>
          <Route path="add" element={<ExpenseForm />} />
          <Route path="groups/:groupId/expenses/:expenseId/edit" element={<ExpenseForm />} />
          <Route path="split" element={<SplitBill />} />
          <Route path="scan" element={<Scan />} />
          <Route path="capture" element={<Capture />} />
          <Route path="capture/:captureId" element={<Capture />} />
          <Route path="share" element={<Share />} />
          <Route path="join/:code" element={<Join />} />
          <Route path="t" element={<TableEntry />} />
          <Route path="t/:code" element={<Table />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </GroupDataProvider>
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
