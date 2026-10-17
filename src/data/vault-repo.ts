import type { ChatMessage, Expense, ExpenseComment, Group, OpenItem, Settlement } from '@/types'
import type { Repo } from './repo'
import { getVaultKey, onVaultChange } from '@/lib/vault-keys'
import { openBytes, sealBytes, type VaultKey } from '@/lib/vault-crypto'
import { CAPS, sealChat, sealComment, sealExpense, sealOpenItem, sealReason, sealSettlement } from '@/lib/vault-fields'
import { sealField } from '../../shared/vault-convert'

/*
 * Private groups on the way in (docs/VAULT.md): every write that carries a private group's words
 * goes through here and leaves with them sealed (src/lib/vault-fields.ts), whichever repo is
 * underneath. The repos then build their activity lines from the sealed text, so those hold
 * tokens too. A private group that is locked on this device can't be written to at all.
 *
 * Which groups are private is learned from the groups passing through watchGroups / watchGroup
 * (and createGroup), so the check needs no extra read. Those snapshots are the stored documents,
 * names still sealed; every write that takes a group is handed that stored copy rather than the
 * opened one a screen holds, so an opened (or, while locked, scrambled) name can never be written
 * back over its token. Sealing is deterministic, so the stored copy is what sealing the opened one
 * would make anyway.
 */

export const LOCKED_WRITE = 'This private group is locked. Unlock it to make changes.'

