import type { ActivityEntry, Capture, Expense, ExpenseComment, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, todayISO, uid } from '@/lib/id'
import { inboxToDraft, newCaptureToken } from '@/lib/capture'
import { downscale } from '@/lib/image'
import { isExpired, TABLE_TTL_MS, type LiveTable } from '@/lib/table'
import { disputeActivity, expenseEventActivity, expenseSaveActivity, importActivity, memberActivity, settlementActivity, type NewActivity } from '@/lib/activity'
import { prepareExpenseSave, prepareImportedSettlement, prepareOccurrence } from '@/lib/trust'
import { activityCtxFor, byCreatedDesc, byDateDesc, changedSettings, compact, draftToCapture, errorChannel, placeholdersOf, type AuthUser, type CaptureToken, type Repo, type TablePatch } from './repo'
import { seedDemo } from './seed'
import { defaultCurrency } from '@/lib/locale'

/**
 * Demo-mode repository. Everything lives in this browser's localStorage, so the app
 * can be used and evaluated before Firebase is connected. Not multi-user.
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
}

type StoredComment = ExpenseComment & { groupId: string; expenseId: string }

const KEY = 'splitit-demo-v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { captures: {}, captureTokens: {}, ...JSON.parse(raw) }
  } catch { /* storage unavailable */ }
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
  const listeners = new Set<() => void>()
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
    listeners.forEach((l) => l())
  }
  // Another tab changed the demo data (e.g. a second "phone" at a live table): reload and notify.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return
      state = load()
      state.comments ??= {}
      listeners.forEach((l) => l())
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
  const watch = <T>(select: () => T, cb: (v: T) => void) => {
    let last = ''
    const run = () => {
      const v = select()
      const s = JSON.stringify(v)
      if (s !== last) { last = s; cb(v) }
    }
    listeners.add(run)
    queueMicrotask(run)
    return () => { listeners.delete(run) }
  }
  const touch = (groupId: string) => {
    const g = state.groups[groupId]
    if (g) state.groups[groupId] = { ...g, updatedAt: Date.now() }
  }

  const errors = errorChannel()

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
    async signInWithGoogle() { throw new Error('Connect Firebase to enable Google sign-in') },
    async signInWithEmail() { throw new Error('Connect Firebase to enable email sign-in') },
    async signUpWithEmail() { throw new Error('Connect Firebase to enable email sign-in') },
    async signOut() { state = { ...state, user: null }; commit() },

    watchProfile: (id, cb) => watch(() => state.profiles[id] ?? null, cb),
    async saveProfile(p) { state.profiles[p.uid] = p; if (state.user?.uid === p.uid) state.user = { ...state.user, displayName: p.displayName }; commit() },
    async getProfile(id) { return state.profiles[id] ?? null },
    async getMemberProfile(groupId, id) {
      const p = state.groups[groupId]?.memberUids.includes(id) ? state.profiles[id] : undefined
      return p ? { displayName: p.displayName, payment: p.payment ?? {} } : null
    },

    watchGroups: (userId, cb) =>
      watch(() => Object.values(state.groups).filter((g) => g.memberUids.includes(userId)).sort((a, b) => b.updatedAt - a.updatedAt), cb),
    watchGroup: (id, cb) => watch(() => state.groups[id] ?? null, cb),
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
      state.groups[group.id] = {
        ...g,
        members: { ...g.members, [memberId]: member },
        memberUids: member.uid ? [...new Set([...g.memberUids, member.uid])] : g.memberUids,
        updatedAt: Date.now(),
      }
      log(group.id, memberActivity('added', memberId, member.name, ctx(group.id)))
      commit()
    },
    async removeMember(group, memberId) {
      const g = state.groups[group.id]
      if (!g) return
      const { [memberId]: removed, ...members } = g.members
      if (removed) log(group.id, memberActivity('removed', memberId, removed.name, ctx(group.id), removed.uid === actor()))
      state.groups[group.id] = {
        ...g, members, memberUids: g.memberUids.filter((u) => u !== removed?.uid), updatedAt: Date.now(),
      }
      commit()
    },
    async deleteGroup(id) {
      delete state.groups[id]
      for (const [k, e] of Object.entries(state.expenses)) if (e.groupId === id) delete state.expenses[k]
      for (const [k, s] of Object.entries(state.settlements)) if (s.groupId === id) delete state.settlements[k]
      for (const [k, c] of Object.entries(comments())) if (c.groupId === id) delete comments()[k]
      for (const [k, a] of Object.entries(activity())) if (a.groupId === id) delete activity()[k]
      commit()
    },

    async getInvite(code) {
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase())
      return g ? { groupId: g.id, groupName: g.name, emoji: g.emoji, placeholders: placeholdersOf(g) } : null
    },
    async joinGroup(code, memberId, member) {
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase())
      if (!g) throw new Error('Invite not found')
      if (member.uid && Object.values(g.members).some((m) => m.uid === member.uid)) return g.id
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
      watch(() => Object.values(state.expenses).filter((e) => e.groupId === groupId).sort(byDateDesc), cb),
    async saveExpense(e) {
      const prev = state.expenses[e.id]
      const g = state.groups[e.groupId]
      const next = prepareExpenseSave(prev, e, g ?? {}, actor())
      state.expenses[e.id] = next
      log(e.groupId, expenseSaveActivity(prev, next, ctx(e.groupId, next)))
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
      if (g && e.deletedBy !== actor() && g.createdBy !== actor()) throw new Error('Only the person who deleted it, or the group creator, can delete it forever')
      delete state.expenses[id]
      for (const [k, c] of Object.entries(comments())) if (c.expenseId === id) delete comments()[k]
      log(groupId, expenseEventActivity('purged', e, ctx(groupId, e)))
      commit()
    },
    async flagExpense(group, expense, reason) {
      const e = state.expenses[expense.id]
      const memberId = Object.entries(group.members).find(([, m]) => m.uid === actor())?.[0]
      if (!e || !memberId) return
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
        .then((blob) => new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result))
          r.onerror = rej
          r.readAsDataURL(blob)
        }))
        .then((url) => {
          const e = state.expenses[expenseId]
          if (e) { state.expenses[expenseId] = { ...e, receiptUrl: url }; commit() }
        })
        .catch((e) => errors.emit('write', e, 'Receipt attach failed'))
      return true
    },

    watchSettlements: (groupId, cb) =>
      watch(() => Object.values(state.settlements).filter((s) => s.groupId === groupId).sort(byDateDesc), cb),
    async saveSettlement(s) {
      if (!state.settlements[s.id]) log(s.groupId, settlementActivity('created', s, ctx(s.groupId)))
      state.settlements[s.id] = s
      touch(s.groupId)
      commit()
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
      if (g && s.deletedBy !== actor() && g.createdBy !== actor()) throw new Error('Only the person who deleted it, or the group creator, can delete it forever')
      delete state.settlements[id]
      log(groupId, settlementActivity('purged', s, ctx(groupId)))
      commit()
    },

    watchActivity: (groupId, cb, max = 50) =>
      watch(() => Object.values(activity()).filter((a) => a.groupId === groupId).sort(byCreatedDesc).slice(0, max), cb),
    watchHistory: (groupId, targetId, cb) =>
      watch(() => Object.values(activity()).filter((a) => a.groupId === groupId && a.targetId === targetId).sort(byCreatedDesc), cb),

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
      if (!state.groups[groupId]) throw new Error('Group not found')
      const g = state.groups[groupId]
      for (const e of expenses) state.expenses[e.id] = prepareOccurrence({ ...e, groupId }, g)
      for (const s of settlements) state.settlements[s.id] = prepareImportedSettlement({ ...s, groupId })
      log(groupId, importActivity(groupId, expenses.length, settlements.length, expenses[0]?.importedFrom ?? settlements[0]?.importedFrom, ctx(groupId)))
      touch(groupId)
      commit()
    },

    watchComments: (groupId, expenseId, cb) =>
      watch(() => Object.values(comments())
        .filter((c) => c.groupId === groupId && c.expenseId === expenseId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(({ groupId: _g, expenseId: _e, ...c }) => c), cb),
    async addComment(groupId, expenseId, c) {
      const id = uid('c_')
      comments()[id] = { ...c, id, groupId, expenseId }
      commit()
    },
    async deleteComment(_g, _e, id) { delete comments()[id]; commit() },

    watchCaptures: (userId, cb) =>
      watch(() => Object.values(state.captures).filter((c) => c.owner === userId).map(({ owner: _, ...c }) => c).sort(byCreatedDesc), cb),
    async saveCapture(userId, c) { state.captures[c.id] = { ...c, owner: userId }; commit() },
    async updateCapture(userId, id, patch) {
      const c = state.captures[id]
      if (!c || c.owner !== userId) throw new Error('Capture not found')
      state.captures[id] = { ...c, ...patch, updatedAt: Date.now() }
      commit()
    },
    async deleteCapture(userId, id) {
      if (state.captures[id]?.owner === userId) delete state.captures[id]
      commit()
    },

    watchCaptureTokens: (userId, cb) =>
      watch(() => Object.values(state.captureTokens).filter((t) => t.uid === userId).sort(byCreatedDesc), cb),
    async createCaptureToken(userId, opts = {}) {
      const token = newCaptureToken()
      state.captureTokens[token] = compact({ token, uid: userId, createdAt: Date.now(), groupId: opts.groupId || undefined, label: opts.label?.slice(0, 60) || undefined })
      commit()
      return token
    },
    async revokeCaptureToken(token) { delete state.captureTokens[token]; commit() },
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
    async claimInbox() { return 0 },

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
    async deleteTable(code) { delete tables()[code]; commit() },
  }
  return repo
}

function applyTablePatch(t: LiveTable, patch: TablePatch): LiveTable {
  const next: LiveTable = { ...t, items: { ...t.items }, participants: { ...t.participants }, claims: { ...t.claims } }
  for (const k of ['merchant', 'extras', 'status', 'expenseId', 'closedGroupId'] as const) {
    if (patch[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = patch[k]
  }
  if (patch.groupId !== undefined) { if (patch.groupId === null) delete next.groupId; else next.groupId = patch.groupId }
  for (const k of ['items', 'participants', 'claims'] as const) {
    const target = next[k] as Record<string, unknown>
    for (const [id, v] of Object.entries(patch[k] ?? {})) { if (v === null) delete target[id]; else target[id] = v }
  }
  return next
}
