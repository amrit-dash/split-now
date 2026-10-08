import { useEffect, useState, useSyncExternalStore } from 'react'
import { repo } from '@/data'
import { getAppConfig, startAppConfig, subscribeAppConfig, watchBlocked, type AppConfig, type BlockInfo, type FlagName } from '@/lib/flags'

/**
 * The admin's switches (config/app), live. One listener for the whole session; the first render
 * already has the last cached copy, or the defaults (everything on) on a fresh device.
 */
export function useAppConfig(): AppConfig {
  startAppConfig(repo.mode)
  return useSyncExternalStore(subscribeAppConfig, getAppConfig, getAppConfig)
}

/** `useFlag('quickAdd')`: false only when an admin turned the feature off; true when config/app is missing. */
export function useFlag(name: FlagName): boolean {
  return useAppConfig().flags[name] !== false
}

/**
 * Whether this account is blocked (blocked/{uid}). undefined while the first answer is pending in
 * firebase mode; null when not blocked, in demo mode, or signed out.
 */
export function useBlocked(uid: string | null | undefined): BlockInfo | null | undefined {
  const firebase = repo.mode === 'firebase'
  const [state, setState] = useState<BlockInfo | null | undefined>(uid && firebase ? undefined : null)
  useEffect(() => {
    if (!uid || !firebase) return
    return watchBlocked(uid, setState)
  }, [uid, firebase])
  return uid && firebase ? state : null
}
