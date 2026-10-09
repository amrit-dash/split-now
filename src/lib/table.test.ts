import { describe, expect, it } from 'vitest'
import type { Group } from '@/types'
import {
  claimLeftoversForAll,
  computeTableTotals,
  draftToTable,
  receiptExtras,
  extrasNet,
  formatCode,
  isExpired,
  matchParticipants,
  orderedItems,
  parseCode,
  participantOrder,
  sanitizeClaims,
  setShares,
  tableToSplit,
  tableTotal,
  toggleClaim,
  validateName,
  billCheck,
  extrasParts,
  taxSplitHint,
  TableError,
  type LiveTable,
} from './table'
import { encodeQr, qrPath } from './qr'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

function table(over: Partial<LiveTable> = {}): LiveTable {
  return {
    code: 'ABCD2345',
    hostUid: 'host',
    merchant: 'Pho',
    currency: 'AUD',
    date: '2026-10-07',
    items: {
      a: { name: 'Pho', amount: 1800, pos: 0 },
      b: { name: 'Spring rolls', amount: 1000, pos: 1 },
      c: { name: 'Beer', amount: 900, pos: 2 },
    },
    extras: { tax: 370, tip: 300, discount: 0 },
    participants: {
      host: { name: 'Hana', uid: 'host', joinedAt: 1 },
      g1: { name: 'Ben', uid: 'g1', joinedAt: 3 },
      g2: { name: 'Cleo', uid: 'g2', joinedAt: 2 },
    },
    claims: {},
    status: 'open',
    createdAt: 1,
    expiresAt: 1 + 86_400_000,
    ...over,
  }
}

describe('basics', () => {
  it('orders items by pos and participants host-first then by join time', () => {
    const t = table({ items: { z: { name: 'Z', amount: 1, pos: 1 }, y: { name: 'Y', amount: 1, pos: 0 } } })
    expect(orderedItems(t).map((i) => i.id)).toEqual(['y', 'z'])
    expect(participantOrder(t)).toEqual(['host', 'g2', 'g1'])
  })
  it('totals include tax and tip minus discount', () => {
    const t = table({ extras: { tax: 100, tip: 200, discount: 50 } })
    expect(extrasNet(t.extras)).toBe(250)
    expect(tableTotal(t)).toBe(3700 + 250)
  })
  it('expiry', () => {
    expect(isExpired({ expiresAt: 10 }, 9)).toBe(false)
    expect(isExpired({ expiresAt: 10 }, 10)).toBe(true)
  })
  it('codes', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD-2345')
    expect(parseCode('abcd-2345')).toBe('ABCD2345')
    expect(parseCode('https://x.web.app/t/ABCD2345?x=1')).toBe('ABCD2345')
    expect(parseCode(' ab cd 23 45 ')).toBe('ABCD2345')
  })
  it('names', () => {
    expect(validateName('  ')).toBeTruthy()
    expect(validateName('x'.repeat(41))).toBeTruthy()
    expect(validateName(' Ben ')).toBeNull()
  })
})

describe('claims', () => {
  it('toggle and set shares', () => {
    let c = toggleClaim({}, 'a')
    expect(c).toEqual({ a: 1 })
    c = setShares(c, 'a', 3)
    expect(c).toEqual({ a: 3 })
    c = setShares(c, 'a', 99)
    expect(c).toEqual({ a: 20 })
    expect(setShares(c, 'a', 0)).toEqual({})
    expect(toggleClaim({ a: 2, b: 1 }, 'a')).toEqual({ b: 1 })
  })
  it('sanitize drops unknown items and invalid shares', () => {
    const items = { a: {}, b: {}, c: {}, d: {}, e: {} }
    expect(sanitizeClaims({ a: 1, b: 0, c: -1, d: 1.5, e: '2', zz: 1 } as Record<string, unknown>, items)).toEqual({ a: 1 })
    expect(sanitizeClaims({ a: 21 }, items)).toEqual({})
    expect(sanitizeClaims(undefined, items)).toEqual({})
  })
  it('views ignore invalid stored claims', () => {
    const t = table({ claims: { host: { a: 1, ghost: 1 }, g1: { a: 0 } as Record<string, number> } })
    expect(orderedItems(t)[0].claims).toEqual({ host: 1 })
  })
})

