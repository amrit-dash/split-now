import type { ReactNode } from 'react'

/**
 * Placeholder: the shared, refcounted group-data store lands here (hooks/data.ts keeps the
 * public hook names). Mounted once in App so tab switches reuse live listeners.
 */
export function GroupDataProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
