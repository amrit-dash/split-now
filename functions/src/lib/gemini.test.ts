import { describe, expect, it } from 'vitest'
import { generateJson, listModels, normaliseReceipt, normaliseSms, normaliseStatement, RECEIPT_SCHEMA } from './gemini'

describe('normaliseReceipt', () => {
  it('converts to hundredths and folds taxes, charges and round-off', () => {
    const r = normaliseReceipt({
      isReceipt: true, merchant: '  Spice   Route ', date: '2026-10-08', currency: 'inr',
      items: [{ name: 'Paneer Tikka', quantity: 2, unitPrice: 280, amount: 560 }, { name: 'Butter Naan', quantity: 1, amount: '240.00' }, { name: '', amount: 10 }, { name: 'Free water', amount: 0 }],
      taxes: [{ label: 'CGST 2.5%', amount: 18.9 }, { label: 'SGST 2.5%', amount: 18.9 }],
      charges: 36, tip: null, discount: -80, roundOff: 0.2, total: 794,
    })
    expect(r).toEqual({
      merchant: 'Spice Route', date: '2026-10-08', currency: 'INR', total: 79400,
      items: [{ name: 'Paneer Tikka', amount: 56000, quantity: 2 }, { name: 'Butter Naan', amount: 24000 }],
      tax: 1890 + 1890 + 3600 + 20, discount: 8000,
    })
  })
  it('rejects non-receipts and junk', () => {
    expect(normaliseReceipt({ isReceipt: false, items: [{ name: 'x', amount: 5 }], taxes: [] })).toBeNull()
    expect(normaliseReceipt('nope')).toBeNull()
    expect(normaliseReceipt({ isReceipt: true, items: [], taxes: [] })).toBeNull()
  })
  it('drops impossible dates and negative round-off becomes discount', () => {
    const r = normaliseReceipt({ isReceipt: true, date: '2026-02-30', items: [{ name: 'Tea', amount: 20.4 }], taxes: [], roundOff: -0.4, total: 20 })
    expect(r).toEqual({ items: [{ name: 'Tea', amount: 2040 }], total: 2000, discount: 40 })
  })
})

describe('normaliseSms', () => {
  it('keeps debits in minor units and cleans fields', () => {
    expect(normaliseSms({ kind: 'debit', amount: 1250.5, currency: 'INR', merchant: 'Zomato', date: '2026-10-07', ref: '6283-1102 9911' }))
      .toEqual({ kind: 'debit', amount: 125050, currency: 'INR', merchant: 'Zomato', date: '2026-10-07', ref: '628311029911' })
  })
  it('returns only the kind for non-debits and ignores placeholder merchants', () => {
    expect(normaliseSms({ kind: 'credit', amount: 500 })).toEqual({ kind: 'credit', currency: 'INR' })
    expect(normaliseSms({ kind: 'debit', amount: 100, merchant: 'UPI' })).toEqual({ kind: 'debit', amount: 10000, currency: 'INR' })
    expect(normaliseSms({ kind: 'weird' })).toEqual({ kind: 'other', currency: 'INR' })
  })
  it('respects zero-decimal currencies', () => {
    expect(normaliseSms({ kind: 'debit', amount: 1200, currency: 'JPY' }, (c) => (c === 'JPY' ? 0 : 2))?.amount).toBe(1200)
  })
})

describe('generateJson', () => {
  const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 })
  it('sends the schema and key, parses the JSON answer', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return ok({ isReceipt: true }) }) as unknown as typeof fetch
    expect(await generateJson('k', [{ text: 'hi' }], RECEIPT_SCHEMA, { models: ['gemini-2.5-flash-lite'], fetchImpl: f })).toEqual({ json: { isReceipt: true }, model: 'gemini-2.5-flash-lite' })
    expect(calls[0].url).toContain('gemini-2.5-flash-lite:generateContent')
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: RECEIPT_SCHEMA })
  })
  it('falls back to the alias model on 404 and surfaces other errors', async () => {
    const seen: string[] = []
    const f = (async (url: string) => { seen.push(url); return seen.length === 1 ? new Response('gone', { status: 404 }) : ok({ a: 1 }) }) as unknown as typeof fetch
    expect(await generateJson('k', [], {}, { models: ['gemini-x', 'gemini-flash-lite-latest'], fetchImpl: f })).toEqual({ json: { a: 1 }, model: 'gemini-flash-lite-latest' })
    expect(seen[1]).toContain('gemini-flash-lite-latest')
    const bad = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: bad })).rejects.toMatchObject({ kind: 'quota' })
    const key = (async () => new Response('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: key })).rejects.toMatchObject({ kind: 'bad_key' })
  })
})

describe('normaliseStatement', () => {
  it('keeps successful rows, drops future, failed and duplicate rows', () => {
    const r = normaliseStatement({
      isStatement: true, currency: 'INR',
      transactions: [
        { date: '2026-10-06', name: 'SWIGGY INSTAMART', amount: 521, direction: 'debit', kind: 'payment', status: 'success' },
        { date: '2026-10-05', name: 'Axis Bank ••••2697 to UPI Lite', amount: 500, direction: 'debit', kind: 'self_transfer', status: 'success' },
        { date: '2026-10-05', name: 'RAJA S', amount: 82, direction: 'debit', kind: 'payment', note: 'Paid for aradhi', status: 'success' },
        { date: '2026-10-05', name: 'RAJA S', amount: 82, direction: 'debit', kind: 'payment', note: 'Paid for aradhi', status: 'success' },
        { date: '2026-10-04', name: 'Md Minahaj Khan', amount: 322, direction: 'credit', kind: 'payment', status: 'success' },
        { date: '2026-10-04', name: 'Failed one', amount: 10, direction: 'debit', kind: 'payment', status: 'failed' },
        { date: '2026-12-01', name: 'Future', amount: 10, direction: 'debit', kind: 'payment', status: 'success' },
      ],
    }, '2026-10-08')
    expect(r?.currency).toBe('INR')
    expect(r?.transactions.map((t) => [t.name, t.amount, t.direction, t.kind])).toEqual([
      ['SWIGGY INSTAMART', 52100, 'debit', 'payment'],
      ['Axis Bank ••••2697 to UPI Lite', 50000, 'debit', 'self_transfer'],
      ['RAJA S', 8200, 'debit', 'payment'],
      ['Md Minahaj Khan', 32200, 'credit', 'payment'],
    ])
    expect(r?.transactions[2].note).toBe('Paid for aradhi')
  })
  it('null when it is not a statement', () => {
    expect(normaliseStatement({ isStatement: false, transactions: [] }, '2026-10-08')).toBeNull()
  })
})

describe('listModels', () => {
  it('follows pages', async () => {
    let n = 0
    const f = (async () => new Response(JSON.stringify(n++ === 0 ? { models: [{ name: 'models/a' }], nextPageToken: 't' } : { models: [{ name: 'models/b' }] }), { status: 200 })) as unknown as typeof fetch
    expect((await listModels('k', f)).map((m) => m.name)).toEqual(['models/a', 'models/b'])
  })
})
