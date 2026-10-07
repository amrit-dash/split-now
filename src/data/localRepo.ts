import type { Capture, Expense, ExpenseComment, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, todayISO, uid } from '@/lib/id'
import { inboxToDraft, newCaptureToken } from '@/lib/capture'
import { downscale } from '@/lib/image'
import { isExpired, TABLE_TTL_MS, type LiveTable } from '@/lib/table'
import { byCreatedDesc, byDateDesc, changedSettings, draftToCapture, errorChannel, placeholdersOf, type AuthUser, type CaptureToken, type Repo, type TablePatch } from './repo'
import { seedDemo } from './seed'

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
        state.profiles.me = { uid: 'me', displayName: user.displayName, currency: 'AUD', payment: { payid: 'you@example.com' } }
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
      commit()
    },
    async removeMember(group, memberId) {
      const g = state.groups[group.id]
      if (!g) return
      const { [memberId]: removed, ...members } = g.members
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
    async saveExpense(e) { state.expenses[e.id] = e; touch(e.groupId); commit() },
    async deleteExpense(_g, id) {
      delete state.expenses[id]
      for (const [k, c] of Object.entries(comments())) if (c.expenseId === id) delete comments()[k]
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
    async saveSettlement(s) { state.settlements[s.id] = s; touch(s.groupId); commit() },
    async deleteSettlement(_g, id) { delete state.settlements[id]; commit() },

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
      for (const o of occurrences) state.expenses[o.id] = o
      state.expenses[template.id] = { ...current, recurrence: template.recurrence }
      if (occurrences.length) touch(template.groupId)
      commit()
    },

    async bulkImport(groupId, expenses, settlements) {
      if (!state.groups[groupId]) throw new Error('Group not found')
      for (const e of expenses) state.expenses[e.id] = { ...e, groupId }
      for (const s of settlements) state.settlements[s.id] = { ...s, groupId }
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
    async createCaptureToken(userId) {
      const token = newCaptureToken()
      state.captureTokens[token] = { token, uid: userId, createdAt: Date.now() }
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
