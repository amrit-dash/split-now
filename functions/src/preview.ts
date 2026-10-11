/*
 * Link previews (functions/src/lib/preview-core.ts): Hosting sends /join/*, /r/* and /t/* here
 * (firebase.json rewrites, every site). It reads the link's document, swaps the app page's preview
 * tags for ones about the link, and returns the page, so chat apps show "Priya invited you to Goa
 * trip" with the invite card while people who tap it get the app as usual. The page itself is the
 * site's own /index.html (an exact file, so Hosting serves it statically, never back here), kept
 * for a minute. Responses are cached at the edge for a minute too, so a busy link costs one read a
 * minute, and a deploy is picked up within a minute. Any failure serves the page with its normal
 * preview: a link must always open.
 */
import { logger } from 'firebase-functions/logger'
import { onRequest } from 'firebase-functions/v2/https'
import { db } from './admin'
import { REGION } from './config'
import {
  DEFAULT_PREVIEW,
  invitePreview,
  linkFromPath,
  payLinkPreview,
  type Preview,
  sharerName,
  tablePreview,
  withPreview,
  type InviteDoc,
  type PayLinkLite,
  type TableLite,
} from './lib/preview-core'

const TTL = 60_000
/** The project's Hosting sites (firebase.json targets; the deploy's header check lists the same three). */
const SITES = /^(split-it-prod|split-now|freesplit)\.(web\.app|firebaseapp\.com)$/
const pages = new Map<string, { html: string; at: number }>()

async function appPage(origin: string): Promise<string> {
  const hit = pages.get(origin)
  if (hit && Date.now() - hit.at < TTL) return hit.html
  const res = await fetch(`${origin}/index.html`, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`index.html ${res.status}`)
  const html = await res.text()
  pages.set(origin, { html, at: Date.now() })
  return html
}

async function previewFor(kind: string, code: string, by: string): Promise<Preview> {
  const now = Date.now()
  if (kind === 'invite') {
    const inv = (await db().doc(`invites/${code}`).get()).data() as (InviteDoc & { groupId?: string }) | undefined
    if (!inv?.groupId) return DEFAULT_PREVIEW
    const g = await db().doc(`groups/${inv.groupId}`).get()
    const live = g.exists && typeof g.get('deletedAt') !== 'number' && g.get('inviteCode') === code
    return invitePreview(inv, live, by)
  }
  if (kind === 'paylink') return payLinkPreview((await db().doc(`payLinks/${code}`).get()).data() as PayLinkLite | undefined, now)
  return tablePreview((await db().doc(`tables/${code}`).get()).data() as TableLite | undefined, now)
}

export const linkPreview = onRequest({ region: REGION, memory: '256MiB', maxInstances: 5, timeoutSeconds: 15 }, async (req, res) => {
  const host = String(req.get('x-forwarded-host') ?? req.get('host') ?? '')
  // Only our own sites (a stray host header must not make us fetch someone else's page).
  const origin = SITES.test(host) ? `https://${host}` : 'https://split-now.web.app'
  let html: string
  try {
    html = await appPage(origin)
  } catch (e) {
    logger.warn('preview: app page', { origin, error: (e as Error).message })
    res.redirect(302, '/')
    return
  }
  const link = linkFromPath(req.path)
  let p = DEFAULT_PREVIEW
  if (link) {
    try {
      p = await previewFor(link.kind, link.code, sharerName(req.query.by))
    } catch (e) {
      logger.warn('preview: read', { kind: link.kind, error: (e as Error).message })
    }
  }
  res.set('Cache-Control', 'public, max-age=0, s-maxage=60')
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(withPreview(html, p, origin, `${origin}${req.originalUrl.split('?')[0]}`))
})
