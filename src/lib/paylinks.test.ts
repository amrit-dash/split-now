import { describe, expect, it } from 'vitest'
import {
  buildPayLink,
  claimsInGroup,
  sortClaims,
  payLinkFeatures,
  groupTableLinks,
  isPayLinkCode,
  linkToClose,
  newPayLinkCode,
  openTableLinks,
  PAY_LINK_TTL_MS,
  parsePayLinkCode,
  payLinkUrl,
  payLinkView,
  settleUpPath,
  statusLine,
  type PayLink,
  type TableLinkSource,
} from './paylinks'

const CODE = 'abcdefghijkmnpqrstuvwxyz'
const NOW = 1_760_000_000_000

describe('codes', () => {
  it('are 24 characters the rules accept, and differ every time', () => {
    const a = newPayLinkCode()
    expect(a).toHaveLength(24)
    expect(isPayLinkCode(a)).toBe(true)
    expect(new Set(Array.from({ length: 50 }, newPayLinkCode)).size).toBe(50)
  })
  it('link and parse', () => {
    expect(payLinkUrl('https://split-now.web.app', CODE)).toBe(`https://split-now.web.app/r/${CODE}`)
    expect(parsePayLinkCode(`https://split-now.web.app/r/${CODE}`)).toBe(CODE)
    expect(parsePayLinkCode(` ${CODE.toUpperCase()} `)).toBe(CODE)
    expect(parsePayLinkCode('short')).toBe('')
  })
})

describe('building a link', () => {
  const args = {
    groupId: 'g_goa',
    groupName: ' Goa trip ',
    emoji: '🏖️',
    from: { id: 'm_rahul', name: 'Rahul' },
    to: { id: 'm_priya', name: 'Priya' },
    amount: 124000.4,
    currency: 'INR',
    payment: { upi: 'priya@okaxis', account: '123', ifsc: 'HDFC0001234' },
    createdBy: 'u_priya',
  }
  it('matches the shape the rules whitelist, with the bank details left out', () => {
    expect(buildPayLink(args, NOW)).toEqual({
      groupId: 'g_goa',
      groupName: 'Goa trip',
      emoji: '🏖️',
      from: 'm_rahul',
      to: 'm_priya',
      amount: 124000,
      currency: 'INR',
      payeeName: 'Priya',
      payerName: 'Rahul',
      payment: { upi: 'priya@okaxis' },
      createdBy: 'u_priya',
      createdAt: NOW,
      expiresAt: NOW + PAY_LINK_TTL_MS,
    })
  })
  it('optional keys only when given; names never empty', () => {
    const l = buildPayLink({ ...args, groupId: undefined, emoji: undefined, tableCode: 'TBL23456', forUid: 'anon', from: { id: 'p', name: ' ' } }, NOW)
    expect(l).not.toHaveProperty('groupId')
    expect(l).not.toHaveProperty('emoji')
    expect(l.tableCode).toBe('TBL23456')
    expect(l.forUid).toBe('anon')
    expect(l.payerName).toBe('Someone')
  })
})