describe('computeTableTotals', () => {
  it('nothing claimed', () => {
    const r = computeTableTotals(table())
    expect(r.unclaimed).toEqual(['a', 'b', 'c'])
    expect(r.unclaimedAmount).toBe(3700)
    expect(r.allClaimed).toBe(false)
    // only the tip (300 three ways); the tax waits for the items
    expect(r.people.host.total).toBe(100)
  })
  it('running totals: tax is proportional and stable while others are still claiming', () => {
    const noTip = { extras: { tax: 670, tip: 0, discount: 0 } }
    const partial = computeTableTotals(table({ ...noTip, claims: { g1: { a: 1 } } }))
    // Ben has 1800 of 3700 in items → 1800/3700 of 670 tax = 325.9 → 326
    expect(partial.people.g1).toEqual({ items: 1800, extras: 326, tip: 0, total: 2126 })
    const full = computeTableTotals(table({ ...noTip, claims: { g1: { a: 1 }, g2: { b: 1 }, host: { c: 1 } } }))
    expect(full.people.g1.total).toBe(2126)
    expect(full.allClaimed).toBe(true)
    expect(sum(Object.fromEntries(Object.entries(full.people).map(([k, v]) => [k, v.total])))).toBe(full.total)
  })
  it('shared items split equally or by shares, exactly', () => {
    const t = table({
      items: { a: { name: 'Platter', amount: 1000, pos: 0 } },
      extras: { tax: 0, tip: 0, discount: 0 },
      claims: { host: { a: 1 }, g1: { a: 1 }, g2: { a: 1 } },
    })
    const r = computeTableTotals(t)
    expect(r.itemSplits.a).toEqual({ host: 334, g2: 333, g1: 333 })
    const s = computeTableTotals({ ...t, claims: { host: { a: 2 }, g1: { a: 1 }, g2: { a: 1 } } })
    expect(s.itemSplits.a).toEqual({ host: 500, g2: 250, g1: 250 })
  })
  it('discounts reduce people proportionally and still sum to the total', () => {
    const t = table({ extras: { tax: 0, tip: 0, discount: 1001 }, claims: { host: { a: 1, b: 1 }, g1: { b: 1, c: 1 }, g2: { c: 2 } } })
    const r = computeTableTotals(t)
    expect(r.total).toBe(2699)
    expect(Object.values(r.people).reduce((s, p) => s + p.total, 0)).toBe(2699)
    for (const p of Object.values(r.people)) expect(p.extras).toBeLessThanOrEqual(0)
  })
  it('random tables always sum exactly once fully claimed', () => {
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let k = 0; k < 200; k++) {
      const items: LiveTable['items'] = {}
      const nItems = 1 + rnd(8)
      for (let i = 0; i < nItems; i++) items['i' + i] = { name: 'x', amount: 1 + rnd(5000), pos: i }
      const people = ['host', 'g1', 'g2', 'g3'].slice(0, 1 + rnd(4))
      const claims: LiveTable['claims'] = {}
      for (const id of Object.keys(items)) {
        const who = people.filter(() => rnd(2)).concat(people[rnd(people.length)])
        for (const p of who) {
          claims[p] ??= {}
          claims[p][id] = 1 + rnd(3)
        }
      }
      const t = table({
        items,
        claims,
        extras: { tax: rnd(900), tip: rnd(900), discount: rnd(300) },
        participants: Object.fromEntries(people.map((p, i) => [p, { name: p, uid: p, joinedAt: i }])),
      })
      const r = computeTableTotals(t)
      expect(r.allClaimed).toBe(true)
      expect(Object.values(r.people).reduce((s, p) => s + p.total, 0)).toBe(tableTotal(t))
    }
  })
  it('the tip is split equally between the people who claimed, remainder by participant order', () => {
    // tip 301 between Ben and Cleo: Cleo joined first, so she gets the extra cent
    const r = computeTableTotals(table({ extras: { tax: 0, tip: 301, discount: 0 }, claims: { g1: { a: 1 }, g2: { b: 1 } } }))
    expect(r.people.g2.tip).toBe(151)
    expect(r.people.g1.tip).toBe(150)
    expect(r.people.host).toEqual({ items: 0, extras: 0, tip: 0, total: 0 })
    // The host claims too: now three ways
    const s = computeTableTotals(table({ extras: { tax: 0, tip: 301, discount: 0 }, claims: { g1: { a: 1 }, g2: { b: 1 }, host: { c: 1 } } }))
    expect([s.people.host.tip, s.people.g2.tip, s.people.g1.tip]).toEqual([101, 100, 100])
    expect(s.people.g1.total).toBe(1800 + 100)
  })
  it('before anyone claims, the tip is shown split between everyone at the table', () => {
    const r = computeTableTotals(table({ extras: { tax: 370, tip: 300, discount: 0 } }))
    expect([r.people.host.tip, r.people.g2.tip, r.people.g1.tip]).toEqual([100, 100, 100])
    // tax by items waits in reserve for the unclaimed items
    expect(r.people.host.extras).toBe(0)
  })
  it('the tip never follows item size, even with tax by items', () => {
    const r = computeTableTotals(table({ claims: { g1: { a: 1 }, g2: { b: 1 }, host: { c: 1 } } }))
    expect(r.people.g1).toEqual({ items: 1800, extras: 180, tip: 100, total: 2080 })
    expect(r.people.host).toEqual({ items: 900, extras: 90, tip: 100, total: 1090 })
    expect(r.people.g2).toEqual({ items: 1000, extras: 100, tip: 100, total: 1200 })
    expect(r.people.g1.total + r.people.g2.total + r.people.host.total).toBe(r.total)
  })
  it('equal mode splits tax/fees equally between the people who claimed', () => {
    const t = table({ taxSplit: 'equal', extras: { tax: 370, tip: 300, discount: 0 }, claims: { g1: { a: 1 }, g2: { b: 1 } } })
    const r = computeTableTotals(t)
    expect(r.people.g2).toEqual({ items: 1000, extras: 185, tip: 150, total: 1335 })
    expect(r.people.g1).toEqual({ items: 1800, extras: 185, tip: 150, total: 2135 })
    expect(r.people.host.total).toBe(0)
    const full = computeTableTotals({ ...t, claims: { ...t.claims, host: { c: 1 } } })
    // 370 three ways: 124 to the host (first in order), 123 each to the others
    expect([full.people.host.extras, full.people.g2.extras, full.people.g1.extras]).toEqual([124, 123, 123])
    expect(Object.values(full.people).reduce((a, p) => a + p.total, 0)).toBe(full.total)
  })
  it('a discount follows the tax mode', () => {
    const claims = { host: { a: 1 }, g1: { b: 1 }, g2: { c: 1 } }
    const byItems = computeTableTotals(table({ extras: { tax: 0, tip: 0, discount: 370 }, claims }))
    expect([byItems.people.host.extras, byItems.people.g1.extras, byItems.people.g2.extras]).toEqual([-180, -100, -90])
    const equal = computeTableTotals(table({ taxSplit: 'equal', extras: { tax: 100, tip: 0, discount: 400 }, claims }))
    expect([equal.people.host.extras, equal.people.g2.extras, equal.people.g1.extras]).toEqual([-100, -100, -100])
    expect(Object.values(equal.people).reduce((a, p) => a + p.total, 0)).toBe(equal.total)
  })
  it('random tables sum exactly in both modes once fully claimed', () => {
    let seed = 11
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let k = 0; k < 200; k++) {
      const items: LiveTable['items'] = {}
      for (let i = 0; i < 1 + rnd(6); i++) items['i' + i] = { name: 'x', amount: 1 + rnd(5000), pos: i }
      const people = ['host', 'g1', 'g2', 'g3'].slice(0, 1 + rnd(4))
      const claims: LiveTable['claims'] = {}
      for (const id of Object.keys(items)) {
        const p = people[rnd(people.length)]
        claims[p] ??= {}
        claims[p][id] = 1 + rnd(3)
      }
      const t = table({
        items,
        claims,
        taxSplit: rnd(2) ? 'equal' : 'items',
        extras: { tax: rnd(900), tip: rnd(900), discount: rnd(300) },
        participants: Object.fromEntries(people.map((p, i) => [p, { name: p, uid: p, joinedAt: i }])),
      })
      const r = computeTableTotals(t)
      expect(Object.values(r.people).reduce((s, p) => s + p.total, 0)).toBe(tableTotal(t))
      for (const p of Object.values(r.people)) expect(p.total).toBe(p.items + p.extras + p.tip)
    }
  })
  it('extras parts and the mode hint', () => {
    expect(extrasParts({ extras: 120, tip: 50 })).toEqual([
      { label: 'tax/fees', amount: 120 },
      { label: 'tip', amount: 50 },
    ])
    expect(extrasParts({ extras: -40, tip: 0 })).toEqual([{ label: 'discount', amount: -40 }])
    expect(extrasParts({ extras: 0, tip: 0 })).toEqual([])
    expect(taxSplitHint('items')).toBe('Tax, fees and discounts are shared in proportion to what each person had. Tip is always split equally.')
    expect(taxSplitHint('equal')).toBe('Tax, fees and discounts are split equally between everyone who had something. Tip is always split equally.')
  })
  it('claim leftovers for everyone', () => {
    const t = table({ claims: { g1: { a: 1 } } })
    const c = claimLeftoversForAll(t)
    expect(c.g1).toEqual({ a: 1, b: 1, c: 1 })
    expect(c.host).toEqual({ b: 1, c: 1 })
    expect(computeTableTotals({ ...t, claims: c }).allClaimed).toBe(true)
  })
})

