import type { ChatMessage, Expense, ExpenseComment, OpenItem, Settlement } from '@/types'
import { fitForToken, isToken, sealText, type VaultKey } from './vault-crypto'
import { CAPS } from '../../shared/vault-convert'

export { CAPS }

/*
 * Which words of a private group are stored as tokens (docs/VAULT.md), and the field caps the
 * rules keep (shared/vault-convert.ts CAPS; a token must fit them, so the text is cut to fit first:
 * plainBytesFor). People's names are sealed too where a document copies them (a comment's or a
 * message's author); the group's own name and people are sealed in the group document (vault-repo).
 * Amounts stay readable to the server (reminders, budgets and the rules' checks need them); the
 * app hides them while a group is locked.
 */

/** One text sealed: empty stays empty, and a token (copied from a stored document) is kept as it is. */
async function seal(k: VaultKey, s: string | undefined, cap: number): Promise<string | undefined> {
  if (!s || isToken(s)) return s
  return sealText(k, fitForToken(s, cap))
}

export async function sealExpense<E extends Partial<Pick<Expense, 'description' | 'icon' | 'notes' | 'splitInput' | 'dispute'>>>(
  k: VaultKey,
  e: E,
): Promise<E> {
  const out: E = { ...e }
  if (e.description !== undefined) out.description = (await seal(k, e.description, CAPS.description)) as string
  // a chosen icon says what it was for (🍺) as plainly as the words do
  if (e.icon !== undefined) out.icon = await seal(k, e.icon, CAPS.emoji)
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

export async function sealComment<C extends Pick<ExpenseComment, 'text'> & Partial<Pick<ExpenseComment, 'authorName'>>>(k: VaultKey, c: C): Promise<C> {
  const out: C = { ...c, text: (await seal(k, c.text, CAPS.comment)) as string }
  if (c.authorName !== undefined) out.authorName = (await seal(k, c.authorName, CAPS.authorName)) as string
  return out
}

export async function sealChat<M extends Partial<Pick<ChatMessage, 'text' | 'authorName' | 'replyTo'>>>(k: VaultKey, m: M): Promise<M> {
  const out: M = { ...m }
  if (m.text) out.text = await seal(k, m.text, CAPS.chat)
  if (m.authorName) out.authorName = await seal(k, m.authorName, CAPS.authorName)
  // A reply quotes the message it answers: its snippet and author are words of the group too.
  if (m.replyTo)
    out.replyTo = {
      ...m.replyTo,
      text: (await seal(k, m.replyTo.text, CAPS.replyText)) as string,
      authorName: (await seal(k, m.replyTo.authorName, CAPS.authorName)) as string,
    }
  return out
}

export async function sealOpenItem<O extends Partial<Pick<OpenItem, 'title' | 'icon' | 'notes'>>>(k: VaultKey, o: O): Promise<O> {
  const out: O = { ...o }
  if (o.title !== undefined) out.title = (await seal(k, o.title, CAPS.title)) as string
  // its icon says what it was for as plainly as the title does (as an expense's)
  if (o.icon !== undefined) out.icon = await seal(k, o.icon, CAPS.emoji)
  if (o.notes !== undefined) out.notes = await seal(k, o.notes, CAPS.itemNotes)
  return out
}
