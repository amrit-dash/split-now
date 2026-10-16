import type { ChatMessage, Expense, ExpenseComment, OpenItem, Settlement } from '@/types'
import { fitForToken, isToken, sealText, type VaultKey } from './vault-crypto'

/*
 * Which words of a private group are stored as tokens (docs/VAULT.md), and the field caps the
 * rules keep (a token must fit them, so the text is cut to fit first: plainBytesFor). Names of
 * people and of the group stay readable, so a locked group still shows who's in it. Amounts stay
 * readable to the server (reminders, budgets and the rules' checks need them); the app hides
 * them while a group is locked.
 */

export const CAPS = { description: 200, notes: 2000, note: 500, reason: 500, comment: 2000, chat: 1000, title: 120, itemNotes: 500 } as const

/** One text sealed: empty stays empty, and a token (copied from a stored document) is kept as it is. */
async function seal(k: VaultKey, s: string | undefined, cap: number): Promise<string | undefined> {
  if (!s || isToken(s)) return s
  return sealText(k, fitForToken(s, cap))
}

export async function sealExpense<E extends Partial<Pick<Expense, 'description' | 'notes' | 'splitInput' | 'dispute'>>>(k: VaultKey, e: E): Promise<E> {
  const out: E = { ...e }
  if (e.description !== undefined) out.description = (await seal(k, e.description, CAPS.description)) as string
  if (e.notes !== undefined) out.notes = await seal(k, e.notes, CAPS.notes)
  if (e.splitInput?.items)
    out.splitInput = {
      ...e.splitInput,
      items: await Promise.all(e.splitInput.items.map(async (it) => ({ ...it, name: (await seal(k, it.name, CAPS.description)) as string }))),
    }
  if (e.dispute)
    out.dispute = Object.fromEntries(
      await Promise.all(Object.entries(e.dispute).map(async ([u, f]) => [u, { ...f, reason: (await seal(k, f.reason, CAPS.reason)) as string }] as const)),
    )
  return out
}

export async function sealSettlement<S extends Partial<Pick<Settlement, 'note' | 'flag'>>>(k: VaultKey, s: S): Promise<S> {
  const out: S = { ...s }
  if (s.note !== undefined) out.note = await seal(k, s.note, CAPS.note)
  if (s.flag?.reason) out.flag = { ...s.flag, reason: await seal(k, s.flag.reason, CAPS.reason) }
  return out
}

export const sealReason = (k: VaultKey, r: string | undefined) => seal(k, r, CAPS.reason)

export async function sealComment<C extends Pick<ExpenseComment, 'text'>>(k: VaultKey, c: C): Promise<C> {
  return { ...c, text: (await seal(k, c.text, CAPS.comment)) as string }
}

export async function sealChat<M extends Partial<Pick<ChatMessage, 'text'>>>(k: VaultKey, m: M): Promise<M> {
  return m.text ? { ...m, text: await seal(k, m.text, CAPS.chat) } : m
}

export async function sealOpenItem<O extends Partial<Pick<OpenItem, 'title' | 'notes'>>>(k: VaultKey, o: O): Promise<O> {
  const out: O = { ...o }
  if (o.title !== undefined) out.title = (await seal(k, o.title, CAPS.title)) as string
  if (o.notes !== undefined) out.notes = await seal(k, o.notes, CAPS.itemNotes)
  return out
}
