import type { Repo } from '@/data/repo'
import type { PasskeyOptions, UnlockStarted } from '@/lib/vault-api'
import { vaultKey } from '@/lib/vault-crypto'
import { setVaultKey } from '@/lib/vault-keys'

/*
 * The passkey step of private groups: Face ID, a fingerprint or the screen lock, through WebAuthn.
 * The browser library loads only when one is asked for. Synced passkeys (iCloud Keychain, Google
 * Password Manager) work on a person's other devices too. Demo mode has no passkey step.
 */

type Browser = typeof import('@simplewebauthn/browser')
type RegJSON = Parameters<Browser['startRegistration']>[0]['optionsJSON']
type AuthJSON = Parameters<Browser['startAuthentication']>[0]['optionsJSON']

/** Adds a passkey for this person on this site (Settings → Encrypted groups). */
export async function registerPasskey(repo: Repo): Promise<void> {
  if (repo.mode === 'demo') return
  const { startRegistration } = await import('@simplewebauthn/browser')
  const reg = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'register' })
  const response = await startRegistration({ optionsJSON: reg.options as RegJSON })
  await repo.vault({ op: 'passkeyRegister', response })
}

/** A passkey answer for a settings step (a pattern being set); registers one first when there's none here. */
export async function passkeyProof(repo: Repo): Promise<unknown | undefined> {
  if (repo.mode === 'demo') return undefined
  const { startAuthentication } = await import('@simplewebauthn/browser')
  let auth = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'auth' })
  if (!auth.hasPasskey) {
    await registerPasskey(repo)
    auth = await repo.vault<PasskeyOptions>({ op: 'passkeyOptions', purpose: 'auth' })
  }
  return startAuthentication({ optionsJSON: auth.options as AuthJSON })
}

/**
 * After a right pattern: the passkey (or, on a site with none yet, a new one), then the keys it
 * opens, held in memory. Returns how many groups opened.
 */
export async function finishUnlock(repo: Repo, started: UnlockStarted): Promise<number> {
  let keys = started.keys
  if (!keys) {
    const b = await import('@simplewebauthn/browser')
    const answer = started.register
      ? { register: await b.startRegistration({ optionsJSON: started.options as RegJSON }) }
      : { auth: await b.startAuthentication({ optionsJSON: started.options as AuthJSON }) }
    keys = (await repo.vault<{ keys: Record<string, string> }>({ op: 'unlockFinish', ...answer })).keys
  }
  const opened = await Promise.all(Object.entries(keys).map(([groupId, dek]) => vaultKey(groupId, dek)))
  for (const k of opened) setVaultKey(k)
  return opened.length
}

/** A new private group's first key, on the phone that made it, so it opens straight away. */
export async function openNewGroup(repo: Repo, groupId: string): Promise<void> {
  const { dek } = await repo.vault<{ dek: string }>({ op: 'create', groupId })
  setVaultKey(await vaultKey(groupId, dek))
}

/** A passkey prompt the person closed: not an error worth a red toast. */
export const passkeyCancelled = (e: unknown): boolean => {
  const name = (e as { name?: string })?.name
  return name === 'NotAllowedError' || name === 'AbortError'
}
