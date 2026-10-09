import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loading } from '@/components/Misc'
import SettingsHome from './settings/SettingsHome'

// Each area is its own screen (and chunk) so deep links like /settings/notifications work and
// no screen is a nine-card scroll. /settings/auto-capture (the wizard) is routed by App.tsx.
const Preferences = lazy(() => import('./settings/Preferences'))
const Notifications = lazy(() => import('./settings/Notifications'))
const Automation = lazy(() => import('./settings/Automation'))
const Ai = lazy(() => import('./settings/Ai'))
const Data = lazy(() => import('./settings/Data'))
const Admin = lazy(() => import('./settings/Admin'))

/** settings/*: how the app behaves for you. Account details live on /profile. */
export default function Settings() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route index element={<SettingsHome />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="automation" element={<Automation />} />
        <Route path="ai" element={<Ai />} />
        <Route path="data" element={<Data />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </Suspense>
  )
}
