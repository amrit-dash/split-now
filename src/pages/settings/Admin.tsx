import { Navigate } from 'react-router-dom'

/** /settings/admin: the console moved to /admin (phase 2). Old deep links (Profile's #ai-admin, AI settings hints) land there. */
export default function Admin() {
  return <Navigate to="/admin" replace />
}
