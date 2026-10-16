import type { Repo } from '@/data/repo'
import type { PasskeyOptions } from '@/lib/vault-api'

/*
 * The passkey step of opening a private group: Face ID, a fingerprint or the screen lock, through
 * WebAuthn. The browser library loads only here (the unlock screen). A person's first private
 * group on a site registers a passkey first; synced passkeys (iCloud Keychain, Google Password
 * Manager) then work on their other devices too. Demo mode has no passkey step.
 */

export async function passkeyProof(repo: Repo): Promise<unknown | undefined> {
  if (repo.mode === 'demo') return undefined
  const { startAuthentication, startRegistration } = await import('@simplewebauthn/browser')
  let auth = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'auth' })
  if (!auth.hasPasskey) {
    const reg = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'register' })
    const response = await startRegistration({ optionsJSON: reg.options as Parameters<typeof startRegistration>[0]['optionsJSON'] })
    await repo.vault({ op: 'passkeyRegister', response })
    auth = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'auth' })
  }
  return startAuthentication({ optionsJSON: auth.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] })
}

/** A passkey prompt the person closed: not an error worth a red toast. */
export const passkeyCancelled = (e: unknown): boolean => {
  const name = (e as { name?: string })?.name
  return name === 'NotAllowedError' || name === 'AbortError'
}
