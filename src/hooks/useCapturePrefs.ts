import { useEffect, useState } from 'react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { watchCapturePrefs } from '@/lib/capture-settings'
import type { AllPrefs } from '@/lib/push'

/**
 * The signed-in person's notification + auto-capture settings (users/{uid}/settings/notifications,
 * or localStorage in demo mode); null while loading.
 */
export function useCapturePrefs(): AllPrefs | null {
  const { user } = useMe()
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  return prefs
}

const NONE: string[] = []

/** Trips this person paused auto-capture for (group ids); empty while loading. */
export function usePausedTrips(): string[] {
  return useCapturePrefs()?.pausedTrips ?? NONE
}
