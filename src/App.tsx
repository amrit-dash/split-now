import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { repo } from './data'
import { useAuth } from './hooks/auth'
import { useToast } from './components/Toast'
import { Layout } from './components/Layout'
import { Loading } from './components/Misc'
import { UpdatePrompt } from './components/UpdatePrompt'
import { takeStashedCapture } from './lib/pending'
import { refreshPush, watchPrefs } from './lib/push'
import { setAiScan } from './lib/ai'
import Login from './pages/Login'
import Home from './pages/Home'
import Groups from './pages/Groups'

const GroupForm = lazy(() => import('./pages/GroupForm'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const ExpenseForm = lazy(() => import('./pages/ExpenseForm'))
const SplitBill = lazy(() => import('./pages/SplitBill'))
const ExpenseDetail = lazy(() => import('./pages/ExpenseDetail'))
const SettleUp = lazy(() => import('./pages/SettleUp'))
const Scan = lazy(() => import('./pages/Scan'))
const Friends = lazy(() => import('./pages/Friends'))
const Insights = lazy(() => import('./pages/Insights'))
const Profile = lazy(() => import('./pages/Profile'))
const Join = lazy(() => import('./pages/Join'))
const Capture = lazy(() => import('./pages/Capture'))
const CaptureGuest = lazy(() => import('./pages/CaptureGuest'))
const Inbox = lazy(() => import('./pages/Inbox'))
const AutoCaptureSetup = lazy(() => import('./pages/AutoCaptureSetup'))
const Share = lazy(() => import('./pages/Share'))
const ImportGroup = lazy(() => import('./pages/ImportGroup'))
const Table = lazy(() => import('./pages/Table'))
const TableEntry = lazy(() => import('./pages/Table').then((m) => ({ default: m.TableEntry })))

export default function App() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()

  // Saves resolve locally (so they work offline); a later server rejection lands here.
  useEffect(() => repo.onError((e) => toast(e.message, 'err')), [toast])

  useEffect(() => {
    if (!user || user.isAnonymous) return
    // A capture link opened while signed out wins over the generic return path.
    const capture = takeStashedCapture()
    const back = sessionStorage.getItem('splitit-return')
    sessionStorage.removeItem('splitit-return')
    if (capture) nav(`/capture${capture}`, { replace: true })
    else if (back) nav(back, { replace: true })
  }, [user, nav])

  // Keep this browser's push registration fresh (FCM tokens rotate); no-op without permission.
  useEffect(() => { if (user && !user.isAnonymous && repo.mode === 'firebase') void refreshPush(user.uid) }, [user])

  // Mirror the account's "read bills with AI" choice onto this device (read synchronously when scanning).
  useEffect(() => (user && !user.isAnonymous && repo.mode === 'firebase' ? watchPrefs(user.uid, (p) => setAiScan(p.aiImages)) : undefined), [user])

  // Pull anything iOS Shortcuts dropped into captureInbox while the app was closed.
  useEffect(() => {
    if (!user || user.isAnonymous) return
    const claim = () => { if (document.visibilityState === 'visible') repo.claimInbox(user.uid).catch((e) => console.warn('Inbox sync failed', e)) }
    claim()
    document.addEventListener('visibilitychange', claim)
    return () => document.removeEventListener('visibilitychange', claim)
  }, [user])

  const guestCapture = !loading && !user && loc.pathname === '/capture'
  // Live table links work without an account (anonymous sign-in); anonymous users see nothing else.
  const tablePath = loc.pathname === '/t' || loc.pathname.startsWith('/t/')
  const guestTable = !loading && (!user || !!user.isAnonymous) && tablePath
  // Remember where they were going (e.g. an invite link) and come back after sign-in.
  if (!loading && !user && !guestCapture && !tablePath && loc.pathname !== '/') sessionStorage.setItem('splitit-return', loc.pathname + loc.search)

  // UpdatePrompt is mounted exactly once, outside the auth switch, so the service worker is
  // registered (and its hourly update timer started) a single time.
  return (
    <>
      <UpdatePrompt />
      {loading ? <Splash />
        : guestCapture ? <Suspense fallback={<Splash />}><CaptureGuest /></Suspense>
        : guestTable ? <Suspense fallback={<Splash />}><TableRoutes /></Suspense>
        : !user || user.isAnonymous ? <Login /> : <AppRoutes />}
    </>
  )
}

function AppRoutes() {
  return (
    <>
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
    </>
  )
}

function TableRoutes() {
  return (
    <Routes>
      <Route path="t" element={<TableEntry />} />
      <Route path="t/:code" element={<Table />} />
    </Routes>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-700 to-duo-700">
      <img src="/pwa-192.png" alt="Split Now" className="animate-pop h-20 w-20 rounded-3xl shadow-2xl" />
    </div>
  )
}
