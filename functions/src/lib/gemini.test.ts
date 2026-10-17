import { describe, expect, it } from 'vitest'
import {
  gemmaParts,
  GeminiError,
  googleMessage,
  pictureRefusal,
  generateImage,
  generateText,
  generateJson,
  listModels,
  looseJson,
  plainInstruction,
  normaliseReceipt,
  normaliseSms,
  normaliseStatement,
  RECEIPT_SCHEMA,
  normalisePayment,
} from './gemini'

describe('normaliseReceipt', () => {
  it('converts to hundredths and folds taxes, charges and round-off', () => {
    const r = normaliseReceipt({
      isReceipt: true,
      merchant: '  Spice   Route ',
      date: '2026-10-08',
      currency: 'inr',
      items: [
        { name: 'Paneer Tikka', quantity: 2, unitPrice: 280, amount: 560 },
        { name: 'Butter Naan', quantity: 1, amount: '240.00' },
        { name: '', amount: 10 },
        { name: 'Free water', amount: 0 },
      ],
      taxes: [
        { label: 'CGST 2.5%', amount: 18.9 },
        { label: 'SGST 2.5%', amount: 18.9 },
      ],
      charges: 36,
      tip: null,
      discount: -80,
      roundOff: 0.2,
      total: 794,
    })
    expect(r).toEqual({
      merchant: 'Spice Route',
      date: '2026-10-08',
      currency: 'INR',
      total: 79400,
      items: [
        { name: 'Paneer Tikka', amount: 56000, quantity: 2 },
        { name: 'Butter Naan', amount: 24000 },
      ],
      tax: 1890 + 1890 + 3600 + 20,
      discount: 8000,
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
    expect(normaliseSms({ kind: 'debit', amount: 1250.5, currency: 'INR', merchant: 'Zomato', date: '2026-10-07', ref: '6283-1102 9911' })).toEqual({
      kind: 'debit',
      amount: 125050,
      currency: 'INR',
      merchant: 'Zomato',
      date: '2026-10-07',
      ref: '628311029911',
    })
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
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return ok({ isReceipt: true })
    }) as unknown as typeof fetch
    expect(await generateJson('k', [{ text: 'hi' }], RECEIPT_SCHEMA, { models: ['gemini-2.5-flash-lite'], fetchImpl: f })).toMatchObject({
      json: { isReceipt: true },
      model: 'gemini-2.5-flash-lite',
    })
    expect(calls[0].url).toContain('gemini-2.5-flash-lite:generateContent')
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: RECEIPT_SCHEMA })
  })
  it('falls back to the alias model on 404 and surfaces other errors', async () => {
    const seen: string[] = []
    const f = (async (url: string) => {
      seen.push(url)
      return seen.length === 1 ? new Response('gone', { status: 404 }) : ok({ a: 1 })
    }) as unknown as typeof fetch
    expect(await generateJson('k', [], {}, { models: ['gemini-x', 'gemini-flash-lite-latest'], fetchImpl: f })).toMatchObject({
      json: { a: 1 },
      model: 'gemini-flash-lite-latest',
    })
    expect(seen[1]).toContain('gemini-flash-lite-latest')
    const bad = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: bad })).rejects.toMatchObject({ kind: 'quota' })
    const key = (async () =>
      new Response('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: key })).rejects.toMatchObject({ kind: 'bad_key' })
  })
  it('treats a 403 about the model as "try the next model", a leaked key as bad_key, 402 as billing', async () => {
    const seen: string[] = []
    const f = (async (url: string) => {
      seen.push(url)
      return seen.length === 1
        ? new Response('{"error":{"message":"Model gemini-2.5-flash-lite is not available for this project"}}', { status: 403 })
        : ok({ a: 1 })
    }) as unknown as typeof fetch
    expect(await generateJson('k', [], {}, { models: ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'], fetchImpl: f })).toMatchObject({
      model: 'gemini-3.5-flash-lite',
    })
    const leaked = (async () => new Response('{"error":{"message":"Your API key was reported as leaked"}}', { status: 403 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: leaked })).rejects.toMatchObject({ kind: 'bad_key' })
    const billing = (async () => new Response('{"error":{"status":"FAILED_PRECONDITION"}}', { status: 400 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: billing })).rejects.toMatchObject({ kind: 'billing' })
  })
  it('retries once on 429 / 5xx, then gives up', async () => {
    let n = 0
    const flaky = (async () => (++n === 1 ? new Response('busy', { status: 503 }) : ok({ a: 1 }))) as unknown as typeof fetch
    expect(await generateJson('k', [], {}, { models: ['m'], fetchImpl: flaky, retryDelayMs: 0 })).toMatchObject({ json: { a: 1 } })
    expect(n).toBe(2)
    n = 0
    const down = (async () => {
      n++
      return new Response('down', { status: 500 })
    }) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: down, retryDelayMs: 0 })).rejects.toMatchObject({ kind: 'server' })
    expect(n).toBe(2)
  })
  it('reports safety blocks and truncated answers as their own kinds, and token usage', async () => {
    const blocked = (async () =>
      new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }), { status: 200 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m', 'n'], fetchImpl: blocked })).rejects.toMatchObject({ kind: 'blocked' })
    const budgets: number[] = []
    const cut = (async (_u: string, init: RequestInit) => {
      budgets.push(JSON.parse(String(init.body)).generationConfig.maxOutputTokens)
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] }), { status: 200 })
    }) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['m'], fetchImpl: cut })).rejects.toMatchObject({ kind: 'truncated' })
    expect(budgets).toEqual([8192, 16384])
    const usage = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 },
          modelVersion: 'gemini-3.5-flash-lite-001',
        }),
        { status: 200 },
      )) as unknown as typeof fetch
    expect(await generateJson('k', [], {}, { models: ['m'], fetchImpl: usage })).toMatchObject({
      usage: { promptTokens: 1200, outputTokens: 300, thoughtTokens: 50 },
      modelVersion: 'gemini-3.5-flash-lite-001',
    })
  })
  it('puts the rules in systemInstruction when given', async () => {
    const calls: string[] = []
    const f = (async (_u: string, init: RequestInit) => {
      calls.push(String(init.body))
      return ok({ a: 1 })
    }) as unknown as typeof fetch
    await generateJson('k', [{ text: '<sms>x</sms>' }], {}, { models: ['m'], fetchImpl: f, systemInstruction: 'Rules' })
    expect(JSON.parse(calls[0]).systemInstruction).toEqual({ parts: [{ text: 'Rules' }] })
  })
  it('Gemma: tries the schema first, and when refused, sends the rules and schema as text and reads the JSON out of the answer', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const answer = (text: string, extra: Array<{ text: string; thought?: boolean }> = []) =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [...extra, { text }] }, finishReason: 'STOP' }] }), { status: 200 })
    let n = 0
    const f = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      n++
      if (n === 1) return new Response('{"error":{"code":400,"message":"JSON mode is not enabled for models/gemma-4-26b-a4b-it"}}', { status: 400 })
      return answer('Here you go:\n```json\n{"isReceipt": true}\n```', [{ text: 'Let me look at the bill…', thought: true }])
    }) as unknown as typeof fetch
    const r = await generateJson('k', [{ text: 'bill' }], RECEIPT_SCHEMA, { models: ['gemma-4-26b-a4b-it'], fetchImpl: f, systemInstruction: 'Rules' })
    expect(r).toMatchObject({ json: { isReceipt: true }, model: 'gemma-4-26b-a4b-it' })
    expect(bodies[0].generationConfig).toMatchObject({ responseSchema: RECEIPT_SCHEMA })
    expect(bodies[1].systemInstruction).toBeUndefined()
    expect(bodies[1].generationConfig).toEqual({ maxOutputTokens: 8192 })
    const parts = (bodies[1].contents as Array<{ parts: Array<{ text?: string }> }>)[0].parts
    expect(parts[0].text).toBe(plainInstruction('Rules', RECEIPT_SCHEMA))
    expect(parts[1]).toEqual({ text: 'bill' })
    // Remembered: the next call goes straight to plain mode.
    await generateJson('k', [{ text: 'bill' }], RECEIPT_SCHEMA, { models: ['gemma-4-26b-a4b-it'], fetchImpl: f })
    expect(bodies).toHaveLength(3)
    expect(bodies[2].generationConfig).toEqual({ maxOutputTokens: 8192 })
  })
  it('Gemma: a bad key is still a bad key, and Gemini models are never switched to plain mode', async () => {
    const bad = (async () => new Response('API key not valid. Please pass a valid API key.', { status: 400 })) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['gemma-4-31b-it'], fetchImpl: bad })).rejects.toMatchObject({ kind: 'bad_key' })
    let calls = 0
    const refuse = (async () => {
      calls++
      return new Response('{"error":{"code":400,"message":"Invalid argument"}}', { status: 400 })
    }) as unknown as typeof fetch
    await expect(generateJson('k', [], {}, { models: ['gemini-3.5-flash-lite'], fetchImpl: refuse })).rejects.toMatchObject({ kind: 'server' })
    expect(calls).toBe(1)
  })
})