const members: Group['members'] = {
  host: { name: 'Hana Lee', uid: 'host', color: '#000' },
  m_ben: { name: 'Ben Smith', color: '#111' },
  m_cleo: { name: 'Cléo', color: '#222' },
  m_dan: { name: 'Dan A', color: '#333' },
  m_dan2: { name: 'Dan B', color: '#444' },
}

describe('matchParticipants', () => {
  it('matches by uid, then exact name (accent/case-insensitive), then unique first name', () => {
    const r = matchParticipants(
      {
        host: { name: 'Whatever', uid: 'host', joinedAt: 0 },
        g1: { name: 'ben', uid: 'anon1', joinedAt: 1 },
        g2: { name: 'cleo', uid: 'anon2', joinedAt: 2 },
      },
      members,
    )
    expect(r).toEqual({ host: 'host', g1: 'm_ben', g2: 'm_cleo' })
  })
  it('leaves ambiguous or unknown names unmatched and never reuses a member', () => {
    const r = matchParticipants(
      {
        g1: { name: 'Dan', joinedAt: 1 },
        g2: { name: 'Zed', joinedAt: 2 },
        g3: { name: 'Ben Smith', joinedAt: 3 },
        g4: { name: 'Ben Smith', joinedAt: 4 },
      },
      members,
    )
    expect(r.g1).toBeUndefined()
    expect(r.g2).toBeUndefined()
    expect(r.g3).toBe('m_ben')
    expect(r.g4).toBeUndefined()
  })
  it('first-name match needs a single waiting participant too', () => {
    const r = matchParticipants({ a: { name: 'Ben', joinedAt: 1 }, b: { name: 'Ben K', joinedAt: 2 } }, members)
    expect(r).toEqual({ a: undefined, b: undefined })
  })
})

