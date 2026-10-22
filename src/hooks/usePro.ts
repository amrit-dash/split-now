import { useMe } from '@/hooks/auth'
import { hasEarnedPro, proShown } from '@/lib/pro'

/**
 * The signed-in person's Pro (src/lib/pro.ts): `earned` once Help reached 100% (they then see
 * no "how to earn it" links), `shown` while their badge is on (Preferences → Show my Pro badge).
 * Another member's mark comes from their member entry: memberPro(group.members[id]).
 */
export function usePro(): { earned: boolean; shown: boolean } {
  const { profile } = useMe()
  return { earned: hasEarnedPro(profile), shown: proShown(profile) }
}