describe('looseJson', () => {
  it('reads a bare object, a fenced one, or the object inside prose', () => {
    expect(looseJson('{"a":1}')).toEqual({ a: 1 })
    expect(looseJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(looseJson('Sure. {"a":{"b":3}} Done.')).toEqual({ a: { b: 3 } })
    expect(() => looseJson('no json here')).toThrow()
  })
})

describe('normaliseStatement', () => {
  it('keeps successful rows, drops future, failed and duplicate rows', () => {
    const r = normaliseStatement(
      {
        isStatement: true,
        currency: 'INR',
        transactions: [
          { date: '2026-10-06', name: 'SWIGGY INSTAMART', amount: 521, direction: 'debit', kind: 'payment', status: 'success' },
          { date: '2026-10-05', name: 'Axis Bank ••••2697 to UPI Lite', amount: 500, direction: 'debit', kind: 'self_transfer', status: 'success' },
          { date: '2026-10-05', name: 'RAJA S', amount: 82, direction: 'debit', kind: 'payment', note: 'Paid for aradhi', status: 'success' },
          { date: '2026-10-05', name: 'RAJA S', amount: 82, direction: 'debit', kind: 'payment', note: 'Paid for aradhi', status: 'success' },
          { date: '2026-10-04', name: 'Md Minahaj Khan', amount: 322, direction: 'credit', kind: 'payment', status: 'success' },
          { date: '2026-10-04', name: 'Failed one', amount: 10, direction: 'debit', kind: 'payment', status: 'failed' },
          { date: '2026-12-01', name: 'Future', amount: 10, direction: 'debit', kind: 'payment', status: 'success' },
        ],
      },
      '2026-10-08',
    )
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
    const f = (async () =>
      new Response(JSON.stringify(n++ === 0 ? { models: [{ name: 'models/a' }], nextPageToken: 't' } : { models: [{ name: 'models/b' }] }), {
        status: 200,
      })) as unknown as typeof fetch
    expect((await listModels('k', f)).map((m) => m.name)).toEqual(['models/a', 'models/b'])
  })
})

describe('normalisePayment', () => {
  const digits = (c: string) => (c === 'JPY' ? 0 : 2)
  it('turns what the model read into minor units of the shown currency, with the payee and reference', () => {
    expect(
      normalisePayment(
        {
          isPayment: true,
          amount: '1,250.50',
          currency: 'inr',
          payee: ' ROHAN  SHARMA ',
          payeeHandle: 'rohan@okhdfc',
          date: '2026-10-09',
          status: 'success',
          ref: '123456789012',
        },
        'INR',
        digits,
      ),
    ).toEqual({
      amount: 125050,
      currency: 'INR',
      payee: 'ROHAN SHARMA',
      payeeHandle: 'rohan@okhdfc',
      date: '2026-10-09',
      status: 'success',
      ref: '123456789012',
    })
  })
  it('falls back to the expected currency for the minor units; drops what isn’t valid', () => {
    expect(normalisePayment({ isPayment: true, amount: 2000, date: '2026-02-30', status: 'weird' }, 'JPY', digits)).toEqual({ amount: 2000, status: 'unknown' })
    expect(normalisePayment({ isPayment: true, amount: -5, status: 'failed' }, 'INR', digits)).toEqual({ status: 'failed' })
  })
  it('not a payment screenshot is null', () => {
    expect(normalisePayment({ isPayment: false, amount: 5 }, 'INR', digits)).toBeNull()
    expect(normalisePayment('nope', 'INR', digits)).toBeNull()
  })
})

describe('generateImage', () => {
  const ok = (parts: unknown[], finishReason = 'STOP') =>
    new Response(JSON.stringify({ candidates: [{ content: { parts }, finishReason }], modelVersion: 'v' }), { status: 200 })
  it('asks for a square image and answers its bytes', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return ok([{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }])
    }) as unknown as typeof fetch
    const r = await generateImage('k', 'draw', { models: ['m1'], fetchImpl })
    expect(r).toMatchObject({ data: 'AAAA', mimeType: 'image/png', model: 'm1' })
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } })
  })
  it('moves to the next model when one is unknown to the key', async () => {
    const seen: string[] = []
    const fetchImpl = (async (u: string) => {
      seen.push(u)
      return u.includes('m1') ? new Response('model not found', { status: 404 }) : ok([{ inlineData: { mimeType: 'image/jpeg', data: 'BB' } }])
    }) as unknown as typeof fetch
    expect((await generateImage('k', 'd', { models: ['m1', 'm2'], fetchImpl })).model).toBe('m2')
    expect(seen).toHaveLength(2)
  })
  it('a refusal is blocked; no image or an odd type is an error', async () => {
    const f = (r: Response) => (async () => r) as unknown as typeof fetch
    await expect(generateImage('k', 'd', { models: ['m'], fetchImpl: f(ok([], 'IMAGE_SAFETY')) })).rejects.toMatchObject({ kind: 'blocked' })
    await expect(generateImage('k', 'd', { models: ['m'], fetchImpl: f(ok([{ text: 'no' }])) })).rejects.toThrow(/no picture/)
    await expect(generateImage('k', 'd', { models: ['m'], fetchImpl: f(ok([{ inlineData: { mimeType: 'image/svg+xml', data: 'x' } }])) })).rejects.toThrow(
      /no picture/,
    )
  })
})

