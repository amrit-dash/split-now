import { logger } from 'firebase-functions'
import { db, messaging } from './admin'
import type { Note } from './lib/notify-text'
import { resolvePrefs, type PrefKey } from './lib/prefs'

/** FCM errors that mean the token is dead: delete it. */
const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/**
 * Send a notification to every registered browser of `uid`, if all of `prefs` are on.
 * Data-only message: public/push-sw.js shows it (iOS and Chrome both require the service
 * worker to show something for every push) and opens `data.url` on click.
 * Returns how many devices accepted it. Never throws.
 */
export async function sendToUser(uid: string, prefs: PrefKey[], note: Note): Promise<number> {
  try {
    const user = db().collection('users').doc(uid)
    const [prefSnap, tokens] = await Promise.all([
      user.collection('settings').doc('notifications').get(),
      user.collection('pushTokens').limit(20).get(),
    ])
    const p = resolvePrefs(prefSnap.data())
    if (!prefs.every((k) => p[k])) return 0
    const docs = tokens.docs.filter((d) => typeof d.get('token') === 'string')
    if (!docs.length) return 0

    const data: Record<string, string> = { title: note.title, body: note.body, url: note.url }
    if (note.tag) data.tag = note.tag
    const res = await messaging().sendEach(docs.map((d) => ({
      token: d.get('token') as string,
      data,
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    })))

    const batch = db().batch()
    let dead = 0
    res.responses.forEach((r, i) => {
      if (r.success) return
      const code = r.error?.code ?? ''
      if (DEAD_TOKEN.has(code)) { batch.delete(docs[i].ref); dead++ }
      else logger.warn('push send failed', { uid, code, message: r.error?.message })
    })
    if (dead) await batch.commit()
    return res.successCount
  } catch (e) {
    logger.error('push failed', { uid, error: (e as Error).message })
    return 0
  }
}
