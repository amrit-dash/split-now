import { blobToDataUrl } from '@/lib/image'
import { archiveWrite, expenseMemberIds, isArchivedFor, uidsOfMembers, unarchiveInvolved } from '../../shared/archive'
import type { ActivityEntry, Capture, Expense, ExpenseComment, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, todayISO, uid } from '@/lib/id'
import { inboxToDraft, newCaptureToken } from '@/lib/capture'
import { downscale } from '@/lib/image'
import { isExpired, TABLE_TTL_MS, type LiveTable } from '@/lib/table'
import {
  disputeActivity,
  expenseEventActivity,
  expenseSaveActivity,
  groupSettingsActivity,
  importActivity,
  memberActivity,
  settlementActivity,
  type NewActivity,
} from '@/lib/activity'
import { editAutoApproved } from '@/lib/approval'
import { prepareExpenseSave, prepareImportedSettlement, prepareOccurrence } from '@/lib/trust'
import {
  activityCtxFor,
  byCreatedDesc,
  byDateDesc,
  changedSettings,
  compact,
  draftToCapture,
  errorChannel,
  groupDeleteBlocker,
  memberProfileOf,
  placeholdersOf,
  type AuthUser,
  type CaptureToken,
  type Repo,
  type SnapMeta,
  type TablePatch,
} from './repo'
import { seedDemo } from './seed'
import { defaultCurrency } from '@/lib/locale'
import type { MerchantMemory } from '@/lib/merchants'
import { netBalances } from '@/lib/balances'
import { isRemoved } from '@/lib/members'
import { countedExpenses, countedSettlements, prepareSettlementSave } from '@/lib/trust'
import { formatMoney, minorDigits } from '@/lib/money'
import { claimStatus, claimSummary, markPaidPatch, payLinkState, planRecord, planRecordParts, sortClaims, triggerAction, type PayLinkDoc } from '@/lib/paylinks'

/**
 * Demo-mode repository. Everything lives in this browser's localStorage, so the app
 * can be used and evaluated before Firebase is connected. Not multi-user.
 *
 * It mirrors the Firebase repo's observable behaviour where that is cheap: writes resolve at
 * once and a refusal (not found, not allowed) is reported through onError rather than thrown,
 * watchers report a server-equivalent SnapMeta, and the same edge cases (double trash, joining
 * twice, personal groups without an invite) end the same way.
 */
interface State {
  user: AuthUser | null
  profiles: Record<string, UserProfile>
  groups: Record<string, Group>
  expenses: Record<string, Expense>
  settlements: Record<string, Settlement>
  comments?: Record<string, StoredComment>
  activity?: Record<string, ActivityEntry>

  /** captures keyed by id, tagged with the owner's uid */
  captures: Record<string, Capture & { owner: string }>
  captureTokens: Record<string, CaptureToken>
  /** live tables keyed by code */
  tables?: Record<string, LiveTable>
  /** merchant → category memory per user (users/{uid}/settings/merchants in Firebase) */
  merchants?: Record<string, MerchantMemory>
  /** Pay me links keyed by code */
  payLinks?: Record<string, PayLinkDoc>
  /** payment screenshots by Storage-style path (small data: URLs) */
  payProofs?: Record<string, string>
}

type StoredComment = ExpenseComment & { groupId: string; expenseId: string }

const KEY = 'splitit-demo-v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { captures: {}, captureTokens: {}, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return { user: null, profiles: {}, groups: {}, expenses: {}, settlements: {}, captures: {}, captureTokens: {} }
}