describe('generateText', () => {
  const reply = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text }] }, finishReason: 'STOP' }] }), {
      status: 200,
    })
  it('Gemma gets the instruction in the message, Gemini as a system instruction; thoughts are dropped', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return reply('EMOJI: 🍕')
    }) as unknown as typeof fetch
    expect((await generateText('k', [{ text: 't' }], { models: ['gemma-4-26b-a4b-it'], systemInstruction: 'rules', fetchImpl })).text).toBe('EMOJI: 🍕')
    expect(bodies[0].systemInstruction).toBeUndefined()
    // one part (a separate title part read as missing), and no thinking (it used up the allowance and answered nothing)
    expect(bodies[0].contents).toEqual([{ role: 'user', parts: [{ text: 'rules\n\nt' }] }])
    expect(bodies[0].generationConfig).toEqual({ maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'minimal' } })
    await generateText('k', [{ text: 't' }], { models: ['gemini-3.5-flash-lite'], systemInstruction: 'rules', fetchImpl })
    expect(bodies[1].systemInstruction).toEqual({ parts: [{ text: 'rules' }] })
    expect(bodies[1].generationConfig).toEqual({ maxOutputTokens: 4096 })
  })
  it('Gemma’s message: the instruction and text in one part; with an image, kept apart', () => {
    expect(gemmaParts('rules', [{ text: 'a' }, { text: 'b' }])).toEqual([{ text: 'rules\n\na\n\nb' }])
    expect(gemmaParts(undefined, [{ text: 'a' }])).toEqual([{ text: 'a' }])
    const img = { inlineData: { mimeType: 'image/jpeg', data: 'AA' } }
    expect(gemmaParts('rules', [img])).toEqual([{ text: 'rules' }, img])
  })
})

