import { useEffect, useSyncExternalStore } from 'react'
import { useMe } from '@/hooks/auth'
import { useCaptureTokens, useGroups } from '@/hooks/data'
import { getDuo } from '@/lib/accent'
import { getIconStylePref } from '@/lib/icon-style-pref'
import { getLookPref } from '@/lib/look-pref'
import { customLook, effectiveMode, groupUsesApprovals, type Mode, type ModeChoice, type SimpleHide, settleAuto, showsFeature } from '@/lib/mode'
import { getModePref, setModePref, subscribeModePref } from '@/lib/mode-pref'
import { getMotion } from '@/lib/motion'

/** What this person picked: Simple, Advanced, or 'auto' (not picked yet). */
export function useModeChoice(): ModeChoice {
  return useSyncExternalStore(subscribeModePref, getModePref, getModePref)
}

const localLook = () => customLook({ look: getLookPref(), icons: getIconStylePref(), duo: getDuo(), motion: getMotion() })

/**
 * Simple or Advanced, for the screen to draw. 'auto' reads the signals this device has at hand;
 * the ones from the account (capture keys, approvals) are settled once by ModeSettler.
 */
export function useMode(): Mode {
  return effectiveMode(useModeChoice(), { customLook: localLook() })
}

export const useSimple = (): boolean => useMode() === 'simple'

/**
 * Mounted once inside the signed-in app (Layout). While the mode is 'auto', it watches what the
 * account uses; as soon as that says Advanced (a capture key, approvals in a group they made), it
 * keeps Advanced for them, so someone who set those up never finds them gone after the update.
 */
export function ModeSettler() {
  const choice = useModeChoice()
  const { user } = useMe()
  const tokens = useCaptureTokens()
  const groups = useGroups()
  const capture = tokens ? tokens.length > 0 : undefined
  const approvals = groups ? groups.some((g) => g.createdBy === user.uid && groupUsesApprovals(g)) : undefined
  useEffect(() => {
    const settled = settleAuto(choice, { customLook: localLook(), capture, approvals })
    if (settled) setModePref(settled)
  }, [choice, capture, approvals])
  return null
}

/** Whether this screen shows a control Simple hides (src/lib/mode.ts SIMPLE_HIDES). */
export const useFeature = (f: SimpleHide): boolean => showsFeature(useMode(), f)
