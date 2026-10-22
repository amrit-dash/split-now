import { useMe } from '@/hooks/auth'
import { useAiStatus } from '@/hooks/useAiStatus'
import { type BadgeWord, badgeWord, devShown, hasEarnedPro, proShown } from '@/lib/pro'

/**
 * The signed-in person's badge (src/lib/pro.ts): `earned` once Help reached 100% (they then see no
 * "how to earn it" links), `shown` while their Pro badge is on, `admin` (aiStatus().admin, the
 * rules' check) and `dev` while their Dev badge is on, and `word`, what their own badge says.
 * Another member's badge comes from their member entry: memberBadge(group.members[id]).
 */
export function usePro(): { earned: boolean; shown: boolean; admin: boolean; dev: boolean; word: BadgeWord | null } {
  const { profile } = useMe()
  const admin = !!useAiStatus()?.admin
  return { earned: hasEarnedPro(profile), shown: proShown(profile), admin, dev: devShown(profile, admin), word: badgeWord(profile, admin) }
}
