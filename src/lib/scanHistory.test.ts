import { beforeEach, describe, expect, it } from 'vitest'
import {
  addEntry,
  clearHistory,
  deleteScan,
  describeScan,
  findMatch,
  hamming,
  HISTORY_LIMIT,
  loadHistory,
  memoryStore,
  onHistoryChange,
  phashFromGray,
  PHASH_SIZE,
  recordOutcome,
  removeEntry,
  samePrint,
  saveScan,
  scannedSentence,
  scannedWhen,
  setHistoryStore,
  type HistoryStore,
  type ScanEntry,
  type ScanKind,
  type ScanPrint,
} from './scanHistory'

const hex = (bit: number) =>
  '0'
    .repeat(36)
    .split('')
    .map((c, i) => (i === Math.floor(bit / 4) ? (8 >> (bit % 4)).toString(16) : c))
    .join('')
const ZERO = '0'.repeat(36)
const F = 'f'.repeat(36)
/** a pseudo-random 144-bit hash per seed, so unrelated test images don't look alike */
const rnd = (seed: string) => {
  let x = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return Array.from({ length: 36 }, () => {
    x = (x * 1103515245 + 12345) >>> 0
    return ((x >>> 16) & 15).toString(16)
  }).join('')
}
const print = (sha: string, phash = rnd(sha), ratio = 0.5): ScanPrint => ({ sha, phash, ratio })
let n = 0
const entry = (kind: ScanKind, prints: ScanPrint[], at = ++n): ScanEntry => ({
  id: `e${at}`,
  kind,
  at,
  thumb: 'data:image/jpeg;base64,',
  prints,
  result: { type: 'receipt', receipt: { merchant: 'TOIT', total: 234000, items: [{ name: 'Beer', amount: 40000 }] } },
})

describe('hamming / phash', () => {
  it('counts differing bits', () => {
    expect(hamming(ZERO, ZERO)).toBe(0)
    expect(hamming(ZERO, F)).toBe(144)
    expect(hamming(ZERO, hex(5))).toBe(1)
    expect(hamming('ab', 'abc')).toBe(Infinity)
    expect(hamming(undefined as unknown as string, ZERO)).toBe(Infinity)
  })
  it('gives alike images close hashes and different ones far apart', () => {
    const N = PHASH_SIZE
    const img = (f: (x: number, y: number) => number) => Float64Array.from({ length: N * N }, (_, i) => f(i % N, Math.floor(i / N)))
    // A "receipt": a light rectangle with dark text lines on a darker table.
    const bill = (dx: number, rows: number[]) =>
      img((x, y) => (x > 12 + dx && x < 50 + dx && y > 4 && y < 60 ? (rows.includes(Math.floor(y / 4)) && x % 3 ? 60 : 245) : 90))
    const a = phashFromGray(bill(0, [3, 5, 7, 9, 11]))
    expect(a).toHaveLength(36)
    const noisy = phashFromGray(Float64Array.from(bill(0, [3, 5, 7, 9, 11]), (v, i) => v + ((i * 7919) % 13) - 6))
    const brighter = phashFromGray(Float64Array.from(bill(0, [3, 5, 7, 9, 11]), (v) => v * 0.9 + 20))
    const other = phashFromGray(img((x, y) => ((x * 3 + y * 5) % 64) * 4))
    expect(hamming(a, noisy)).toBeLessThanOrEqual(8)
    expect(hamming(a, brighter)).toBeLessThanOrEqual(2)
    expect(hamming(a, other)).toBeGreaterThan(40)
  })
})

describe('samePrint', () => {
  it('matches the same file exactly', () => {
    expect(samePrint(print('abc', F), print('abc', ZERO), 'statement')).toBe(true)
  })
  it('matches a re-shot bill photo, but screenshots only on the same pixels', () => {
    const bits = (k: number) => {
      const c = ZERO.split('')
      for (let i = 0; i < k / 4; i++) c[i] = 'f'
      return c.join('')
    }
    const a = print('a', ZERO)
    expect(samePrint(a, print('b', bits(28)), 'receipt')).toBe(true)
    expect(samePrint(a, print('b', bits(28)), 'bill')).toBe(true)
    expect(samePrint(a, print('b', bits(40)), 'receipt')).toBe(false)
    expect(samePrint(a, print('b', bits(4)), 'payment')).toBe(false)
    expect(samePrint(a, print('b', bits(4)), 'statement')).toBe(false)
    expect(samePrint({ ...a, pix: 'p1' }, { ...print('b', bits(4)), pix: 'p1' }, 'statement')).toBe(true)
    expect(samePrint({ ...a, pix: 'p1' }, { ...print('b', ZERO), pix: 'p2' }, 'statement')).toBe(false)
    expect(samePrint(print('p'), print('q'), 'receipt')).toBe(false)
  })
  it('needs a similar shape', () => {
    expect(samePrint(print('a', ZERO, 0.5), print('b', ZERO, 0.75), 'receipt')).toBe(false)
    expect(samePrint(print('a', ZERO, 0.5), print('b', ZERO, 0.52), 'receipt')).toBe(true)
  })
})

