import type { UnlockStarted, VaultRequest, VaultStatus } from '@/lib/vault-api'
import { groupPatternProblem, patternProblem } from '@/lib/vault-api'

/*
 * Private groups in demo mode: the vault callable's answers made on the device, so the whole flow
 * (set a universal pattern, unlock every private group or one, a group's own pattern, wrong tries,
 * lockout) works without a server. There is no passkey step: unlockStart answers with the keys at
 * once. Nothing here is secret: the "server" is this browser's storage. The real one is
 * functions/src/vault.ts.
 */

interface Hash {
  hash: string
  salt: string
  ordered: boolean
}

interface DemoState {
  person?: Hash
  /** wrong patterns, universal or a group's own, counted together like the server does */
  tries?: { wrong: number; lockedUntil?: number }
  groups: Record<string, { dek: string; pattern?: Hash }>
}

const KEY = 'sn-demo-vault'
/** 7.1's demo kept one pattern per group; those become the groups' own patterns. */
const OLD_KEY = 'sn-demo-vaults'
const FREE_TRIES = 5
const FIRST_LOCK_MS = 15 * 60_000

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const canonical = (p: string, ordered: boolean) => (ordered ? p : [...p].sort().join(''))

async function digest(pattern: string, salt: string, ordered: boolean) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${canonical(pattern, ordered)}`))))
}

async function hashOf(pattern: string, ordered: boolean): Promise<Hash> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, ordered, hash: await digest(pattern, salt, ordered) }
}

const matches = async (pattern: string, h: Hash | undefined) => !!h && (await digest(pattern, h.salt, h.ordered)) === h.hash

/** A refusal shaped like the callable's (code + details), so the unlock sheet reads both the same way. */
function refuse(message: string, details?: object): never {
  throw Object.assign(new Error(message), { code: 'permission-denied', details })
}

/**
 * `privateGroups` lists the live private groups the demo person is in (the "every group" unlock).
 */
/**
 * `convert` turns a group's documents private (`on`) or back, as the callable does on the server
 * (shared/vault-convert.ts over the demo's own state; localRepo supplies it).
 */
export function demoVault(
  store: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  now = () => Date.now(),
  privateGroups: () => string[] = () => [],
  convert: (groupId: string, on: boolean, dek: string) => Promise<void> = async () => {},
) {
  const read = (): DemoState => {
    try {
      const raw = store?.getItem(KEY)
      if (raw) return JSON.parse(raw) as DemoState
      const old = JSON.parse(store?.getItem(OLD_KEY) ?? '{}') as Record<string, { hash: string; salt: string; dek: string }>
      return { groups: Object.fromEntries(Object.entries(old).map(([id, v]) => [id, { dek: v.dek, pattern: { hash: v.hash, salt: v.salt, ordered: true } }])) }
    } catch {
      return { groups: {} }
    }
  }
  const write = (v: DemoState) => {
    try {
      store?.setItem(KEY, JSON.stringify(v))
    } catch {
      /* storage full or off */
    }
  }
  const keyOf = (s: DemoState, groupId: string): string => {
    s.groups[groupId] ??= { dek: b64(crypto.getRandomValues(new Uint8Array(32))) }
    return s.groups[groupId].dek
  }
  return async function vault<T>(req: VaultRequest): Promise<T> {
    const s = read()
    const person = s.person
    const locked = !!s.tries?.lockedUntil && now() < s.tries.lockedUntil
    switch (req.op) {
      case 'status': {
        const g = req.groupId ? s.groups[req.groupId] : undefined
        return {
          serverReady: true,
          hasPasskey: true,
          universal: !!person,
          ...(person ? { ordered: person.ordered } : {}),
          triesLeft: locked ? 0 : FREE_TRIES - (s.tries?.wrong ?? 0),
          ...(locked ? { lockedUntil: s.tries?.lockedUntil } : {}),
          ...(req.groupId ? { group: { keyReady: !!g, hasPattern: !!g?.pattern, ...(g?.pattern ? { ordered: g.pattern.ordered } : {}) } } : {}),
        } satisfies VaultStatus as T
      }
      case 'passkeyOptions':
        return { options: null, hasPasskey: true } as T
      case 'passkeyRegister':
        return { ok: true } as T
      case 'setUniversal': {
        const problem = patternProblem(req.pattern)
        if (problem) refuse(problem)
        s.person = await hashOf(req.pattern, req.ordered)
        delete s.tries
        write(s)
        return { ok: true } as T
      }
      case 'unlockStart': {
        const own = req.groupId ? s.groups[req.groupId]?.pattern : undefined
        if (!person && !own) refuse('Set up encrypted groups first: Settings → Encrypted groups.')
        if (locked) refuse('Too many wrong patterns. Try again later.', { lockedUntil: s.tries?.lockedUntil })
        const universal = await matches(req.pattern, person)
        if (!universal && !(await matches(req.pattern, own))) {
          const wrong = (s.tries?.wrong ?? 0) + 1
          s.tries = wrong < FREE_TRIES ? { wrong } : { wrong, lockedUntil: now() + FIRST_LOCK_MS * 2 ** (wrong - FREE_TRIES) }
          write(s)
          refuse('That’s not it.', { triesLeft: Math.max(0, FREE_TRIES - wrong), lockedUntil: s.tries.lockedUntil })
        }
        delete s.tries
        const ids = universal && !req.groupId ? privateGroups() : [req.groupId as string]
        const keys = Object.fromEntries(ids.map((id) => [id, keyOf(s, id)]))
        write(s)
        return { keys } satisfies UnlockStarted as T
      }
      case 'unlockFinish':
        return refuse('That took too long. Try again.')
      case 'groupPattern': {
        if (req.pattern !== null) {
          const problem = groupPatternProblem(req.pattern)
          if (problem) refuse(problem)
        }
        const dek = keyOf(s, req.groupId)
        s.groups[req.groupId] = { dek, ...(req.pattern === null ? {} : { pattern: await hashOf(req.pattern, req.ordered) }) }
        write(s)
        return { dek } as T
      }
      case 'create': {
        if (s.groups[req.groupId]) refuse('This group already has its key. Unlock it with your pattern.')
        const dek = keyOf(s, req.groupId)
        write(s)
        // its own name, emoji and people, sealed with the new key
        await convert(req.groupId, true, dek)
        return { dek } as T
      }
      case 'convert': {
        if (req.on) {
          if (!person) refuse('Set up encrypted groups first: Settings → Encrypted groups.')
          const dek = keyOf(s, req.groupId)
          write(s)
          await convert(req.groupId, true, dek)
          return { dek } as T
        }
        const g = s.groups[req.groupId]
        if (!g) return { ok: true } as T
        await convert(req.groupId, false, g.dek)
        delete s.groups[req.groupId]
        write(s)
        return { ok: true } as T
      }
    }
  }
}
