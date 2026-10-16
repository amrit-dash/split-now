import type { ChatMessage, Expense, ExpenseComment, Group, OpenItem, Settlement } from '@/types'
import type { Repo } from './repo'
import { getVaultKey } from '@/lib/vault-keys'
import type { VaultKey } from '@/lib/vault-crypto'
import { sealChat, sealComment, sealExpense, sealOpenItem, sealReason, sealSettlement } from '@/lib/vault-fields'

/*
 * Private groups on the way in (docs/VAULT.md): every write that carries a private group's words
 * goes through here and leaves with them sealed (src/lib/vault-fields.ts), whichever repo is
 * underneath. The repos then build their activity lines from the sealed text, so those hold
 * tokens too. A private group that is locked on this device can't be written to at all.
 *
 * Which groups are private is learned from the groups passing through watchGroups / watchGroup
 * (and createGroup), so the check needs no extra read.
 */

export const LOCKED_WRITE = 'This private group is locked. Unlock it to make changes.'

export function withVault(inner: Repo): Repo {
  const vaults = new Set<string>()
  const note = (g: Pick<Group, 'id' | 'vault'> | null | undefined) => {
    if (g?.vault) vaults.add(g.id)
  }
  /** The key to seal with: null for an ordinary group; refuses while a private group is locked. */
  const keyFor = (groupId: string): VaultKey | null => {
    const k = getVaultKey(groupId)
    if (k) return k
    if (vaults.has(groupId)) throw new Error(LOCKED_WRITE)
    return null
  }
  return {
    ...inner,
    watchGroups: (uid: string, cb: Parameters<Repo['watchGroups']>[1]) =>
      inner.watchGroups(uid, (gs, m) => {
        for (const g of gs) note(g)
        cb(gs, m)
      }),
    watchGroup: (id: string, cb: Parameters<Repo['watchGroup']>[1]) =>
      inner.watchGroup(id, (g, m) => {
        note(g)
        cb(g, m)
      }),
    createGroup: async (g: Parameters<Repo['createGroup']>[0]) => {
      const id = await inner.createGroup(g)
      if (g.vault) vaults.add(id)
      return id
    },
    saveExpense: async (e: Expense, opts?: Parameters<Repo['saveExpense']>[1]) => {
      const k = keyFor(e.groupId)
      return inner.saveExpense(k ? await sealExpense(k, e) : e, opts)
    },
    saveRecurringOccurrences: async (template: Expense, occurrences: Expense[]) => {
      // Catch-up copies the stored template (its tokens as they are); sealing keeps tokens unchanged.
      const k = getVaultKey(template.groupId)
      if (!k) return inner.saveRecurringOccurrences(template, occurrences)
      return inner.saveRecurringOccurrences(await sealExpense(k, template), await Promise.all(occurrences.map((o) => sealExpense(k, o))))
    },
    flagExpense: async (group: Group, expense: Expense, reason: string) => {
      const k = keyFor(group.id)
      return k ? inner.flagExpense(group, await sealExpense(k, expense), (await sealReason(k, reason)) ?? reason) : inner.flagExpense(group, expense, reason)
    },
    resolveFlag: async (group: Group, expense: Expense) => {
      const k = keyFor(group.id)
      return inner.resolveFlag(group, k ? await sealExpense(k, expense) : expense)
    },
    approveExpense: async (group: Group, expense: Expense) => {
      const k = keyFor(group.id)
      return inner.approveExpense(group, k ? await sealExpense(k, expense) : expense)
    },
    saveSettlement: async (s: Settlement, opts?: Parameters<Repo['saveSettlement']>[1]) => {
      const k = keyFor(s.groupId)
      return inner.saveSettlement(k ? await sealSettlement(k, s) : s, opts)
    },
    flagPayment: async (groupId: string, id: string, reason?: string) => {
      const k = keyFor(groupId)
      return inner.flagPayment(groupId, id, k ? await sealReason(k, reason) : reason)
    },
    saveOpenItem: async (item: OpenItem) => {
      const k = keyFor(item.groupId)
      return inner.saveOpenItem(k ? await sealOpenItem(k, item) : item)
    },
    postChat: async (groupId: string, m: Omit<ChatMessage, 'id' | 'pending'>, id?: string) => {
      const k = keyFor(groupId)
      return inner.postChat(groupId, k ? await sealChat(k, m) : m, id)
    },
    editChat: async (groupId: string, id: string, edit: { text: string; mentions: string[] }) => {
      const k = keyFor(groupId)
      return inner.editChat(groupId, id, k ? await sealChat(k, edit) : edit)
    },
    addComment: async (groupId: string, expenseId: string, c: Omit<ExpenseComment, 'id'>) => {
      const k = keyFor(groupId)
      return inner.addComment(groupId, expenseId, k ? await sealComment(k, c) : c)
    },
  }
}