describe('which screen /r/{code} shows', () => {
  const l: PayLink = {
    ...buildPayLink(
      { groupId: 'g', groupName: 'Goa', from: { id: 'a', name: 'A' }, to: { id: 'b', name: 'B' }, amount: 100, currency: 'INR', createdBy: 'payee' },
      NOW,
    ),
    code: CODE,
    status: 'open',
  }
  const anon = { uid: 'anon', anonymous: true, member: false }
  it('loading and missing', () => {
    expect(payLinkView(undefined, anon, NOW)).toBe('loading')
    expect(payLinkView(null, anon, NOW)).toBe('missing')
  })
  it('the payee sees their link, whatever its state', () => {
    expect(payLinkView(l, { uid: 'payee', anonymous: false, member: true }, NOW)).toBe('payee')
    expect(payLinkView({ ...l, status: 'paid' }, { uid: 'payee', anonymous: false, member: true }, NOW)).toBe('payee')
  })
  it('a signed-in member goes to Settle up; a non-member or a guest pays here', () => {
    expect(payLinkView(l, { uid: 'm', anonymous: false, member: true }, NOW)).toBe('settle')
    expect(payLinkView(l, { uid: 'm', anonymous: false, member: undefined }, NOW)).toBe('loading')
    expect(payLinkView(l, { uid: 'x', anonymous: false, member: false }, NOW)).toBe('pay')
    expect(payLinkView(l, anon, NOW)).toBe('pay')
  })
  it('demo guest mode shows the payer screen even to the payee', () => {
    expect(payLinkView(l, { uid: 'payee', anonymous: true, member: true, guestMode: true }, NOW)).toBe('pay')
  })
  it('paid, expired, cancelled, and a table guest’s link opened by someone else', () => {
    expect(payLinkView({ ...l, status: 'paid' }, anon, NOW)).toBe('paid')
    expect(payLinkView({ ...l, status: 'paid' }, { uid: 'm', anonymous: false, member: true }, NOW)).toBe('paid')
    expect(payLinkView(l, anon, l.expiresAt)).toBe('expired')
    expect(payLinkView({ ...l, status: 'cancelled' }, anon, NOW)).toBe('cancelled')
    expect(payLinkView({ ...l, forUid: 'other' }, anon, NOW)).toBe('notYours')
  })
  it('the in-app path is the prefilled Settle up carrying the code', () => {
    expect(settleUpPath(l)).toBe(`/groups/g/settle?from=a&to=b&amount=100&link=${CODE}`)
  })
})

describe('Settle up closes the link', () => {
  it('only for the same pair of people and a real code', () => {
    expect(linkToClose(CODE, { from: 'a', to: 'b' }, { from: 'a', to: 'b' })).toBe(CODE)
    expect(linkToClose(CODE, { from: 'a', to: 'b' }, { from: 'a', to: 'c' })).toBeUndefined()
    expect(linkToClose('nope', { from: 'a', to: 'b' }, { from: 'a', to: 'b' })).toBeUndefined()
    expect(linkToClose(null, { from: 'a', to: 'b' }, { from: 'a', to: 'b' })).toBeUndefined()
  })
})

describe('status line', () => {
  const fmt = (ms: number) => `day${ms}`
  const base = { status: 'open' as const, expiresAt: 50, groupId: 'g' }
  it('reads each state', () => {
    expect(statusLine(base, 10, fmt)).toBe('Waiting for payment · open until day50')
    expect(statusLine(base, 60, fmt)).toBe('Expired day50')
    expect(statusLine({ ...base, status: 'paid', paidAt: 20 }, 60, fmt)).toBe('Marked paid day20 · recording…')
    expect(statusLine({ ...base, status: 'paid', paidAt: 20, settlementId: 's' }, 60, fmt)).toBe('Marked paid day20 · recorded in the group')
    expect(statusLine({ ...base, status: 'paid', groupId: undefined }, 60, fmt)).toBe('Marked paid')
    expect(statusLine({ ...base, status: 'cancelled', cancelledAt: 30 }, 60, fmt)).toBe('Cancelled day30')
  })
})

