import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { repo } from '@/data'
import type { AuthUser } from '@/data/repo'
import type { UserProfile } from '@/types'
import { defaultCurrency } from '@/lib/locale'

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

  return <Ctx.Provider value={{ user, profile, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** For screens behind the auth gate. */
export function useMe() {
  const { user, profile } = useContext(Ctx)
  if (!user) throw new Error('useMe used outside auth gate')
  return {
    user,
    profile: profile ?? { uid: user.uid, displayName: user.displayName, email: user.email, currency: defaultCurrency(), payment: {} },
  }
}
