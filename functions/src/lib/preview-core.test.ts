import { describe, expect, it } from 'vitest'
import { DEFAULT_PREVIEW, invitePreview, linkFromPath, payLinkPreview, sharerName, tablePreview, withPreview } from './preview-core'

const NOW = 1_760_000_000_000
const CODE = 'abcdefghijkmnpqrstuvwxyz'

describe('linkFromPath', () => {
  it('knows the three kinds of shared link and checks their codes', () => {
    expect(linkFromPath('/join/ABCD2345')).toEqual({ kind: 'invite', code: 'ABCD2345' })
    expect(linkFromPath(`/r/${CODE}`)).toEqual({ kind: 'paylink', code: CODE })
    expect(linkFromPath('/t/TBL23456/')).toEqual({ kind: 'table', code: 'TBL23456' })
    expect(linkFromPath('/r/short')).toBeNull()
    expect(linkFromPath('/join/../x')).toBeNull()
    expect(linkFromPath('/groups/g1')).toBeNull()
  })
})

describe('sharerName', () => {
  it('takes a first name, and nothing that could be markup or a link', () => {
    expect(sharerName('Priya Sharma')).toBe('Priya')
    expect(sharerName('Zoë')).toBe('Zoë')
    expect(sharerName('<script>')).toBe('')
    expect(sharerName('https://x.y')).toBe('')
    expect(sharerName(undefined)).toBe('')
  })
})

describe('invite preview', () => {
  const inv = { groupName: 'Goa trip', emoji: '🏖️' }
  it('names who invited you and the group', () => {
    expect(invitePreview(inv, true, 'Priya')).toMatchObject({ title: 'Priya invited you to 🏖️ Goa trip', image: '/og-invite.jpg' })
    expect(invitePreview(inv, true, '').title).toBe('You’re invited to 🏖️ Goa trip')
  })
  it('a deleted or missing group gets the plain preview', () => {
    expect(invitePreview(inv, false, 'Priya')).toBe(DEFAULT_PREVIEW)
    expect(invitePreview(undefined, true, 'Priya')).toBe(DEFAULT_PREVIEW)
  })
})

describe('Pay me link preview', () => {
  const l = { payeeName: 'Priya Sharma', groupName: 'Goa trip', status: 'open', expiresAt: NOW + 1000 }
  it('says who asks and where, never the amount', () => {
    const p = payLinkPreview(l, NOW)
    expect(p.title).toBe('Priya asked you to settle up')
    expect(p.description).toContain('Goa trip')
    expect(`${p.title} ${p.description}`).not.toMatch(/₹|\d{3}/)
    expect(p.image).toBe('/og-paylink.jpg')
  })
  it('paid, cancelled, expired or on hold: the plain preview', () => {
    expect(payLinkPreview({ ...l, status: 'paid' }, NOW)).toBe(DEFAULT_PREVIEW)
    expect(payLinkPreview({ ...l, expiresAt: NOW - 1 }, NOW)).toBe(DEFAULT_PREVIEW)
    expect(payLinkPreview({ ...l, held: true }, NOW)).toBe(DEFAULT_PREVIEW)
    expect(payLinkPreview(undefined, NOW)).toBe(DEFAULT_PREVIEW)
  })
})

describe('live table preview', () => {
  it('names the place while it is open', () => {
    expect(tablePreview({ merchant: 'Pho', status: 'open', expiresAt: NOW + 1 }, NOW).title).toBe('Split the bill at Pho')
    expect(tablePreview({ merchant: 'Pho', status: 'closed', expiresAt: NOW + 1 }, NOW)).toBe(DEFAULT_PREVIEW)
  })
})

describe('withPreview', () => {
  const page = `<title>Split Now</title>
<meta name="description" content="x" />
<meta property="og:title" content="Split Now" />
<meta property="og:description" content="y" />
<meta property="og:url" content="https://split-now.web.app" />
<meta property="og:image" content="https://split-now.web.app/og-image.jpg" />
<meta property="og:image:alt" content="z" />
<meta name="twitter:image" content="https://split-now.web.app/og-image.jpg" />`
  it('swaps every preview tag, escaping what it writes', () => {
    const out = withPreview(
      page,
      { title: 'Rahul & "co" <b>', description: 'd', image: '/og-invite.jpg', imageAlt: 'a' },
      'https://s.app',
      'https://s.app/join/X',
    )
    expect(out).toContain('<title>Rahul &amp; &quot;co&quot; &lt;b&gt;</title>')
    expect(out).toContain('<meta property="og:image" content="https://s.app/og-invite.jpg" />')
    expect(out).toContain('<meta name="twitter:image" content="https://s.app/og-invite.jpg" />')
    expect(out).toContain('<meta property="og:url" content="https://s.app/join/X" />')
    expect(out).not.toContain('og-image.jpg')
  })
})