describe('live table links', () => {
  const t: TableLinkSource = {
    code: 'TBL23456',
    hostUid: 'host',
    merchant: 'Pho',
    currency: 'INR',
    participants: {
      host: { name: 'Hana', uid: 'host' },
      ben: { name: 'Ben', uid: 'ben' },
      gran: { name: 'Gran' },
      ana: { name: 'Ana', uid: 'ana' },
      ana2: { name: 'Ana phone 2', uid: 'ana2' },
    },
    hostPayment: { upi: 'hana@okaxis', account: '1', ifsc: 'HDFC0001234' },
  }
  let n = 0
  const codes = () => `code${String(++n).padStart(20, '0')}`
  it('in a group: one link per member who owes the host, for exactly their share', () => {
    n = 0
    const g = { id: 'g1', name: 'Dinners', emoji: '🍜', members: { mh: { name: 'Hana' }, mb: { name: 'Ben' }, mg: { name: 'Gran' }, ma: { name: 'Ana' } } }
    const r = groupTableLinks(
      t,
      g,
      { host: 'mh', ben: 'mb', gran: 'mg', ana: 'ma', ana2: 'ma' },
      'mh',
      { mh: 100, mb: 200, mg: 0, ma: 300 },
      'host',
      NOW,
      codes,
    )
    expect(r.links.map((l) => [l.link.from, l.link.to, l.link.amount, l.link.forUid])).toEqual([
      ['mb', 'mh', 200, 'ben'],
      ['ma', 'mh', 300, undefined],
    ])
    expect(r.links[0].link).toMatchObject({ groupId: 'g1', groupName: 'Dinners', tableCode: 'TBL23456', payment: { upi: 'hana@okaxis' }, createdBy: 'host' })
    expect(r.byParticipant).toEqual({ ben: r.links[0].code, ana: r.links[1].code, ana2: r.links[1].code })
  })
  it('without a group: one link per guest for their table total, payee = the host', () => {
    n = 0
    const r = openTableLinks(t, { host: { total: 100 }, ben: { total: 250 }, gran: { total: 80 }, ana: { total: 0 } }, 'host', NOW, codes)
    expect(r.links.map((l) => [l.link.from, l.link.to, l.link.amount, l.link.forUid, l.link.groupId])).toEqual([
      ['ben', 'host', 250, 'ben', undefined],
      ['gran', 'host', 80, undefined, undefined],
    ])
    expect(r.links[0].link).toMatchObject({ groupName: 'Pho', tableCode: 'TBL23456', payeeName: 'Hana', payerName: 'Ben' })
    expect(Object.keys(r.byParticipant)).toEqual(['ben', 'gran'])
  })
})

describe('the payLinks flag', () => {
  it('only stops new links and hides the guest screens; claims are always recorded and the payee can always act', () => {
    expect(payLinkFeatures(false)).toEqual({ createLinks: false, guestPages: false, recordClaims: true, payeeTools: true })
    expect(payLinkFeatures(true)).toEqual({ createLinks: true, guestPages: true, recordClaims: true, payeeTools: true })
  })
})

describe('claims waiting in a group', () => {
  it('newest claim first, ties by code', () => {
    const l = (code: string, paidAt?: number) => ({ code, paidAt })
    expect(sortClaims([l('b', 1), l('c', 5), l('a', 1), l('d')]).map((x) => x.code)).toEqual(['c', 'a', 'b', 'd'])
  })
  it('a group card shows only that group’s claimed links (no-group table links stay in the Inbox)', () => {
    const list = [
      { code: 'a', groupId: 'g1', status: 'claimed' },
      { code: 'b', groupId: 'g2', status: 'claimed' },
      { code: 'c', status: 'claimed' },
      { code: 'd', groupId: 'g1', status: 'paid' },
    ]
    expect(claimsInGroup(list, 'g1').map((x) => x.code)).toEqual(['a'])
    expect(claimsInGroup(null, 'g1')).toEqual([])
  })
  it('the guest and other visitors see "claimed"; the payee still gets their view', () => {
    const l = {
      ...buildPayLink(
        { tableCode: 'T', groupName: 'Pho', from: { id: 'a', name: 'A' }, to: { id: 'h', name: 'H' }, amount: 100, currency: 'INR', createdBy: 'host' },
        NOW,
      ),
      code: CODE,
      status: 'claimed' as const,
    }
    expect(payLinkView(l, { uid: 'anon', anonymous: true, member: false }, NOW)).toBe('claimed')
    expect(payLinkView(l, { uid: 'host', anonymous: false, member: false }, NOW)).toBe('payee')
    expect(statusLine({ ...l, paidAt: 20 }, NOW, (ms) => `day${ms}`)).toBe('Says they’ve paid day20 · confirm it')
  })
})
