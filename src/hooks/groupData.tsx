import type { ReactNode } from 'react'
import { GroupDataCtx, useAllGroupDataImpl } from './data'

/**
 * Computes the all-groups view (balances per group, see useAllGroupData) once for the whole
 * app and hands it to pages through context. Mounted in App around the routes, so the live
 * listeners it holds stay open across tab switches and a page never re-subscribes or shows a
 * loader for data that is already here. The listeners themselves live in src/data/store.ts.
 */
export function GroupDataProvider({ children }: { children: ReactNode }) {
  const data = useAllGroupDataImpl(true)
  return <GroupDataCtx.Provider value={data}>{children}</GroupDataCtx.Provider>
}
