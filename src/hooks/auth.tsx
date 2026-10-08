import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { repo } from '@/data'
import type { AuthUser } from '@/data/repo'
import type { UserProfile } from '@/types'
import { defaultCurrency } from '@/lib/locale'
import { ownMemberSyncs } from '@/lib/memberSync'

// Last value written to each member entry this session (group/member → name|photo), so a
// refused write (or a snapshot that hasn't caught up yet) isn't re-sent on every snapshot.
const synced = new Map<string, string>()

/**
 * Keeps the signed-in user's member entries (name + photo) in step with their profile, in
 * every group they're in: after a profile change, for groups joined/created elsewhere, and
 * for entries written before photos were copied. Shares the group-list query with the screens.
 */
function useOwnMemberSync(user: AuthUser | null, profile: UserProfile | null) {
  const uid = user && !user.isAnonymous ? user.uid : undefined
  const name = profile?.displayName
  const photo = profile?.photoURL
  const ready = !!profile && profile.uid === uid
  useEffect(() => {
    if (!uid || !ready) return
    return repo.watchGroups(uid, (groups) => {
      for (const s of ownMemberSyncs(groups, uid, { displayName: name ?? '', photoURL: photo }, repo.mode === 'demo')) {
        const key = `${s.group.id}/${s.memberId}`
        const value = `${s.patch.name}|${s.patch.photoURL ?? ''}`
        if (synced.get(key) === value) continue
        synced.set(key, value)
        repo.updateOwnMember(s.group, s.memberId, s.patch).catch((e) => console.warn('Member sync failed', e))
      }
    })
  }, [uid, ready, name, photo])
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

  useEffect(() => repo.onAuth((u) => { setUser(u); setLoading(false); if (!u) setProfile(null) }), [])
  useEffect(() => (user ? repo.watchProfile(user.uid, setProfile) : undefined), [user])
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
