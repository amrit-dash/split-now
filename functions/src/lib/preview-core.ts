/*
 * Link previews for shared links (functions/src/preview.ts): what WhatsApp, iMessage, Slack and
 * the like show for /join/{code}, /r/{code} and /t/{code}. Their crawlers don't run the app, so the
 * page's own tags are swapped for ones about the link. Pure: the function reads the documents and
 * the page; this decides what to say and rewrites the tags.
 *
 * What a preview may say (owner decisions, Oct 2026): an invite names the group and, when the
 * person sharing it is known, them; a Pay me link names who asks and the group but never the
 * amount (a forwarded chat shouldn't show it); a live table names the place. One generic image per
 * kind of link. Anything expired, cancelled, held or missing gets the plain app preview.
 */
import { isPayLinkCode } from '../../../shared/paylinks'

export type PreviewKind = 'invite' | 'paylink' | 'table'

export interface Preview {
  title: string
  description: string
  /** a path on the site: /og-invite.jpg, ... */
  image: string
  imageAlt: string
}

export const DEFAULT_PREVIEW: Preview = {
  title: 'Split Now',
  description: 'Spending is wise, splitting is free. Split Now!',
  image: '/og-image.jpg',
  imageAlt: 'Split Now: Spending is wise, splitting is free. Split Now! Free and open source bill splitting.',
}

/** The kind of link and its code, from the request path; null for anything else. */
export function linkFromPath(path: string): { kind: PreviewKind; code: string } | null {
  const m = path.match(/^\/(join|r|t)\/([^/?#]+)\/?$/)
  if (!m) return null
  const code = decodeURIComponent(m[2])
  if (m[1] === 'r') return isPayLinkCode(code) ? { kind: 'paylink', code } : null
  if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return null
  return { kind: m[1] === 'join' ? 'invite' : 'table', code }
}

const clip = (s: unknown, n: number) => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const firstName = (s: unknown) => clip(s, 40).split(' ')[0] ?? ''

/** The sharer's first name from ?by= (the app adds it to invites it shares): letters only, short. */
export function sharerName(by: unknown): string {
  const t = typeof by === 'string' ? by.normalize('NFC').trim() : ''
  return /^[\p{L}][\p{L}'’ .-]{0,29}$/u.test(t) ? firstName(t) : ''
}

export interface InviteDoc {
  groupName?: string
  emoji?: string
}
export interface PayLinkLite {
  payeeName?: string
  groupName?: string
  emoji?: string
  status?: string
  expiresAt?: number
  held?: boolean
}
export interface TableLite {
  merchant?: string
  status?: string
  expiresAt?: number
}

/** An invite to a live group (a deleted or missing one gets the plain preview). */
export function invitePreview(inv: InviteDoc | undefined, groupLive: boolean, by: string): Preview {
  const name = clip(inv?.groupName, 60)
  if (!inv || !name || !groupLive) return DEFAULT_PREVIEW
  const group = `${inv.emoji ? `${clip(inv.emoji, 8)} ` : ''}${name}`
  return {
    title: by ? `${by} invited you to ${group}` : `You’re invited to ${group}`,
    description: 'Split expenses together on Split Now. Tap to see the group and join.',
    image: '/og-invite.jpg',
    imageAlt: `An invite to ${name} on Split Now`,
  }
}

/** A Pay me link that can still be paid: who asks and where, never how much. */
export function payLinkPreview(l: PayLinkLite | undefined, now: number): Preview {
  const open = l && l.status === 'open' && !l.held && typeof l.expiresAt === 'number' && now < l.expiresAt
  const who = firstName(l?.payeeName)
  if (!open || !who) return DEFAULT_PREVIEW
  const group = clip(l?.groupName, 60)
  return {
    title: `${who} asked you to settle up`,
    description: `${group ? `${group} · ` : ''}Pay by UPI in one tap, then mark it paid. No account needed.`,
    image: '/og-paylink.jpg',
    imageAlt: `${who} asked you to settle up on Split Now`,
  }
}

/** A live table that is still open. */
export function tablePreview(t: TableLite | undefined, now: number): Preview {
  const open = t && t.status === 'open' && typeof t.expiresAt === 'number' && now < t.expiresAt
  if (!open) return DEFAULT_PREVIEW
  const place = clip(t?.merchant, 60)
  return {
    title: place ? `Split the bill at ${place}` : 'Split the bill',
    description: 'Pick what you had and pay your share on Split Now.',
    image: '/og-table.jpg',
    imageAlt: place ? `A live table at ${place} on Split Now` : 'A live table on Split Now',
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The app's page with its preview tags about this link: title, description, the og:/twitter: ones
 * and og:url. Tags the page doesn't have are left alone (never added out of place).
 */
export function withPreview(html: string, p: Preview, origin: string, url: string): string {
  const image = `${origin}${p.image}`
  const set = (re: RegExp, value: string) => {
    html = html.replace(re, (_m, a: string, b: string) => `${a}${esc(value)}${b}`)
  }
  set(/(<title>)[^<]*(<\/title>)/, p.title)
  set(/(<meta name="description" content=")[^"]*(")/, p.description)
  set(/(<meta property="og:title" content=")[^"]*(")/, p.title)
  set(/(<meta property="og:description" content=")[^"]*(")/, p.description)
  set(/(<meta property="og:url" content=")[^"]*(")/, url)
  set(/(<meta property="og:image" content=")[^"]*(")/, image)
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, p.imageAlt)
  set(/(<meta name="twitter:image" content=")[^"]*(")/, image)
  return html
}