describe('tableToSplit', () => {
  const order = ['host', 'm_ben', 'm_cleo']
  const map = { host: 'host', g1: 'm_ben', g2: 'm_cleo' }
  // No tip and tax by items: the itemized split, same as before tips were split equally.
  const noTip = (over: Partial<LiveTable> = {}) => table({ extras: { tax: 670, tip: 0, discount: 0 }, ...over })
  it('even claims become a re-editable itemized split that sums to the total', () => {
    const t = noTip({ claims: { host: { a: 1, c: 1 }, g1: { b: 1, c: 1 }, g2: { c: 1 } } })
    const r = tableToSplit(t, map, order)
    expect(r.splitType).toBe('itemized')
    expect(r.amount).toBe(4370)
    expect(sum(r.splits)).toBe(4370)
    expect(r.splitInput.items?.map((i) => i.members)).toEqual([['host'], ['m_ben'], ['host', 'm_ben', 'm_cleo']])
  })
  it('uneven shares stay itemized, with portions on the item', () => {
    const t = noTip({ claims: { host: { a: 2 }, g1: { a: 1, b: 1 }, g2: { c: 1 } } })
    const r = tableToSplit(t, map, order)
    expect(r.splitType).toBe('itemized')
    expect(r.splitInput.items?.[0].shares).toEqual({ host: 2, [map.g1]: 1 })
    expect(r.splitInput.items?.[1].shares).toBeUndefined()
    expect(sum(r.splits)).toBe(4370)
    // host pays 2/3 of 1800 + proportional extras
    expect(r.splits.host).toBe(1200 + Math.round((1200 / 3700) * 670))
  })
  it('two participants mapped to one member merge their shares', () => {
    const t = noTip({ claims: { host: { a: 1 }, g1: { a: 1 }, g2: { a: 1, b: 1, c: 1 } } })
    const r = tableToSplit(t, { host: 'host', g1: 'host', g2: 'm_cleo' }, order)
    expect(r.splitType).toBe('itemized')
    expect(r.splitInput.items?.[0].shares).toEqual({ host: 2, m_cleo: 1 })
    expect(sum(r.splits)).toBe(4370)
  })
  it('refuses unclaimed items, unmapped claimers and empty tables', () => {
    expect(() => tableToSplit(noTip({ claims: { host: { a: 1 } } }), map, order)).toThrow(TableError)
    expect(() => tableToSplit(noTip({ claims: { host: { a: 1, b: 1, c: 1 }, g1: { a: 1 } } }), { host: 'host' }, order)).toThrow(/Ben/)
    expect(() => tableToSplit(noTip({ items: {} }), map, order)).toThrow(TableError)
  })
  it('ignores participants who claimed nothing', () => {
    const t = noTip({ claims: { host: { a: 1, b: 1, c: 1 } } })
    expect(tableToSplit(t, { host: 'host' }, order).splits).toEqual({ host: 4370 })
  })
  it('with a tip, gives the group exactly what each person saw, as exact amounts with the items attached', () => {
    const t = table({ claims: { host: { a: 1, c: 1 }, g1: { b: 1, c: 1 }, g2: { c: 1 } } })
    const r = tableToSplit(t, map, order)
    const seen = computeTableTotals(t).people
    expect(r.splitType).toBe('exact')
    expect(r.amount).toBe(4370)
    expect(r.splits).toEqual({ host: seen.host.total, m_ben: seen.g1.total, m_cleo: seen.g2.total })
    expect(r.splitInput.exact).toEqual(r.splits)
    expect(r.splitInput.items?.map((i) => i.name)).toEqual(['Pho', 'Spring rolls', 'Beer'])
    expect(sum(r.splits)).toBe(4370)
  })
  it('tax split equally (no tip) is exact too, and merges participants mapped to one member', () => {
    const t = noTip({ taxSplit: 'equal', claims: { host: { a: 1 }, g1: { b: 1 }, g2: { c: 1 } } })
    const seen = computeTableTotals(t).people
    const r = tableToSplit(t, { host: 'host', g1: 'host', g2: 'm_cleo' }, order)
    expect(r.splitType).toBe('exact')
    expect(r.splits).toEqual({ host: seen.host.total + seen.g1.total, m_cleo: seen.g2.total })
    expect(sum(r.splits)).toBe(4370)
  })
  it('exact mode still refuses unmapped claimers', () => {
    const t = table({ claims: { host: { a: 1, b: 1 }, g1: { c: 1 } } })
    expect(() => tableToSplit(t, { host: 'host' }, order)).toThrow(/Ben/)
  })
})