export function withVault(inner: Repo): Repo {
  const vaults = new Set<string>()
  const stored = new Map<string, Group>()
  const note = (g: Group | null | undefined) => {
    if (!g) return
    // A group turned private or plain again (vault op `convert`) is learned from its next snapshot.
    if (!g.vault) {
      vaults.delete(g.id)
      stored.delete(g.id)
      return
    }
    vaults.add(g.id)
    stored.set(g.id, g)
  }
  /** The group as stored (its names sealed), for a write: a private group's stored copy, any other group as given. */
  const raw = (g: Group): Group => (g.vault ? (stored.get(g.id) ?? g) : g)
  const sealName = async (k: VaultKey | null, v: string | undefined, cap: number) => (k ? ((await sealField(k, v, cap)) as string | undefined) : v)
  /** The key to seal with: null for an ordinary group; refuses while a private group is locked. */
  const keyFor = (groupId: string): VaultKey | null => {
    const k = getVaultKey(groupId)
    if (k) return k
    if (vaults.has(groupId)) throw new Error(LOCKED_WRITE)
    return null
  }
  /** A photo sealed with `k` before it leaves the phone. */
  const sealer = (k: VaultKey) => async (b: Blob) => new Blob([(await sealBytes(k, new Uint8Array(await b.arrayBuffer()))) as BlobPart], { type: 'image/jpeg' })
  // Opened photos, by group and path, until the group locks (the bytes stay sealed in Storage).
  const opened = new Map<string, string>()
  onVaultChange((gid) => {
    for (const [key, url] of opened)
      if ((gid === null || key.startsWith(`${gid}:`)) && !(gid && getVaultKey(gid))) {
        URL.revokeObjectURL(url)
        opened.delete(key)
      }
  })

  return {
    ...inner,
    attachReceipt: (groupId: string, expenseId: string, file: Blob, opts?: { slot?: 'scan' | 'attached' }) => {
      const k = keyFor(groupId)
      return inner.attachReceipt(groupId, expenseId, file, { ...(opts?.slot ? { slot: opts.slot } : {}), ...(k ? { seal: sealer(k) } : {}) })
    },
    async photoUrl(groupId: string, photo: { path?: string; url?: string }) {
      if (!vaults.has(groupId)) return inner.photoUrl(groupId, photo)
      const k = getVaultKey(groupId)
      const where = photo.path ?? photo.url
      if (!k || !where) return null
      const hit = opened.get(`${groupId}:${where}`)
      if (hit) return hit
      const bytes = await inner.fileBytes(where)
      const plain = bytes && (await openBytes(k, bytes))
      if (!plain) return null
      const url = URL.createObjectURL(new Blob([plain as BlobPart], { type: 'image/jpeg' }))
      opened.set(`${groupId}:${where}`, url)
      return url
    },
    async settleProofUrl(s: Parameters<Repo['settleProofUrl']>[0]) {
      if (!vaults.has(s.groupId)) return inner.settleProofUrl(s)
      return s.proofPath?.startsWith(`settleproofs/${s.groupId}/`) ? this.photoUrl(s.groupId, { path: s.proofPath }) : null
    },
    watchGroups: (uid: string, cb: Parameters<Repo['watchGroups']>[1]) =>
      inner.watchGroups(uid, (gs, m) => {
        for (const g of gs) note(g)
        cb(gs, m)
      }),
    watchDeletedGroups: (uid: string, cb: Parameters<Repo['watchDeletedGroups']>[1]) =>
      inner.watchDeletedGroups(uid, (gs, m) => {
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
    updateGroupSettings: async (base: Group, patch: Parameters<Repo['updateGroupSettings']>[1]) => {
      const k = base.vault ? keyFor(base.id) : null
      const sealed = { ...patch }
      if (patch.name !== undefined) sealed.name = await sealName(k, patch.name, CAPS.groupName)
      if (patch.emoji !== undefined) sealed.emoji = await sealName(k, patch.emoji, CAPS.emoji)
      return inner.updateGroupSettings(raw(base), sealed)
    },
    addMember: async (group: Group, memberId: string, member: Parameters<Repo['addMember']>[2]) => {
      const k = group.vault ? keyFor(group.id) : null
      return inner.addMember(raw(group), memberId, {
        ...member,
        name: (await sealName(k, member.name, CAPS.memberName)) ?? member.name,
        ...(member.photoURL ? { photoURL: await sealName(k, member.photoURL, CAPS.memberPhoto) } : {}),
      })
    },
    updateOwnMember: async (group: Group, memberId: string, patch: Parameters<Repo['updateOwnMember']>[2]) => {
      const k = group.vault ? keyFor(group.id) : null
      const sealed = { ...patch }
      if (patch.name !== undefined) sealed.name = (await sealName(k, patch.name, CAPS.memberName)) ?? patch.name
      // a person's photo link names who they are, so it is sealed too
      if (patch.photoURL) sealed.photoURL = await sealName(k, patch.photoURL, CAPS.memberPhoto)
      return inner.updateOwnMember(raw(group), memberId, sealed)
    },
    refreshInviteName: (group: Group) => inner.refreshInviteName(raw(group)),
    setArchived: (group: Group, on: boolean) => inner.setArchived(raw(group), on),
    removeMember: (group: Group, memberId: string) => inner.removeMember(raw(group), memberId),
    deleteGroup: (group: Group) => inner.deleteGroup(raw(group)),
    restoreGroup: (group: Group) => inner.restoreGroup(raw(group)),
    mergeMembers: (group: Group, from: string, into: string) => inner.mergeMembers(raw(group), from, into),
    decideMerge: (group: Group, requestId: string, approve: boolean) => inner.decideMerge(raw(group), requestId, approve),
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
      return k
        ? inner.flagExpense(raw(group), await sealExpense(k, expense), (await sealReason(k, reason)) ?? reason)
        : inner.flagExpense(group, expense, reason)
    },
    resolveFlag: async (group: Group, expense: Expense) => {
      const k = keyFor(group.id)
      return inner.resolveFlag(raw(group), k ? await sealExpense(k, expense) : expense)
    },
    approveExpense: async (group: Group, expense: Expense) => {
      const k = keyFor(group.id)
      return inner.approveExpense(raw(group), k ? await sealExpense(k, expense) : expense)
    },
    saveSettlement: async (s: Settlement, opts?: Parameters<Repo['saveSettlement']>[1]) => {
      const k = keyFor(s.groupId)
      return inner.saveSettlement(k ? await sealSettlement(k, s) : s, k && opts?.proof ? { ...opts, seal: sealer(k) } : opts)
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
