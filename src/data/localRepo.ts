import type { Expense, Group, Settlement, UserProfile } from '@/types'
import { inviteCode, uid } from '@/lib/id'
import { byDateDesc, placeholdersOf, type AuthUser, type Repo } from './repo'
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
}

const KEY = 'splitit-demo-v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage unavailable */ }
  return { user: null, profiles: {}, groups: {}, expenses: {}, settlements: {} }
}

export function createLocalRepo(): Repo {
  let state = load()
  const listeners = new Set<() => void>()
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
    listeners.forEach((l) => l())
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

  return {
    mode: 'demo',

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

    watchGroups: (userId, cb) =>
      watch(() => Object.values(state.groups).filter((g) => g.memberUids.includes(userId)).sort((a, b) => b.updatedAt - a.updatedAt), cb),
    watchGroup: (id, cb) => watch(() => state.groups[id] ?? null, cb),
    async createGroup(g) {
      const id = uid('g_')
      state.groups[id] = { ...g, id, inviteCode: inviteCode(), createdAt: Date.now(), updatedAt: Date.now() }
      commit()
      return id
    },
    async updateGroup(id, patch) {
      state.groups[id] = { ...state.groups[id], ...patch, updatedAt: Date.now() }
      commit()
    },
    async deleteGroup(id) {
      delete state.groups[id]
      for (const [k, e] of Object.entries(state.expenses)) if (e.groupId === id) delete state.expenses[k]
      for (const [k, s] of Object.entries(state.settlements)) if (s.groupId === id) delete state.settlements[k]
      commit()
    },

    async getInvite(code) {
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase())
      return g ? { groupId: g.id, groupName: g.name, emoji: g.emoji, placeholders: placeholdersOf(g) } : null
    },
    async joinGroup(code, memberId, member) {
      const g = Object.values(state.groups).find((x) => x.inviteCode === code.toUpperCase())
      if (!g) throw new Error('Invite not found')
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
    async deleteExpense(_g, id) { delete state.expenses[id]; commit() },

    watchSettlements: (groupId, cb) =>
      watch(() => Object.values(state.settlements).filter((s) => s.groupId === groupId).sort(byDateDesc), cb),
    async saveSettlement(s) { state.settlements[s.id] = s; touch(s.groupId); commit() },
    async deleteSettlement(_g, id) { delete state.settlements[id]; commit() },

    async uploadReceipt(_groupId, file) {
      // Store a small data URL so the demo can show the receipt.
      return new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = rej
        r.readAsDataURL(file)
      })
    },
  }
}