describe('addEntry / findMatch', () => {
  it('keeps the newest first and caps the list', () => {
    let list: ScanEntry[] = []
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) list = addEntry(list, entry('receipt', [print(`s${i}`)]))
    expect(list).toHaveLength(HISTORY_LIMIT)
    expect(list[0].prints[0].sha).toBe(`s${HISTORY_LIMIT + 2}`)
    expect(list.at(-1)!.prints[0].sha).toBe('s3')
  })
  it('replaces an earlier scan of the same image', () => {
    const old = entry('receipt', [print('x')])
    const list = addEntry(addEntry([], old), entry('receipt', [print('x')]))
    expect(list).toHaveLength(1)
    expect(list[0].id).not.toBe(old.id)
  })
  it('finds a scan that has every picked image', () => {
    const a = entry('statement', [print('1', ZERO, 0.5), print('2', F, 0.5)])
    const b = entry('statement', [print('3', ZERO, 2)])
    const list = [a, b]
    expect(findMatch(list, [print('2', F)])).toEqual({ entry: a, exact: true })
    expect(findMatch(list, [print('1'), print('2', F)])?.entry.id).toBe(a.id)
    expect(findMatch(list, [print('1'), print('9', F, 2)])).toBeUndefined()
    expect(findMatch(list, [])).toBeUndefined()
  })
  it('prefers the most recent match', () => {
    const a = entry('receipt', [print('a', ZERO)], 100)
    const b = entry('bill', [print('b', ZERO)], 200)
    expect(findMatch([a, b], [print('z', ZERO)])).toEqual({ entry: b, exact: false })
  })
  it('removes one', () => {
    const a = entry('receipt', [print('a')])
    expect(removeEntry([a], a.id)).toEqual([])
  })
})

describe('describeScan', () => {
  it('sums up a receipt, a payment and a statement', () => {
    expect(describeScan(entry('receipt', []), 'INR')).toEqual({ title: 'Toit', detail: expect.stringMatching(/^₹2,340(\.00)? · 1 item$/) })
    expect(describeScan({ result: { type: 'payment', payment: { amount: 50000, payee: 'Raja S', method: 'GPay' } } }, 'INR')).toEqual({
      title: 'Raja S',
      detail: expect.stringMatching(/^₹500(\.00)? · GPay$/),
    })
    expect(
      describeScan(
        {
          result: {
            type: 'statement',
            currency: 'INR',
            transactions: [
              { date: '2026-10-01', name: 'A', amount: 10000, direction: 'debit', kind: 'payment' },
              { date: '2026-10-01', name: 'B', amount: 5000, direction: 'credit', kind: 'payment' },
            ],
          },
        },
        'AUD',
      ),
    ).toEqual({ title: '2 transactions', detail: expect.stringMatching(/^₹100(\.00)? out$/) })
    expect(describeScan({ result: { type: 'receipt', receipt: { items: [] } } }, 'AUD').detail).toBe('No total')
  })
})

describe('scannedWhen', () => {
  const now = new Date(2026, 9, 8, 15, 0).getTime()
  it('says today / yesterday / the date', () => {
    expect(scannedWhen(new Date(2026, 9, 8, 9, 5).getTime(), now)).toMatch(/^today, /)
    expect(scannedWhen(new Date(2026, 9, 7, 23).getTime(), now)).toBe('yesterday')
    expect(scannedSentence(new Date(2026, 9, 1).getTime(), now)).toMatch(/^You scanned this on /)
    expect(scannedSentence(new Date(2026, 9, 8, 9).getTime(), now)).toMatch(/^You scanned this today/)
    expect(scannedSentence(new Date(2026, 9, 1).getTime(), now, false)).toMatch(/^Looks like one you scanned on /)
    expect(scannedWhen(new Date(2025, 9, 1).getTime(), now)).toMatch(/2025/)
  })
})

describe('storage', () => {
  beforeEach(() => setHistoryStore(memoryStore()))

  it('is kept per user and per kind', async () => {
    await saveScan('u1', entry('receipt', [print('a')]))
    await saveScan('u1', entry('payment', [print('b')]))
    await saveScan('u2', entry('receipt', [print('c')]))
    expect((await loadHistory('u1', 'receipt')).map((e) => e.prints[0].sha)).toEqual(['a'])
    expect((await loadHistory('u1', 'payment')).map((e) => e.prints[0].sha)).toEqual(['b'])
    expect((await loadHistory('u2', 'receipt')).map((e) => e.prints[0].sha)).toEqual(['c'])
  })

  it('records an outcome, deletes and clears, and tells listeners', async () => {
    const seen: string[] = []
    const off = onHistoryChange((k) => seen.push(k))
    const a = entry('statement', [print('a')]),
      b = entry('statement', [print('b')])
    await saveScan('u1', a)
    await saveScan('u1', b)
    await recordOutcome('u1', 'statement', a.id, { label: 'Added 3 to Goa', href: '/groups/g1' })
    expect((await loadHistory('u1', 'statement')).find((e) => e.id === a.id)?.outcome).toMatchObject({ label: 'Added 3 to Goa', href: '/groups/g1' })
    await deleteScan('u1', 'statement', b.id)
    expect((await loadHistory('u1', 'statement')).map((e) => e.id)).toEqual([a.id])
    await clearHistory('u1', 'statement')
    expect(await loadHistory('u1', 'statement')).toEqual([])
    off()
    expect(seen.every((k) => k === 'u1:statement')).toBe(true)
    expect(seen).toHaveLength(5)
  })

  it('turns itself off when storage fails', async () => {
    const broken: HistoryStore = {
      get: () => Promise.reject(new Error('no')),
      set: () => Promise.reject(new Error('no')),
      del: () => Promise.reject(new Error('no')),
    }
    setHistoryStore(broken)
    expect(await saveScan('u1', entry('receipt', [print('a')]))).toBe(false)
    expect(await loadHistory('u1', 'receipt')).toEqual([])
    await expect(clearHistory('u1', 'receipt')).resolves.toBeUndefined()
  })
})
