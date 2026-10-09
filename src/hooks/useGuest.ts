import { useEffect, useState } from 'react'
import { repo } from '@/data'
import { useAuth } from '@/hooks/auth'
import { errText } from '@/lib/errors'

// One anonymous sign-in per page load, shared by every screen that needs it.
let anonSignIn: Promise<void> | undefined

/**
 * Live table guests and Pay me link visitors need no account: in Firebase mode they are signed
 * in anonymously as soon as the screen opens (the rules let an anonymous uid read a table or a
 * link by its code and make the one change a guest may make). Returns a readable message when
 * that failed, e.g. anonymous sign-in is off in the Firebase console. A no-op in demo mode and
 * for anyone already signed in.
 */
export function useAnonymousSignIn(): string | undefined {
  const { user, loading } = useAuth()
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (repo.mode !== 'firebase' || loading || user || !repo.signInAnonymously) return
    anonSignIn ??= repo.signInAnonymously()
    anonSignIn.catch((e) => {
      anonSignIn = undefined
      const code = (e as { code?: string }).code ?? ''
      setError(
        code.includes('admin-restricted') || code.includes('operation-not-allowed')
          ? 'Guest access isn’t enabled for this app yet (Firebase anonymous sign-in is off).'
          : errText(e),
      )
    })
  }, [loading, user])
  return error
}

const safeSession = {
  get(k: string) {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      sessionStorage.setItem(k, v)
    } catch {
      /* storage unavailable */
    }
  },
}

/** Demo mode has one signed-in user per browser, so each "guest" tab gets its own id. */
export function demoGuestId(newId: () => string): string {
  const KEY = 'splitit-table-guest'
  let id = safeSession.get(KEY)
  if (!id) {
    id = newId()
    safeSession.set(KEY, id)
  }
  return id
}
