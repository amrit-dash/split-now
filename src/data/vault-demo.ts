import type { UnlockStarted, VaultRequest, VaultStatus } from '@/lib/vault-api'
import { groupPatternProblem, patternProblem } from '@/lib/vault-api'
import { privateGroupsOn } from '../../shared/vault-convert'

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
  /** `added`: people let in here (addContact); the demo's other people have no universal pattern */
  groups: Record<string, { dek: string; pattern?: Hash; added?: string[] }>
  /** turned private groups on (op start, a universal pattern, or a private group they made); they start off */
  on?: boolean
  /** stopped using private groups (op stop) */
  off?: boolean
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
 * The demo profile after private groups turn on or off, as the server writes users/{uid}
 * (privateGroupsOn and privateGroupsOff, never both). The same object when nothing changes.
 */
export function privateProfile<P extends { privateGroupsOn?: boolean; privateGroupsOff?: boolean }>(p: P, to: 'on' | 'off'): P {
  if (to === 'on' ? p.privateGroupsOn && !p.privateGroupsOff : p.privateGroupsOff && !p.privateGroupsOn) return p
  const { privateGroupsOn: _on, privateGroupsOff: _off, ...rest } = p
  return (to === 'on' ? { ...rest, privateGroupsOn: true } : { ...rest, privateGroupsOff: true }) as P
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
  addContact: (groupId: string, uid: string, dek: string) => Promise<void> = async () => {},
  /**
   * made: the live private groups the demo person made and is in; setPrivate: mirrors on or off on
   * their profile (privateGroupsOn / privateGroupsOff), as the server does
   */
  who: { made?: () => number; setPrivate?: (state: 'on' | 'off') => void } = {},
) {
  const OFF = 'You stopped using private groups. Turn them on again in Settings → Encrypted groups.'
  const NO_PATTERN = 'Choose how it opens first: your universal pattern, or its own pattern.'
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
  /** Private groups on (which ends a stop), as the server's markOn; the caller writes the state. */
  const markOn = (s: DemoState) => {
    s.on = true
    delete s.off
    who.setPrivate?.('on')
  }
  const keyOf = (s: DemoState, groupId: string): string => {
    s.groups[groupId] ??= { dek: b64(crypto.getRandomValues(new Uint8Array(32))) }
    return s.groups[groupId].dek
  }
  /**
   * The pattern step, as the server's checkPattern: the universal pattern, or this group's own;
   * a wrong one counts towards the lockout, a right one clears the count. Answers whether the
   * universal one matched.
   */
  const tryPattern = async (s: DemoState, pattern: string | undefined, groupId?: string): Promise<boolean> => {
    const own = groupId ? s.groups[groupId]?.pattern : undefined
    if (!s.person && !own) refuse('Set up encrypted groups first: Settings → Encrypted groups.')
    if (s.tries?.lockedUntil && now() < s.tries.lockedUntil) refuse('Too many wrong patterns. Try again later.', { lockedUntil: s.tries.lockedUntil })
    const p = pattern ?? ''
    const universal = await matches(p, s.person)
    if (!universal && !(await matches(p, own))) {
      const wrong = (s.tries?.wrong ?? 0) + 1
      s.tries = wrong < FREE_TRIES ? { wrong } : { wrong, lockedUntil: now() + FIRST_LOCK_MS * 2 ** (wrong - FREE_TRIES) }
      write(s)
      refuse('That’s not it.', { triesLeft: Math.max(0, FREE_TRIES - wrong), lockedUntil: s.tries.lockedUntil })
    }
    delete s.tries
    return universal
  }
  return async function vault<T>(req: VaultRequest): Promise<T> {
    const s = read()
    const person = s.person
    const locked = !!s.tries?.lockedUntil && now() < s.tries.lockedUntil
    switch (req.op) {
      case 'status': {
        const g = req.groupId ? s.groups[req.groupId] : undefined
        // From before private groups started off: a universal pattern or a private group they made is on (the server's backfill).
        const on = privateGroupsOn({ on: s.on, off: s.off, pattern: s.person }, who.made?.() ?? 0)
        if (on) {
          if (!s.on) {
            markOn(s)
            write(s)
          } else who.setPrivate?.('on')
        }
        return {
          ...(on ? { on: true } : {}),
          ...(s.off ? { off: true } : {}),
          ...(req.made ? { made: who.made?.() ?? 0 } : {}),
          serverReady: true,
          hasPasskey: true,
          universal: !!person,
          ...(person ? { ordered: person.ordered } : {}),
          triesLeft: locked ? 0 : FREE_TRIES - (s.tries?.wrong ?? 0),
          ...(locked ? { lockedUntil: s.tries?.lockedUntil } : {}),
          ...(req.groupId
            ? {
                group: {
                  keyReady: !!g,
                  hasPattern: !!g?.pattern,
                  ...(g?.pattern ? { ordered: g.pattern.ordered } : {}),
                  ...(g?.added?.length ? { noUniversal: g.added } : {}),
                },
              }
            : {}),
        } satisfies VaultStatus as T
      }
      case 'passkeyOptions':
        return { options: null, hasPasskey: true } as T
      case 'passkeyRegister':
        return { ok: true } as T
      case 'setUniversal': {
        const problem = patternProblem(req.pattern)
        if (problem) refuse(problem)
        // changing it takes the current one, as on the server
        if (person) await tryPattern(s, req.current)
        s.person = await hashOf(req.pattern, req.ordered)
        delete s.tries
        // someone with a universal pattern has private groups on (and someone who stopped starts again)
        markOn(s)
        write(s)
        return { ok: true } as T
      }
      case 'start': {
        markOn(s)
        write(s)
        return { ok: true } as T
      }
      case 'unlockStart': {
        const universal = await tryPattern(s, req.pattern, req.groupId)
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
        // without its own pattern it opens with universal patterns only: the one removing it needs one
        if (req.pattern === null && !person) refuse('Set your universal pattern first: without its own pattern, that’s what opens it.')
        await tryPattern(s, req.current, req.groupId)
        const dek = keyOf(s, req.groupId)
        const { pattern: _was, ...kept } = s.groups[req.groupId] ?? {}
        s.groups[req.groupId] = { ...kept, dek, ...(req.pattern === null ? {} : { pattern: await hashOf(req.pattern, req.ordered) }) }
        write(s)
        return { dek } as T
      }
      case 'create': {
        if (s.groups[req.groupId]) refuse('This group already has its key. Unlock it with your pattern.')
        if (req.pattern !== undefined) {
          const problem = groupPatternProblem(req.pattern)
          if (problem) refuse(problem)
        }
        if (s.off) refuse(OFF)
        if (req.pattern === undefined && !person) refuse(NO_PATTERN)
        const dek = keyOf(s, req.groupId)
        // its own pattern, when one was chosen as it was made
        if (req.pattern !== undefined) s.groups[req.groupId].pattern = await hashOf(req.pattern, req.ordered !== false)
        // someone who made a private group has them on
        if (!s.on) markOn(s)
        write(s)
        // its own name, emoji and people, sealed with the new key
        await convert(req.groupId, true, dek)
        return { dek } as T
      }
      // Asking to join needs a second person: the demo has one. Adding someone you know works.
      case 'joinStatus':
        return { status: 'none' } as T
      case 'requestJoin':
      case 'decideJoin':
        return refuse('Asking to join a private group needs the online app: the demo has only you.')
      case 'addContact': {
        const dek = keyOf(s, req.groupId)
        const g = s.groups[req.groupId]
        // Nobody else in the demo has a universal pattern: without its own one they can't open it.
        g.added = [...new Set([...(g.added ?? []), req.uid])]
        write(s)
        await addContact(req.groupId, req.uid, dek)
        return { ok: true, opens: !!g.pattern } as T
      }
      case 'stop': {
        const made = who.made?.() ?? 0
        if (made > 0)
          throw Object.assign(new Error('Turn off private, or delete, the private groups you made first.'), { code: 'failed-precondition', details: { made } })
        if (person) await tryPattern(s, req.current)
        delete s.person
        delete s.on
        s.off = true
        write(s)
        who.setPrivate?.('off')
        return { ok: true } as T
      }
      case 'convert': {
        if (req.on) {
          if (s.off) refuse(OFF)
          if (req.pattern !== undefined) {
            const problem = groupPatternProblem(req.pattern)
            if (problem) refuse(problem)
          } else if (!person) refuse(NO_PATTERN)
          const dek = keyOf(s, req.groupId)
          // its own pattern, when one was chosen as it was made private
          if (req.pattern !== undefined) s.groups[req.groupId].pattern = await hashOf(req.pattern, req.ordered !== false)
          if (!s.on) markOn(s)
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
