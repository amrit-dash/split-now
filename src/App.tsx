import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/auth'
import { Layout } from './components/Layout'
import { Loading } from './components/Misc'
import { UpdatePrompt } from './components/UpdatePrompt'
import Login from './pages/Login'
import Home from './pages/Home'
import Groups from './pages/Groups'

const GroupForm = lazy(() => import('./pages/GroupForm'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const ExpenseForm = lazy(() => import('./pages/ExpenseForm'))
const ExpenseDetail = lazy(() => import('./pages/ExpenseDetail'))
const SettleUp = lazy(() => import('./pages/SettleUp'))
const Scan = lazy(() => import('./pages/Scan'))
const Friends = lazy(() => import('./pages/Friends'))
const Insights = lazy(() => import('./pages/Insights'))
const Profile = lazy(() => import('./pages/Profile'))
const Join = lazy(() => import('./pages/Join'))

export default function App() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    if (!user) return
    const back = sessionStorage.getItem('splitit-return')
    if (back) { sessionStorage.removeItem('splitit-return'); nav(back, { replace: true }) }
  }, [user, nav])

  if (loading) return <Splash />

  if (!user) {
    // Remember where they were going (e.g. an invite link) and come back after sign-in.
    if (loc.pathname !== '/') sessionStorage.setItem('splitit-return', loc.pathname + loc.search)
    return (
      <>
        <UpdatePrompt />
        <Login />
      </>
    )
  }

  return (
    <>
      <UpdatePrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/new" element={<GroupForm />} />
            <Route path="groups/:groupId" element={<GroupDetail />} />
            <Route path="groups/:groupId/edit" element={<GroupForm />} />
            <Route path="groups/:groupId/settle" element={<SettleUp />} />
            <Route path="groups/:groupId/expenses/:expenseId" element={<ExpenseDetail />} />
            <Route path="friends" element={<Friends />} />
            <Route path="insights" element={<Insights />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="add" element={<ExpenseForm />} />
          <Route path="groups/:groupId/expenses/:expenseId/edit" element={<ExpenseForm />} />
          <Route path="scan" element={<Scan />} />
          <Route path="join/:code" element={<Join />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-700 to-fuchsia-700">
      <img src="/pwa-192.png" alt="Split It" className="animate-pop h-20 w-20 rounded-3xl shadow-2xl" />
    </div>
  )
}
