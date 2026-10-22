import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { openedGroupsWatch } from '@/lib/vault-open'
import { withoutLocked } from '@/lib/vault-api'
import { isUnlocked } from '@/lib/vault-keys'
import { repo } from '@/data'
import { clearSharedStore, groupsKey, subscribeShared } from '@/data/store'
import type { AuthUser, SnapMeta } from '@/data/repo'
import type { Group, UserProfile } from '@/types'
import { defaultCurrency } from '@/lib/locale'
import { ownMemberSyncs } from '@/lib/memberSync'
import { proShown } from '@/lib/pro'

// Last value written to each member entry this session (group/member → name|photo), so a
// refused write (or a snapshot that hasn't caught up yet) isn't re-sent on every snapshot.
const synced = new Map<string, string>()

/**
 * Keeps the signed-in user's member entries (name + photo) in step with their profile, in
 * every group they're in: after a profile change, for groups joined/created elsewhere, and
 * for entries written before photos were copied.
 */
function useOwnMemberSync(user: AuthUser | null, profile: UserProfile | null) {
  const uid = user && !user.isAnonymous ? user.uid : undefined
  const name = profile?.displayName
  const photo = profile?.photoURL
  // Pro (src/lib/pro.ts): the mark rides along with the name and photo.
  const pro = proShown(profile)
  const ready = !!profile && profile.uid === uid
  useEffect(() => {
    if (!uid || !ready) return
    // The same shared group-list listener the screens read (src/data/store.ts), not a second one,
    // started the same way (private groups' names opened, hooks/data.ts startGroups), whichever
    // subscribes first.
    return subscribeShared<Group[]>(
      groupsKey(uid),
      openedGroupsWatch<Group, SnapMeta>((cb) => repo.watchGroups(uid, cb)),
      (groups) => {
        // A private group locked on this phone shows its names scrambled and takes no writes: it syncs once opened.
        const shown = pro ? { proAt: 1 } : {}
        for (const s of ownMemberSyncs(withoutLocked(groups, isUnlocked), uid, { displayName: name ?? '', photoURL: photo, ...shown }, repo.mode === 'demo')) {
          const key = `${s.group.id}/${s.memberId}`
          const value = `${s.patch.name}|${s.patch.photoURL ?? ''}|${s.patch.pro ? 'pro' : ''}`
          if (synced.get(key) === value) continue
          synced.set(key, value)
          repo.updateOwnMember(s.group, s.memberId, s.patch).catch((e) => console.warn('Member sync failed', e))
        }
      },
    )
  }, [uid, ready, name, photo, pro])
}

interface AuthState {
  user: AuthUser | null
  profile: UserProfile | null
  loading: boolean
}

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      repo.onAuth((u) => {
        setUser(u)
        setLoading(false)
        if (!u) setProfile(null)
      }),
    [],
  )
  useEffect(() => (user ? repo.watchProfile(user.uid, setProfile) : undefined), [user])
  // Shared live queries belong to one account: drop them all when it signs out or changes.
  const uid = user?.uid
  // biome-ignore lint/correctness/useExhaustiveDependencies: uid is the trigger; the cleanup clears the store whenever the signed-in account changes or signs out.
  useEffect(() => () => clearSharedStore(), [uid])
  useOwnMemberSync(user, profile)

  return <Ctx.Provider value={{ user, profile, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** For screens behind the auth gate. */
export function useMe() {
  const { user, profile } = useContext(Ctx)
  if (!user) throw new Error('useMe used outside auth gate')
  return {
    user,
    profile: profile ?? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL, currency: defaultCurrency(), payment: {} },
  }
}