export function createLocalRepo(): Repo {
  let state = load()
  state.comments ??= {}
  const comments = () => (state.comments ??= {})
  const activity = () => (state.activity ??= {})
  const me = () => {
    const u = state.user
    return { uid: u?.uid ?? 'me', name: state.profiles[u?.uid ?? '']?.displayName ?? u?.displayName ?? 'You' }
  }
  const ctx = (groupId: string, item?: object) => activityCtxFor(state.groups[groupId], me(), item)
  const log = (groupId: string, a: NewActivity | null) => {
    if (!a) return
    const id = uid('a_')
    activity()[id] = { ...a, id, groupId }
  }
  const actor = () => me().uid
  type DemoNudge = { groupId: string; memberId: string; debtorUid: string; currency: string; owed: number; owes: number }
  /** One group of a demo nudge: who, and what is owed each way (the server's nudgeAmount), or why not. */
  const demoNudge = (groupId: string, memberId: string, amount?: number): DemoNudge | { reason: 'not_member' | 'rate_limited' } => {
    const g = state.groups[groupId]
    if (!g) throw new Error('Group not found')
    const myId = Object.entries(g.members).find(([, m]) => m.uid === actor())?.[0]
    if (!myId) throw new Error('Not a member of this group')
    const debtorUid = g.members[memberId]?.uid
    if (!debtorUid || !g.memberUids.includes(debtorUid) || debtorUid === actor()) return { reason: 'not_member' }
    // Once a day per person and group, read from the feed like the app's "nudged today".
    const day = Date.now() - 86_400_000
    if (
      Object.values(activity()).some(
        (a) => a.groupId === groupId && a.type === 'settlement.nudged' && a.actorUid === actor() && a.targetId === memberId && a.createdAt > day,
      )
    )
      return { reason: 'rate_limited' }
    const expenses = countedExpenses(
      Object.values(state.expenses).filter((e) => e.groupId === groupId),
      g,
    )
    const settlements = countedSettlements(
      Object.values(state.settlements).filter((x) => x.groupId === groupId),
      g,
    )
    const net = netBalances(expenses, settlements)
    const cap = Math.max(0, Math.min(-(net[memberId] ?? 0), net[myId] ?? 0))
    const owes = Math.max(0, Math.min(-(net[myId] ?? 0), net[memberId] ?? 0))
    return { groupId, memberId, debtorUid, currency: g.currency, owed: Math.min(amount && amount > 0 ? amount : cap, cap), owes }
  }
  const logNudge = (n: DemoNudge, amount: number, total?: number) => {
    const g = state.groups[n.groupId]
    const name = me().name
    const id = uid('a_')
    activity()[id] = {
      id,
      groupId: n.groupId,
      type: 'settlement.nudged',
      actorUid: actor(),
      actorName: name,
      targetId: n.memberId,
      summary: `${name} nudged ${g.members[n.memberId]?.name ?? 'someone'} to settle up (${formatMoney(amount, g.currency)})`,
      after: total === undefined ? { amount, memberId: n.memberId } : { amount, memberId: n.memberId, total },
      createdAt: Date.now(),
    }
  }
  const listeners = new Set<() => void>()
  const commit = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
    for (const l of listeners) l()
  }
  // Another tab changed the demo data (e.g. a second "phone" at a live table): reload and notify.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return
      state = load()
      state.comments ??= {}
      for (const l of listeners) l()
    })
  }
  const tables = () => (state.tables ??= {})
  /** Demo stand-in for the security rules: guests can only write to open, unexpired tables. */
  const openTable = (code: string) => {
    const t = tables()[code]
    if (!t) throw new Error('Table not found')
    if (t.status !== 'open' || isExpired(t)) throw new Error('This table is closed')
    return t
  }
  // Everything is local and final, so a watcher's data is never "from cache" or pending.
  const META: SnapMeta = { fromCache: false, hasPendingWrites: false }
  const watch = <T>(select: () => T, cb: (v: T, meta?: SnapMeta) => void) => {
    let last = ''
    const run = () => {
      const v = select()
      const s = JSON.stringify(v)
      if (s !== last) {
        last = s
        cb(v, META)
      }
    }
    listeners.add(run)
    queueMicrotask(run)
    return () => {
      listeners.delete(run)
    }
  }
  // `archived` is personal: derived for the signed-in person on read (shared/archive.ts), as Firebase does.
  const asGroup = (g: Group): Group => ({ ...g, archived: isArchivedFor(g, me().uid) })
  // A new expense or payment brings the group back for the people in it (the onExpenseCreated /
  // onSettlementCreated triggers do this in Firebase).
  const unarchiveFor = (groupId: string, memberIds: string[]) => {
    const g = state.groups[groupId]
    if (!g) return
    const w = unarchiveInvolved(g, uidsOfMembers(g.members, memberIds, g.memberUids))
    if (!w) return
    const { archived: _legacy, ...rest } = g
    state.groups[groupId] =
      'remove' in w ? { ...g, archivedBy: (g.archivedBy ?? []).filter((u) => !w.remove.includes(u)) } : { ...rest, archivedBy: w.convert.archivedBy }
  }
  const touch = (groupId: string) => {
    const g = state.groups[groupId]
    if (g) state.groups[groupId] = { ...g, updatedAt: Date.now() }
  }

  const errors = errorChannel()
  /** Like a rejected Firestore batch: the call resolves, the refusal arrives through onError. */
  const refuse = (context: string, message: string) => queueMicrotask(() => errors.emit('write', new Error(message), context))

  /** Demo stand-in for the onPayLinkPaid trigger: what the server does when a link changes. */
  const payLinkChanged = (code: string, before: PayLinkDoc, after: PayLinkDoc, now: number) => {
    state.payLinks ??= {}
    state.payLinks[code] = after
    const action = triggerAction(before, after)
    const fmt = (m: number) => formatMoney(m, after.currency)
    if (action === 'claimed' && after.groupId && state.groups[after.groupId]) {
      log(after.groupId, {
        type: 'settlement.claimed',
        actorUid: after.paidBy ?? after.createdBy,
        actorName: after.payerName,
        targetId: code,
        summary: claimSummary(after, fmt),
        after: { amount: after.amount, from: after.from, to: after.to },
        createdAt: now,
      })
      return
    }
    if (action !== 'record') return
    if (after.parts?.length) {
      // Another currency or several groups: a payment per group, as the server's recordParts does.
      const parts = planRecordParts(code, after, state.groups, todayISO(now), now, formatMoney, minorDigits)
      for (const r of parts.records) {
        state.settlements[r.settlementId] = { id: r.settlementId, ...r.settlement }
        log(r.settlement.groupId, {
          type: 'settlement.created',
          actorUid: after.paidBy ?? after.createdBy,
          actorName: after.payerName,
          targetId: r.settlementId,
          summary: r.summary,
          after: { amount: r.settlement.amount, from: r.settlement.from, to: r.settlement.to, payLink: code },
          createdAt: now,
        })
        touch(r.settlement.groupId)
      }
      state.payLinks[code] = { ...after, settlementId: parts.records[0]?.settlementId, recordedAt: now }
      return
    }
    const g = after.groupId ? state.groups[after.groupId] : undefined
    const plan = planRecord(code, after, g, todayISO(now), now, fmt)
    if (plan.kind === 'record') {
      state.settlements[plan.settlementId] = { id: plan.settlementId, ...plan.settlement }
      log(plan.settlement.groupId, {
        type: 'settlement.created',
        actorUid: after.paidBy ?? after.createdBy,
        actorName: after.payerName,
        targetId: plan.settlementId,
        summary: plan.summary,
        after: { amount: after.amount, from: after.from, to: after.to, payLink: code },
        createdAt: now,
      })
      touch(plan.settlement.groupId)
      state.payLinks[code] = { ...after, settlementId: plan.settlementId, recordedAt: now }
    } else if (plan.kind === 'notify') state.payLinks[code] = { ...after, recordedAt: now }
  }

  const repo: Repo = {
    mode: 'demo',
    onError: errors.on,

    onAuth: (cb) => watch(() => state.user, cb),
    async signInDemo(name) {
      const user: AuthUser = { uid: 'me', displayName: name || 'You' }
      state = { ...state, user }
      if (!state.profiles.me) {
        state.profiles.me = { uid: 'me', displayName: user.displayName, currency: defaultCurrency(), payment: { upi: 'you@okaxis', phone: '+91 98765 43210' } }
        Object.assign(state, seedDemo(state, user))
      }
      commit()
    },
    async signInWithGoogle() {
      throw new Error('Connect Firebase to enable Google sign-in')
    },
    async signInWithEmail() {
      throw new Error('Connect Firebase to enable email sign-in')
    },
    async signUpWithEmail() {
      throw new Error('Connect Firebase to enable email sign-in')
    },
    async signOut() {
      state = { ...state, user: null }
      commit()
    },

    watchProfile: (id, cb) => watch(() => state.profiles[id] ?? null, cb),
    async saveProfile(p) {
      state.profiles[p.uid] = p
      if (state.user?.uid === p.uid) state.user = { ...state.user, displayName: p.displayName }
      commit()
    },
    async getProfile(id) {
      return state.profiles[id] ?? null
    },
    async getMemberProfile(groupId, id) {
      const p = state.groups[groupId]?.memberUids.includes(id) ? state.profiles[id] : undefined
      // The same shape the firebase repo shares (photo, currency and Collect in my currency included).
      return p ? { ...memberProfileOf(p), photoURL: p.photoURL } : null
    },
    async uploadAvatar(_uid, jpeg) {
      return blobToDataUrl(jpeg)
    },

    watchGroups: (userId, cb) =>
      watch(
        () =>
          Object.values(state.groups)
            .filter((g) => g.memberUids.includes(userId))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(asGroup),
        cb,
      ),
    watchGroup: (id, cb) => watch(() => (state.groups[id] ? asGroup(state.groups[id]) : null), cb),
    async createGroup(g) {
      const id = uid('g_')
      state.groups[id] = { ...g, id, inviteCode: inviteCode(), createdAt: Date.now(), updatedAt: Date.now() }
      commit()
      return id
    },
    async updateGroupSettings(base, patch) {
      const g = state.groups[base.id]
      const changed = changedSettings(base, patch)
      if (!g || !Object.keys(changed).length) return
      const next: Record<string, unknown> = { ...g, ...changed, updatedAt: Date.now() }
      for (const [k, v] of Object.entries(changed)) if (v === undefined) delete next[k]
      state.groups[base.id] = next as unknown as Group
      if (base.type !== 'personal') log(base.id, groupSettingsActivity(base, { ...base, ...changed }, ctx(base.id)))
      commit()
    },
    async setArchived(group, on) {
      const g = state.groups[group.id]
      const w = g && archiveWrite(g, me().uid, on)
      if (!g || !w) return
      const { archived: _legacy, ...rest } = g
      state.groups[group.id] =
        'add' in w
          ? { ...g, archivedBy: [...(g.archivedBy ?? []), w.add] }
          : 'remove' in w
            ? { ...g, archivedBy: (g.archivedBy ?? []).filter((u) => u !== w.remove) }
            : { ...rest, archivedBy: w.convert.archivedBy }
      commit()
    },
    async updateGroup(id, patch) {
      const { members: _m, memberUids: _u, ...rest } = patch
      const g = state.groups[id]
      if (g) await repo.updateGroupSettings(g, rest)
    },
    async addMember(group, memberId, member) {
      const g = state.groups[group.id]
      if (!g) return
      const former = g.members[memberId]
      if (isRemoved(former)) {
        // Back in as a placeholder, like Firebase (an account rejoins through the invite).
        const { removedAt: _r, uid: _u, ...rest } = former
        state.groups[group.id] = { ...g, members: { ...g.members, [memberId]: rest }, updatedAt: Date.now() }
        log(group.id, memberActivity('added', memberId, former.name, ctx(group.id)))
        commit()
        return
      }
      state.groups[group.id] = {
        ...g,
        members: { ...g.members, [memberId]: member },
        memberUids: member.uid ? [...new Set([...g.memberUids, member.uid])] : g.memberUids,
        updatedAt: Date.now(),
      }
      log(group.id, memberActivity('added', memberId, member.name, ctx(group.id)))
      commit()
    },
    async updateOwnMember(group, memberId, patch) {
      const g = state.groups[group.id]
      const m = g?.members[memberId]
      if (!g || !m || m.uid !== actor()) return
      const { photoURL: _old, ...rest } = m
      state.groups[group.id] = {
        ...g,
        members: { ...g.members, [memberId]: { ...rest, name: patch.name, ...(patch.photoURL ? { photoURL: patch.photoURL } : {}) } },
      }
      commit()
    },
    async removeMember(group, memberId) {
      const g = state.groups[group.id]
      if (!g) return
      const removed = g.members[memberId]
      if (!removed || isRemoved(removed)) return
      log(group.id, memberActivity('removed', memberId, removed.name, ctx(group.id), removed.uid === actor()))
      // A soft remove, as in Firebase: the entry stays with removedAt so history keeps the name.
      state.groups[group.id] = {
        ...g,
        members: { ...g.members, [memberId]: { ...removed, removedAt: Date.now() } },
        memberUids: g.memberUids.filter((u) => u !== removed.uid),
        updatedAt: Date.now(),
      }
      commit()
    },
    async deleteGroup(id) {
      const g = state.groups[id]
      if (!g) return
      const blocker = groupDeleteBlocker(g, me().uid)
      if (blocker) throw new Error(blocker)
      delete state.groups[id]
      for (const [k, e] of Object.entries(state.expenses)) if (e.groupId === id) delete state.expenses[k]
      for (const [k, s] of Object.entries(state.settlements)) if (s.groupId === id) delete state.settlements[k]
      for (const [k, c] of Object.entries(comments())) if (c.groupId === id) delete comments()[k]
      for (const [k, a] of Object.entries(activity())) if (a.groupId === id) delete activity()[k]
      commit()
    },

    async getInvite(code) {
      // Personal groups have no invite (Firebase never writes one for them).
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase() && x.type !== 'personal')
      return g ? { groupId: g.id, groupName: g.name, emoji: g.emoji, placeholders: placeholdersOf(g) } : null
    },
    async joinGroup(code, memberId, member) {
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase())
      if (!g) throw new Error('Invite not found')
      if (member.uid && g.memberUids.includes(member.uid)) return g.id
      state.groups[g.id] = {
        ...g,
        memberUids: [...new Set([...g.memberUids, member.uid!])],
        members: { ...g.members, [memberId]: member },
        updatedAt: Date.now(),
      }
      commit()
      return g.id
    },

    watchExpenses: (groupId, cb) =>
      watch(
        () =>
          Object.values(state.expenses)
            .filter((e) => e.groupId === groupId)
            .sort(byDateDesc),
        cb,
      ),
    async saveExpense(e) {
      const prev = state.expenses[e.id]
      const g = state.groups[e.groupId]
      const next = prepareExpenseSave(prev, e, g, actor())
      const autoApproved = !!prev && !!g && editAutoApproved({ group: g, before: prev, after: next })
      state.expenses[e.id] = next
      if (!prev) unarchiveFor(e.groupId, expenseMemberIds(next))
      log(e.groupId, expenseSaveActivity(prev, next, ctx(e.groupId, next), { autoApprovedWithin: autoApproved ? g?.editAutoApprove : undefined }))
      touch(e.groupId)
      commit()
    },
    async deleteExpense(groupId, id) {
      const e = state.expenses[id]
      if (!e || e.deletedAt) return
      state.expenses[id] = { ...e, deletedAt: Date.now(), deletedBy: actor() }
      log(groupId, expenseEventActivity('deleted', e, ctx(groupId, e)))
      touch(groupId)
      commit()
    },
    async restoreExpense(groupId, id) {
      const e = state.expenses[id]
      if (!e?.deletedAt) return
      const { deletedAt: _t, deletedBy: _b, ...rest } = e
      state.expenses[id] = rest
      log(groupId, expenseEventActivity('restored', rest, ctx(groupId, e)))
      touch(groupId)
      commit()
    },
    async purgeExpense(groupId, id) {
      const e = state.expenses[id]
      if (!e) return
      const g = state.groups[groupId]
      if (g && e.deletedBy !== actor() && g.createdBy !== actor())
        return refuse('Deleting expense', 'only the person who deleted it, or the group creator, can delete it forever')
      delete state.expenses[id]
      for (const [k, c] of Object.entries(comments())) if (c.expenseId === id) delete comments()[k]
      log(groupId, expenseEventActivity('purged', e, ctx(groupId, e)))
      commit()
    },
    async flagExpense(group, expense, reason) {
      const e = state.expenses[expense.id]
      const memberId = Object.entries(group.members).find(([, m]) => m.uid === actor())?.[0]
      if (!memberId) throw new Error('You are not a member of this group')
      if (!e) return
      const text = reason.trim().slice(0, 500) || 'Something looks wrong'
      state.expenses[e.id] = { ...e, dispute: { ...e.dispute, [actor()]: { byUid: actor(), memberId, reason: text, at: Date.now() } } }
      log(group.id, disputeActivity('disputed', e, ctx(group.id, e), text))
      commit()
    },
    async resolveFlag(group, expense) {
      const e = state.expenses[expense.id]
      if (!e?.dispute?.[actor()]) return
      const { [actor()]: _f, ...rest } = e.dispute
      state.expenses[e.id] = { ...e, dispute: rest }
      log(group.id, disputeActivity('resolved', e, ctx(group.id, e)))
      commit()
    },
    async approveExpense(group, expense) {
      const e = state.expenses[expense.id]
      if (!e) return
      state.expenses[e.id] = { ...e, approvals: { ...e.approvals, [actor()]: true } }
      log(group.id, disputeActivity('approved', e, ctx(group.id, e)))
      commit()
    },
    attachReceipt(_groupId, expenseId, file) {
      // Store a small data URL so the demo can show the receipt.
      downscale(file, 900, 0.7)
        .then(
          (blob) =>
            new Promise<string>((res, rej) => {
              const r = new FileReader()
              r.onload = () => res(String(r.result))
              r.onerror = rej
              r.readAsDataURL(blob)
            }),
        )
        .then((url) => {
          const e = state.expenses[expenseId]
          if (e) {
            state.expenses[expenseId] = { ...e, receiptUrl: url }
            commit()
          }
        })
        .catch((e) => errors.emit('write', e, 'Receipt attach failed'))
      return true
    },

    watchSettlements: (groupId, cb) =>
      watch(
        () =>
          Object.values(state.settlements)
            .filter((s) => s.groupId === groupId)
            .sort(byDateDesc),
        cb,
      ),
    async saveSettlement(input, opts) {
      const g = state.groups[input.groupId]
      let s = g ? prepareSettlementSave(input, g, actor()) : input
      if (opts?.proof) {
        // Kept on this device (no server here, so nothing checks it: it waits for the payee).
        const proofPath = `settleproofs/${s.groupId}/${s.id}.jpg`
        state.payProofs ??= {}
        state.payProofs[proofPath] = await blobToDataUrl(await downscale(opts.proof, 900, 0.7))
        s = { ...s, proofPath }
      }
      if (!state.settlements[s.id]) {
        log(s.groupId, settlementActivity('created', s, ctx(s.groupId)))
        unarchiveFor(s.groupId, [s.from, s.to])
      }
      state.settlements[s.id] = s
      touch(s.groupId)
      commit()
    },
    async confirmPayment(groupId, id) {
      const s = state.settlements[id]
      if (!s) return
      const { flag: _f, ...rest } = s
      state.settlements[id] = { ...rest, ok: { by: actor(), at: Date.now(), via: 'payee' } }
      log(groupId, settlementActivity('approved', s, ctx(groupId)))
      touch(groupId)
      commit()
    },
    async flagPayment(groupId, id, reason) {
      const s = state.settlements[id]
      if (!s) return
      const text = reason?.trim().slice(0, 500)
      const { ok: _o, ...rest } = s
      state.settlements[id] = { ...rest, flag: { by: actor(), at: Date.now(), ...(text ? { reason: text } : {}) } }
      log(groupId, settlementActivity('flagged', s, ctx(groupId), text))
      touch(groupId)
      commit()
    },
    async settleProofUrl(s) {
      return (s.proofPath && state.payProofs?.[s.proofPath]) || null
    },
    async deleteSettlement(groupId, id) {
      const s = state.settlements[id]
      if (!s || s.deletedAt) return
      state.settlements[id] = { ...s, deletedAt: Date.now(), deletedBy: actor() }
      log(groupId, settlementActivity('deleted', s, ctx(groupId)))
      touch(groupId)
      commit()
    },
    async restoreSettlement(groupId, id) {
      const s = state.settlements[id]
      if (!s?.deletedAt) return
      const { deletedAt: _t, deletedBy: _b, ...rest } = s
      state.settlements[id] = rest
      log(groupId, settlementActivity('restored', rest, ctx(groupId)))
      touch(groupId)
      commit()
    },
    async purgeSettlement(groupId, id) {
      const s = state.settlements[id]
      if (!s) return
      const g = state.groups[groupId]
      if (g && s.deletedBy !== actor() && g.createdBy !== actor())
        return refuse('Deleting payment', 'only the person who deleted it, or the group creator, can delete it forever')
      delete state.settlements[id]
      log(groupId, settlementActivity('purged', s, ctx(groupId)))
      commit()
    },

    watchActivity: (groupId, cb, max = 50) =>
      watch(
        () =>
          Object.values(activity())
            .filter((a) => a.groupId === groupId)
            .sort(byCreatedDesc)
            .slice(0, max),
        cb,
      ),
    watchHistory: (groupId, targetId, cb) =>
      watch(
        () =>
          Object.values(activity())
            .filter((a) => a.groupId === groupId && a.targetId === targetId)
            .sort(byCreatedDesc),
        cb,
      ),

    async uploadReceipt(_groupId, file) {
      const blob = await downscale(file, 900, 0.7)
      return new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = rej
        r.readAsDataURL(blob)
      })
    },

    async saveRecurringOccurrences(template, occurrences) {
      const current = state.expenses[template.id]
      if (!current) return
      for (const o of occurrences) state.expenses[o.id] = prepareOccurrence(o, state.groups[o.groupId] ?? {})
      state.expenses[template.id] = { ...current, recurrence: template.recurrence }
      if (occurrences.length) touch(template.groupId)
      commit()
    },

    async bulkImport(groupId, expenses, settlements) {
      const g = state.groups[groupId]
      if (!g) return refuse('Importing', 'group not found')
      for (const e of expenses) state.expenses[e.id] = prepareOccurrence({ ...e, groupId }, g)
      for (const s of settlements) state.settlements[s.id] = prepareImportedSettlement({ ...s, groupId })
      log(groupId, importActivity(groupId, expenses.length, settlements.length, expenses[0]?.importedFrom ?? settlements[0]?.importedFrom, ctx(groupId)))
      touch(groupId)
      commit()
    },

    watchComments: (groupId, expenseId, cb) =>
      watch(
        () =>
          Object.values(comments())
            .filter((c) => c.groupId === groupId && c.expenseId === expenseId)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(({ groupId: _g, expenseId: _e, ...c }) => c),
        cb,
      ),
    async addComment(groupId, expenseId, c) {
      const id = uid('c_')
      comments()[id] = { ...c, id, groupId, expenseId }
      commit()
    },
    async deleteComment(_g, _e, id) {
      delete comments()[id]
      commit()
    },

    watchCaptures: (userId, cb) =>
      watch(
        () =>
          Object.values(state.captures)
            .filter((c) => c.owner === userId)
            .map(({ owner: _, ...c }) => c)
            .sort(byCreatedDesc),
        cb,
      ),
    async saveCapture(userId, c) {
      state.captures[c.id] = { ...c, owner: userId }
      commit()
    },
    async updateCapture(userId, id, patch) {
      const c = state.captures[id]
      if (!c || c.owner !== userId) return refuse('Updating capture', 'capture not found')
      const next: Record<string, unknown> = { ...c, ...patch, updatedAt: Date.now() }
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k]
      state.captures[id] = next as unknown as Capture & { owner: string }
      commit()
    },
    async deleteCapture(userId, id) {
      if (state.captures[id]?.owner === userId) delete state.captures[id]
      commit()
    },

    watchMerchants: (userId, cb) => watch(() => state.merchants?.[userId] ?? null, cb),
    async saveMerchants(userId, memory) {
      state.merchants ??= {}
      state.merchants[userId] = memory
      commit()
    },
    async nudge(groupId, memberId, amount) {
      // No push in the demo: say it went out when it would have (they owe you), so the flow can be tried.
      const n = demoNudge(groupId, memberId, amount)
      if ('reason' in n) return { sent: false, reason: n.reason }
      if (n.owed <= 0) return { sent: false, reason: 'not_owed' }
      logNudge(n, n.owed)
      commit()
      return { sent: true, amount: n.owed }
    },
    async nudgeAcross(items) {
      // The callable's rules in miniature: one person, the groups' net in one currency, a feed entry per group they owe in.
      const all = items.map((it) => {
        try {
          return demoNudge(it.groupId, it.memberId, it.amount)
        } catch {
          return null
        }
      })
      const ok = all.filter((n): n is DemoNudge => !!n && !('reason' in n))
      if (all.some((n) => n && 'reason' in n && n.reason === 'rate_limited')) return { sent: false, reason: 'rate_limited' }
      const debtor = ok[0]?.debtorUid
      if (!debtor) return { sent: false, reason: 'not_member' }
      const first = ok.find((n) => n.debtorUid === debtor && n.owed > 0)
      if (!first) return { sent: false, reason: 'not_owed' }
      const same = ok.filter((n) => n.debtorUid === debtor && n.currency === first.currency)
      const total = same.reduce((t, n) => t + n.owed - n.owes, 0)
      if (!(total > 0)) return { sent: false, reason: 'not_owed' }
      const owed = same.filter((n) => n.owed > 0)
      for (const n of owed) logNudge(n, n.owed, owed.length > 1 ? total : undefined)
      commit()
      return { sent: true, amount: total, groups: owed.length }
    },

    watchCaptureTokens: (userId, cb) =>
      watch(
        () =>
          Object.values(state.captureTokens)
            .filter((t) => t.uid === userId)
            .sort(byCreatedDesc),
        cb,
      ),
    async createCaptureToken(userId, opts = {}) {
      const token = newCaptureToken()
      state.captureTokens[token] = compact({
        token,
        uid: userId,
        createdAt: Date.now(),
        groupId: opts.groupId || undefined,
        label: opts.label?.slice(0, 60) || undefined,
      })
      commit()
      return token
    },
    async revokeCaptureToken(token) {
      delete state.captureTokens[token]
      commit()
    },
    async submitToInbox(entry, id) {
      // Demo mode has no server inbox: validate the token and file the capture straight away.
      const t = state.captureTokens[entry.token]
      if (!t || t.uid !== entry.uid) throw new Error('Unknown capture token')
      const draft = inboxToDraft(entry, todayISO())
      if (!draft) throw new Error('No amount')
      const cid = id ?? uid('c_')
      state.captures[cid] = { ...draftToCapture(draft, cid), owner: t.uid }
      commit()
    },
    async claimInbox() {
      return 0
    },

    async createTable(t) {
      let code = inviteCode()
      while (tables()[code]) code = inviteCode()
      const now = Date.now()
      tables()[code] = { ...t, code, claims: {}, status: 'open', createdAt: now, expiresAt: now + TABLE_TTL_MS }
      commit()
      return code
    },
    watchTable: (code, cb) => watch(() => state.tables?.[code] ?? null, cb),
    async joinTable(code, pid, p) {
      const t = openTable(code)
      tables()[code] = { ...t, participants: { ...t.participants, [pid]: p } }
      commit()
    },
    async setTableClaims(code, pid, claims) {
      const t = openTable(code)
      if (!t.participants[pid]) throw new Error('Join the table first')
      tables()[code] = { ...t, claims: { ...t.claims, [pid]: claims } }
      commit()
    },
    async updateTable(code, patch) {
      const t = tables()[code]
      if (!t) throw new Error('Table not found')
      tables()[code] = applyTablePatch(t, patch)
      commit()
    },
    async deleteTable(code) {
      delete tables()[code]
      commit()
    },

    async createPayLink(code, link) {
      state.payLinks ??= {}
      state.payLinks[code] = { ...link, status: 'open' }
      commit()
    },
    watchPayLink: (code, cb) =>
      watch(() => {
        const l = state.payLinks?.[code]
        return l ? { ...l, code } : null
      }, cb),
    async markPayLinkPaid(code, claim, proof) {
      // Demo stand-in for the rules (open, unexpired) and the onPayLinkPaid trigger (record the
      // settlement in the group straight away, or log the claim for the host), so the whole flow
      // can be tried in one browser.
      const l = state.payLinks?.[code]
      if (!l) throw new Error('This Pay me link doesn’t exist')
      const now = Date.now()
      const st = payLinkState(l, now)
      if (st !== 'open')
        throw new Error(
          st === 'paid' ? 'This link is already marked paid' : st === 'claimed' ? 'Already marked paid, waiting for the host' : `This link is ${st}`,
        )
      let proofPath = claim.proofPath
      if (proof) {
        proofPath = `payproofs/${code}/${uid('p')}.jpg`
        state.payProofs ??= {}
        state.payProofs[proofPath] = await blobToDataUrl(await downscale(proof, 900, 0.7))
      }
      const after: PayLinkDoc = { ...l, ...markPaidPatch(code, { ...claim, proofPath }, state.user?.uid ?? 'guest', now, claimStatus(l, claim)) }
      payLinkChanged(code, l, after, now)
      commit()
    },
    watchClaimedPayLinks: (userId, cb) =>
      watch(
        () =>
          sortClaims(
            Object.entries(state.payLinks ?? {})
              .filter(([, l]) => l.createdBy === userId && l.status === 'claimed')
              .map(([code, l]) => ({ ...l, code })),
          ),
        cb,
      ),
    async confirmPayLinkClaim(code) {
      const l = state.payLinks?.[code]
      if (l?.status !== 'claimed') return
      if (l.createdBy !== actor()) return refuse('Confirming the payment', 'only the person who made the link can confirm it')
      payLinkChanged(code, l, { ...l, status: 'paid' }, Date.now())
      commit()
    },
    async dismissPayLinkClaim(code) {
      const l = state.payLinks?.[code]
      if (l?.status !== 'claimed') return
      if (l.createdBy !== actor()) return refuse('Dismissing the payment', 'only the person who made the link can dismiss it')
      const { paidAt: _a, paidBy: _b, method: _m, proofPath: _p, ...rest } = l
      state.payLinks![code] = { ...rest, status: 'open' }
      commit()
    },
    async cancelPayLink(code) {
      const l = state.payLinks?.[code]
      if (l?.status !== 'open') return
      state.payLinks![code] = { ...l, status: 'cancelled', cancelledAt: Date.now() }
      commit()
    },
    async payProofUrl(path) {
      return state.payProofs?.[path] ?? null
    },

    // No shared rates in demo mode: src/lib/fx.ts calls Frankfurter directly.
    async getFxRates() {
      return null
    },
    async refreshFx() {
      return null
    },
    async readReceiptAi() {
      return null
    },
    async parseTextAi() {
      return null
    },
    async quickAddAi(req) {
      // The server's reader isn't here: a small stand-in on the phone reads the "create a group …
      // and add …" shape (loaded on first use, with the Quick add grammar it builds on).
      const { demoQuickAi } = await import('@/lib/quick-ai-demo')
      return { result: demoQuickAi(req) }
    },
    async aiKey() {
      throw new Error('AI features aren’t available in the demo')
    },
    async aiModels() {
      return []
    },
    async aiStatus() {
      return null
    },
    watchAiState(_u, cb) {
      cb(null)
      return () => {}
    },
    watchAppAi(cb) {
      cb(null)
      return () => {}
    },
    async saveAppAi() {
      throw new Error('Not in the demo')
    },
    async aiUsage() {
      return null
    },
    // Demo: a fixed sample (no AI), dated relative to today, so the review flow can be tried.
    async readStatementAi(_images, today) {
      await new Promise((r) => setTimeout(r, 600))
      const day = (n: number) => {
        const d = new Date(today + 'T00:00:00')
        d.setDate(d.getDate() - n)
        return d.toLocaleDateString('en-CA')
      }
      return {
        statement: {
          currency: 'INR',
          transactions: [
            { date: day(1), name: 'SWIGGY INSTAMART', amount: 52100, direction: 'debit', kind: 'payment' },
            { date: day(2), name: 'Axis Bank ••••2697 to UPI Lite', amount: 50000, direction: 'debit', kind: 'self_transfer' },
            { date: day(2), name: 'Shree Panjurli Cafe', amount: 6000, direction: 'debit', kind: 'payment' },
            { date: day(2), name: 'RAJA S', amount: 8200, direction: 'debit', kind: 'payment', note: 'Paid for aradhi' },
            { date: day(2), name: 'Fresh Lemonade', amount: 7000, direction: 'debit', kind: 'payment' },
            { date: day(3), name: 'Md Minahaj Khan', amount: 32200, direction: 'credit', kind: 'payment' },
          ],
        },
      }
    },
  }
  return repo
}

function applyTablePatch(t: LiveTable, patch: TablePatch): LiveTable {
  const next: LiveTable = { ...t, items: { ...t.items }, participants: { ...t.participants }, claims: { ...t.claims } }
  for (const k of ['merchant', 'extras', 'taxSplit', 'status', 'expenseId', 'closedGroupId'] as const) {
    if (patch[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = patch[k]
  }
  if (patch.groupId !== undefined) {
    if (patch.groupId === null) delete next.groupId
    else next.groupId = patch.groupId
  }
  if (patch.payLinks) next.payLinks = { ...t.payLinks }
  for (const k of ['items', 'participants', 'claims', 'payLinks'] as const) {
    const target = next[k] as Record<string, unknown>
    for (const [id, v] of Object.entries(patch[k] ?? {})) {
      if (v === null) delete target[id]
      else target[id] = v
    }
  }
  return next
}
