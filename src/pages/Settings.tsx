import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loading } from '@/components/Misc'
import { load } from '@/routes'
import SettingsHome from './settings/SettingsHome'

// Each area is its own screen (and chunk) so deep links like /settings/notifications work and
// no screen is a nine-card scroll. /settings/auto-capture (the wizard) is routed by App.tsx.
// The import() thunks are shared with the prefetchers (src/routes.ts), which fetch these chunks
// on idle once Profile or Settings is showing, so opening an area rarely waits on the network.
const Preferences = lazy(load.SettingsPreferences)
const Notifications = lazy(load.SettingsNotifications)
const Automation = lazy(load.SettingsAutomation)
const Ai = lazy(load.SettingsAi)
const Data = lazy(load.SettingsData)
const Animations = lazy(load.SettingsAnimations)
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
        <Route path="animations" element={<Animations />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </Suspense>
  )
}
