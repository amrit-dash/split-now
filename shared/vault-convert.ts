import { fitForToken, isToken, openDeep, sealText, type VaultKey } from './vault-crypto'

/*
 * Turning an existing group private, or back (docs/VAULT.md): which words of each of its documents
 * become tokens, and back again. The vault callable runs it over every document of the group with
 * the Admin SDK (functions/src/vault.ts op `convert`, which may rewrite other people's comments and
 * chat and the append-only activity), and demo mode runs it over its own copy. The phones seal the
 * same fields of new writes (src/lib/vault-fields.ts, src/data/vault-repo.ts) with the same CAPS.
 *
 * Every function answers a patch: the top-level fields that changed, or null when nothing did, so a
 * second pass over a group (to catch a write that landed during the first) touches only what's new.
 * Pure apart from WebCrypto (browsers, Node 22). Documents are matched structurally (no @/types).
 */

/** The longest a field's token may be: the rules' caps (firestore.rules) for a private group. */
export const CAPS = {
  description: 200,
  notes: 2000,
  note: 500,
  reason: 500,
  comment: 2000,
  chat: 1000,
  title: 120,
  itemNotes: 500,
  groupName: 200,
  emoji: 80,
  memberName: 200,
  memberPhoto: 2048,
  authorName: 200,
  actorName: 200,
  summary: 1000,
  replyText: 160,
  /** a profile copy's payment details, sealed as one JSON text (profileCopy kind) */
  payment: 1000,
} as const

export type ConvertKind = 'group' | 'expense' | 'settlement' | 'comment' | 'chat' | 'openItem' | 'activity' | 'profile'

type Doc = Record<string, unknown>
type Patch = Record<string, unknown> | null

const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v)

/** One text sealed to fit `cap`; empty, missing and already-sealed values stay as they are. */
export async function sealField(k: VaultKey, v: unknown, cap: number): Promise<unknown> {
  if (typeof v !== 'string' || !v || isToken(v)) return v
  return sealText(k, fitForToken(v, cap))
}

/** The fields of `before` → `after` that differ, as a patch (null when none). */
function diff(before: Doc, after: Doc): Patch {
  const out: Doc = {}
  for (const key of Object.keys(after)) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key]
  return Object.keys(out).length ? out : null
}

async function sealMap(k: VaultKey, m: unknown, field: string, cap: number): Promise<unknown> {
  if (!isObj(m)) return m
  const out: Doc = {}
  // Only a field an entry has: an `undefined` written back would be refused (Firestore) or show up as a change.
  for (const [id, v] of Object.entries(m)) out[id] = isObj(v) && field in v ? { ...v, [field]: await sealField(k, v[field], cap) } : v
  return out
}

/** A snapshot's words in an activity entry (before/after): the text fields alone, never amounts, dates or ids. */
const SNAPSHOT_TEXT: Record<string, number> = {
  description: CAPS.description,
  notes: CAPS.notes,
  title: CAPS.title,
  note: CAPS.note,
  reason: CAPS.reason,
  name: CAPS.memberName,
}

async function sealSnapshot(k: VaultKey, s: unknown): Promise<unknown> {
  if (!isObj(s)) return s
  const out: Doc = { ...s }
  for (const [key, cap] of Object.entries(SNAPSHOT_TEXT)) if (key in out) out[key] = await sealField(k, out[key], cap)
  return out
}

/**
 * The patch that seals one document of kind `kind` (its words; never amounts, dates, ids or emails).
 * An AI-drawn icon or picture (`iconSvg`, `iconImage`) can't be sealed into a token that fits and was drawn from the words in
 * the clear, so it goes: its patch value is null, which the writer turns into a delete. The emoji stays (sealed).
 */
