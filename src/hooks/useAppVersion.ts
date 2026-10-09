import { useEffect, useState } from 'react'
import { repo } from '@/data'

/** The version shown to people: config/app.version (set by admins), else the build's own. */
export function useAppVersion(): string {
  const [v, setV] = useState<string | undefined>()
  useEffect(() => repo.watchAppInfo((i) => setV(i?.version || undefined)), [])
  return v ?? __APP_VERSION__
}
