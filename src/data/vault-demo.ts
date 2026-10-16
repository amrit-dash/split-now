import type { VaultRequest, VaultStatus } from '@/lib/vault-api'
import { patternProblem } from '@/lib/vault-api'

/*
 * Private groups in demo mode: the vault callable's answers made on the device, so the whole flow
 * (set a pattern, unlock, wrong tries, lockout, change it) works without a server. There is no
 * passkey step and nothing here is secret: the "server" is this browser's storage. The real one
 * is functions/src/vault.ts.
 */

interface DemoVault {
  hash: string
  salt: string
  dek: string
  tries?: { wrong: number; lockedUntil?: number }
}

const KEY = 'sn-demo-vaults'
const FREE_TRIES = 5
const FIRST_LOCK_MS = 15 * 60_000

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

async function hash(pattern: string, salt: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pattern}`))))
}

/** A refusal shaped like the callable's (code + details), so the unlock screen reads both the same way. */
function refuse(message: string, details?: object): never {
  throw Object.assign(new Error(message), { code: 'permission-denied', details })
}

export function demoVault(store: Pick<Storage, 'getItem' | 'setItem'> | undefined, now = () => Date.now()) {
  const read = (): Record<string, DemoVault> => {
    try {
      return JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, DemoVault>
    } catch {
      return {}
    }
  }
  const write = (v: Record<string, DemoVault>) => {
    try {
      store?.setItem(KEY, JSON.stringify(v))
    } catch {
      /* storage full or off */
    }
  }
  const check = async (all: Record<string, DemoVault>, groupId: string, pattern: string): Promise<DemoVault> => {
    const v = all[groupId]
    if (!v) refuse('This group’s pattern isn’t set yet.')
    if (v.tries?.lockedUntil && now() < v.tries.lockedUntil) refuse('Too many wrong patterns. Try again later.', { lockedUntil: v.tries.lockedUntil })
    if ((await hash(pattern, v.salt)) !== v.hash) {
      const wrong = (v.tries?.wrong ?? 0) + 1
      v.tries = wrong < FREE_TRIES ? { wrong } : { wrong, lockedUntil: now() + FIRST_LOCK_MS * 2 ** (wrong - FREE_TRIES) }
      write(all)
      refuse('That’s not the pattern.', { triesLeft: Math.max(0, FREE_TRIES - wrong), lockedUntil: v.tries.lockedUntil })
    }
    delete v.tries
    write(all)
    return v
  }
  return async function vault<T>(req: VaultRequest): Promise<T> {
    const all = read()
    switch (req.op) {
      case 'status': {
        const v = all[req.groupId]
        const locked = !!v?.tries?.lockedUntil && now() < v.tries.lockedUntil
        return {
          setUp: !!v,
          hasPasskey: true,
          triesLeft: locked ? 0 : FREE_TRIES - (v?.tries?.wrong ?? 0),
          ...(locked ? { lockedUntil: v?.tries?.lockedUntil } : {}),
        } satisfies VaultStatus as T
      }
      case 'passkeyOptions':
        return { options: null, hasPasskey: true } as T
      case 'passkeyRegister':
        return { ok: true } as T
      case 'setup': {
        const problem = patternProblem(req.pattern)
        if (problem) refuse(problem)
        if (all[req.groupId]) refuse('Someone already set this group’s pattern. Unlock it with theirs.')
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
        const dek = b64(crypto.getRandomValues(new Uint8Array(32)))
        all[req.groupId] = { salt, hash: await hash(req.pattern, salt), dek }
        write(all)
        return { dek } as T
      }
      case 'unlock':
        return { dek: (await check(all, req.groupId, req.pattern)).dek } as T
      case 'changePattern': {
        const problem = patternProblem(req.next)
        if (problem) refuse(problem)
        const v = await check(all, req.groupId, req.pattern)
        v.salt = b64(crypto.getRandomValues(new Uint8Array(16)))
        v.hash = await hash(req.next, v.salt)
        write(all)
        return { dek: v.dek } as T
      }
    }
  }
}