export async function sealDoc(k: VaultKey, kind: ConvertKind, doc: Doc): Promise<Patch> {
  const d: Doc = { ...doc }
  const f = async (key: string, cap: number) => {
    if (key in d) d[key] = await sealField(k, d[key], cap)
  }
  if (kind === 'group' || kind === 'expense' || kind === 'openItem') for (const f of ['iconSvg', 'iconImage']) if (typeof d[f] === 'string') d[f] = null
  switch (kind) {
    case 'group':
      await f('name', CAPS.groupName)
      await f('emoji', CAPS.emoji)
      d.members = await sealMap(k, d.members, 'name', CAPS.memberName)
      // a person's photo link names who they are: sealed too (the photo itself stays where it is)
      d.members = await sealMap(k, d.members, 'photoURL', CAPS.memberPhoto)
      if (!('members' in doc)) delete d.members
      break
    case 'expense':
      await f('description', CAPS.description)
      await f('icon', CAPS.emoji)
      await f('notes', CAPS.notes)
      if (isObj(d.splitInput) && Array.isArray(d.splitInput.items))
        d.splitInput = {
          ...d.splitInput,
          items: await Promise.all(
            d.splitInput.items.map(async (it: unknown) => (isObj(it) ? { ...it, name: await sealField(k, it.name, CAPS.description) } : it)),
          ),
        }
      if ('dispute' in d) d.dispute = await sealMap(k, d.dispute, 'reason', CAPS.reason)
      break
    case 'settlement':
      await f('note', CAPS.note)
      if (isObj(d.flag)) d.flag = { ...d.flag, reason: await sealField(k, d.flag.reason, CAPS.reason) }
      break
    case 'comment':
      await f('text', CAPS.comment)
      await f('authorName', CAPS.authorName)
      break
    case 'chat':
      await f('text', CAPS.chat)
      await f('authorName', CAPS.authorName)
      if (isObj(d.replyTo))
        d.replyTo = {
          ...d.replyTo,
          text: await sealField(k, d.replyTo.text, CAPS.replyText),
          authorName: await sealField(k, d.replyTo.authorName, CAPS.authorName),
        }
      break
    case 'openItem':
      await f('title', CAPS.title)
      await f('icon', CAPS.emoji)
      await f('notes', CAPS.itemNotes)
      break
    case 'profile':
      // groups/{gid}/profiles/{uid}: who someone is and how to pay them. Badges, currency and
      // collect stay readable (the server copies badges; currency says nothing about who they are).
      await f('displayName', CAPS.memberName)
      await f('photoURL', CAPS.memberPhoto)
      if (isObj(d.payment)) d.payment = await sealField(k, JSON.stringify(d.payment), CAPS.payment)
      break
    case 'activity':
      await f('summary', CAPS.summary)
      await f('actorName', CAPS.actorName)
      if ('before' in d) d.before = await sealSnapshot(k, d.before)
      if ('after' in d) d.after = await sealSnapshot(k, d.after)
      break
  }
  // A missing optional field stays missing: sealField answers undefined for it.
  for (const key of Object.keys(d)) if (d[key] === undefined && !(key in doc)) delete d[key]
  return diff(doc, d)
}

/** The patch that opens every token in one document, any kind, any depth (turning private off). */
export async function openDoc(k: VaultKey, doc: Doc): Promise<Patch> {
  // A token that doesn't open with this group's key (damaged, or copied from another group) is left as it is.
  const opened = (await openDeep(doc, k, (t) => t)) as Doc
  // A profile copy's payment details were sealed as one JSON text: back to the map they were.
  if (isToken(doc.payment) && typeof opened.payment === 'string' && !isToken(opened.payment)) opened.payment = parsePayment(opened.payment)
  return diff(doc, opened)
}

const parsePayment = (s: string): unknown => {
  try {
    const v = JSON.parse(s)
    return isObj(v) ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * A person's profile copy for a private group (groups/{gid}/profiles/{uid}), sealed on their own
 * phone with the group's key: their name, photo link and payment details become tokens, so the
 * server and anyone without the key read nothing (docs/VAULT.md). The rules refuse anything else there.
 */
export async function sealProfileCopy<T extends object>(k: VaultKey, copy: T): Promise<T> {
  const patch = await sealDoc(k, 'profile', copy as Doc)
  return { ...copy, ...(patch ?? {}) }
}

/**
 * A private group's profile copy as members read it: opened with the key, or, without it (locked),
 * only the parts that were never sealed. A token never reaches a screen as a name or a UPI ID.
 */
export async function openProfileCopy<T extends object>(k: VaultKey | null, doc: T): Promise<T> {
  const out: Doc = { ...doc, ...((k && (await openDoc(k, doc as Doc))) ?? {}) }
  for (const key of ['displayName', 'photoURL', 'payment']) if (isToken(out[key])) delete out[key]
  if (!('displayName' in out)) out.displayName = ''
  return out as T
}

/**
 * A group that keeps someone from stopping private groups (vault op `stop`): a live private group
 * they made and are still in. Turning it off, deleting it or leaving it frees them; someone else's
 * private groups never count (those open with their own pattern).
 */
export function blocksStopping(g: { vault?: unknown; createdBy?: unknown; memberUids?: unknown; deletedAt?: unknown }, uid: string): boolean {
  return g.vault === true && g.createdBy === uid && Array.isArray(g.memberUids) && g.memberUids.includes(uid) && typeof g.deletedAt !== 'number'
}

/**
 * Whether private groups are on for someone, from the vault's own record of them
 * (users/{uid}/secrets/vault in functions/src/vault.ts, and the demo's). They start off; `start`
 * turns them on, `stop` off. From before they started off, a universal pattern or a private group
 * they made (`made`, counted as blocksStopping counts) is on, so nothing anyone had goes away.
 * Someone who stopped is off whatever they have.
 */
export function privateGroupsOn(person: { on?: unknown; off?: unknown; pattern?: unknown }, made?: number): boolean {
  if (person.off === true) return false
  return person.on === true || !!person.pattern || (made ?? 0) > 0
}

/**
 * Who else in a private group has no universal pattern (private groups off, or stopped), from the
 * uids that have one. While the group has no pattern of its own they can't open it; with one, they
 * open it only with that, so removing it locks them out. The asker is left out: they're being told.
 */
export function withoutUniversal(memberUids: string[], withUniversal: ReadonlySet<string>, asker: string): string[] {
  return memberUids.filter((u) => u !== asker && !withUniversal.has(u))
}