describe('billCheck', () => {
  const extras = (tax: number, tip: number, discount = 0) => ({ tax, tip, discount })
  it('matches with nothing printed or when everything adds up', () => {
    expect(billCheck({ itemsSum: 1000, extras: extras(50, 0) })).toEqual({ kind: 'ok', gap: 0 })
    expect(billCheck({ itemsSum: 1000, extras: extras(50, 100), printed: 1150 })).toEqual({ kind: 'ok', gap: 0 })
  })
  it('a tip paid on top of the printed bill is fine', () => {
    expect(billCheck({ itemsSum: 1000, extras: extras(50, 100), printed: 1050 })).toEqual({ kind: 'tipOnTop', gap: 0 })
  })
  it('otherwise the gap leaves the tip out, so fixing it with tax never absorbs the tip', () => {
    expect(billCheck({ itemsSum: 1000, extras: extras(50, 100), printed: 1080 })).toEqual({ kind: 'mismatch', gap: 30 })
    expect(billCheck({ itemsSum: 1000, extras: extras(0, 0, 20), printed: 1000 })).toEqual({ kind: 'mismatch', gap: 20 })
    expect(billCheck({ itemsSum: 1000, extras: extras(80, 0), printed: 1050 })).toEqual({ kind: 'mismatch', gap: -30 })
  })
})