describe('why a picture was refused', () => {
  const err = (status: number, body: string) => new GeminiError(`Gemini ${status}`, status, body)
  it('tells a spent credit from no billing from a rate limit', () => {
    expect(pictureRefusal(err(402, '{"error":{"message":"Your prepayment credits are depleted."}}'))).toBe('picture_credit')
    expect(pictureRefusal(err(429, 'Your prepayment credits are depleted. Please top up.'))).toBe('picture_credit')
    expect(
      pictureRefusal(err(429, 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: x')),
    ).toBe('picture_billing')
    expect(pictureRefusal(err(400, 'FAILED_PRECONDITION: billing is not enabled'))).toBe('picture_billing')
    expect(pictureRefusal(err(429, 'Quota exceeded for metric: generate_requests_per_model, limit: 10'))).toBe('picture_busy')
  })
  it('passes the rest through', () => {
    expect(pictureRefusal(err(404, 'not found'))).toBe('model')
    expect(pictureRefusal(err(400, 'API key not valid'))).toBe('bad_key')
    expect(pictureRefusal(new GeminiError('no', undefined, '', 'blocked'))).toBe('blocked')
    expect(pictureRefusal(err(500, 'boom'))).toBe('server')
  })
})

describe("Google's own words", () => {
  it('reads error.message, also from a cut-short body, and never shows a key', () => {
    expect(googleMessage('{"error":{"code":402,"message":"Your prepayment credits are depleted."}}')).toBe('Your prepayment credits are depleted.')
    expect(googleMessage('{"error":{"code":429,"message":"Quota exceeded,\\n limit: 0","details":[{"x')).toBe('Quota exceeded, limit: 0')
    expect(googleMessage('plain text')).toBe('plain text')
    expect(googleMessage(`key AIza${'x'.repeat(35)} bad`)).toBe('key … bad')
    expect(googleMessage('a'.repeat(400))).toHaveLength(240)
  })
})
