import { logger } from 'firebase-functions/logger'
import { db, messaging } from './admin'
import { pendingApprovers } from '../../shared/balances-core'
import type { Note } from './lib/notify-text'
import { resolvePrefs, type PrefKey } from './lib/prefs'

/** FCM errors that mean the token is dead: delete it. */
const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])
const isDead = (code: string, message: string | undefined) =>
  DEAD_TOKEN.has(code) || (code === 'messaging/invalid-argument' && /registration token/i.test(message ?? ''))

/** A browser that hasn't opened the app for this long has very likely been reinstalled or wiped. */
const STALE_TOKEN_MS = 90 * 86_400_000
const MAX_TOKENS = 20

/**
 * What the app badge should show: captures waiting to be sorted plus expenses awaiting this
 * person's approval. Bounded and best-effort (a count query for captures; approvals only in
 * groups that require them). Never throws.
 */
export async function badgeCount(uid: string): Promise<number> {
  try {
    const user = db().collection('users').doc(uid)
    const [captures, groups] = await Promise.all([
      user.collection('captures').where('status', '==', 'pending').count().get(),
      db().collection('groups').where('memberUids', 'array-contains', uid).select('requireApproval', 'members').limit(50).get(),
    ])
    let approvals = 0
    const needing = groups.docs.filter((g) => g.get('requireApproval') === true).slice(0, 10)
    await Promise.all(needing.map(async (g) => {
      const members = (g.get('members') ?? {}) as Record<string, { uid?: string }>
      const ex = await g.ref.collection('expenses').where('requiresApproval', '==', true).select('splits', 'approvals', 'createdBy', 'deletedAt').limit(100).get()
      for (const d of ex.docs) {
        if (typeof d.get('deletedAt') === 'number') continue
        if (pendingApprovers({ requiresApproval: true, splits: d.get('splits'), approvals: d.get('approvals'), createdBy: d.get('createdBy') }, members).some((id) => members[id]?.uid === uid)) approvals++
      }
    }))
    return captures.data().count + approvals
  } catch (e) {
    logger.warn('badge count', { uid, error: (e as Error).message })
    return 0
  }
}

/**
 * Send a notification to every registered browser of `uid`, if all of `prefs` are on.
 * Data-only message: public/push-sw.js shows it (iOS and Chrome both require the service
 * worker to show something for every push), sets the app badge from `data.badge`, and opens
 * `data.url` on click. The newest 20 registrations are used; ones not seen for 90 days and
 * ones FCM reports dead are deleted. Returns how many devices accepted it. Never throws.
 */
export async function sendToUser(uid: string, prefs: PrefKey[], note: Note): Promise<number> {
  try {
    const user = db().collection('users').doc(uid)
    const [prefSnap, tokens] = await Promise.all([
      user.collection('settings').doc('notifications').get(),
      user.collection('pushTokens').orderBy('lastSeen', 'desc').limit(MAX_TOKENS + 10).get(),
    ])
    const p = resolvePrefs(prefSnap.data())
    if (!prefs.every((k) => p[k])) return 0
    const now = Date.now()
    const batch = db().batch()
    let dead = 0
    const docs = tokens.docs.filter((d) => {
      if (typeof d.get('token') !== 'string') return false
      const seen = d.get('lastSeen')
      if (typeof seen === 'number' && now - seen > STALE_TOKEN_MS) { batch.delete(d.ref); dead++; return false }
      return true
    }).slice(0, MAX_TOKENS)
    if (!docs.length) {
      if (dead) await batch.commit()
      return 0
    }

    const badge = await Promise.race([badgeCount(uid), new Promise<number>((r) => setTimeout(() => r(0), 2500))])
    const data: Record<string, string> = { title: note.title, body: note.body, url: note.url, badge: String(badge) }
    if (note.tag) data.tag = note.tag
    const res = await (await messaging()).sendEach(docs.map((d) => ({
      token: d.get('token') as string,
      data,
      webpush: { headers: { Urgency: note.urgency ?? 'high', TTL: String(24 * 3600) } },
    })))

    res.responses.forEach((r, i) => {
      if (r.success) return
      const code = r.error?.code ?? ''
      if (isDead(code, r.error?.message)) { batch.delete(docs[i].ref); dead++ }
      else logger.warn('push send failed', { uid, code, message: r.error?.message })
    })
    if (dead) await batch.commit()
    return res.successCount
  } catch (e) {
    logger.error('push failed', { uid, error: (e as Error).message })
    return 0
  }
}