describe('draftToTable', () => {
  it('turns the difference between total and items into tax, or a discount', () => {
    const host = { uid: 'u1', name: 'Hana', payment: { payid: 'h@x' } }
    const t = draftToTable(
      {
        merchant: ' Pho ',
        currency: 'AUD',
        date: '2026-10-07',
        total: 3000,
        items: [
          { name: 'A', amount: 1000 },
          { name: '', amount: 1500 },
          { name: 'zero', amount: 0 },
        ],
      },
      host,
      5,
      (i) => 'i' + i,
    )
    expect(t.merchant).toBe('Pho')
    expect(t.items).toEqual({ i0: { name: 'A', amount: 1000, pos: 0 }, i1: { name: 'Item 2', amount: 1500, pos: 1 } })
    expect(t.extras).toEqual({ tax: 500, tip: 0, discount: 0 })
    expect(t.participants).toEqual({ u1: { name: 'Hana', uid: 'u1', joinedAt: 5 } })
    expect(t.hostPayment).toEqual({ payid: 'h@x' })
    const d = draftToTable({ merchant: '', currency: 'AUD', date: 'x', total: 2000, items: [{ name: 'A', amount: 2500 }] }, { uid: 'u', name: 'H' })
    expect(d.extras.discount).toBe(500)
    expect(d.merchant).toBe('Bill')
    expect(d.hostPayment).toBeUndefined()
  })
})

describe('qr', () => {
  it('picks the smallest version and draws finder patterns', () => {
    expect(encodeQr('hello').size).toBe(21)
    const q = encodeQr('https://split-it.web.app/t/ABCD2345')
    expect(q.size).toBe(29)
    // finder pattern corners: dark ring, light ring, dark 3×3 centre
    for (const [x, y] of [
      [0, 0],
      [q.size - 7, 0],
      [0, q.size - 7],
    ]) {
      expect(q.modules[y][x]).toBe(true)
      expect(q.modules[y + 1][x + 1]).toBe(false)
      expect(q.modules[y + 3][x + 3]).toBe(true)
    }
    expect(qrPath(q).startsWith('M')).toBe(true)
    expect(() => encodeQr('x'.repeat(300))).toThrow()
  })
})

describe('receiptExtras', () => {
  it('keeps parsed extras when they reconcile with the total', () => {
    expect(receiptExtras([56000, 24000], { total: 79400, tax: 7380, discount: 8000 })).toEqual({ tax: 7380, tip: 0, discount: 8000 })
  })
  it('drops "includes GST" lines when the items already make the total', () => {
    expect(receiptExtras([900, 1850], { total: 2750, tax: 250 })).toEqual({ tax: 0, tip: 0, discount: 0 })
  })
  it('falls back to the gap between items and total', () => {
    expect(receiptExtras([1000, 1500], { total: 2800, tax: 50 })).toEqual({ tax: 300, tip: 0, discount: 0 })
    expect(receiptExtras([1000, 1500], { total: 2300 })).toEqual({ tax: 0, tip: 0, discount: 200 })
  })
  it('uses parsed extras as-is with no total', () => {
    expect(receiptExtras([1000], { tip: 100 })).toEqual({ tax: 0, tip: 100, discount: 0 })
  })
})
