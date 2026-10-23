import { describe, expect, it } from 'vitest'
import { appErrorReport, reportGate, voiceProblem } from './app-errors'

const ctx = { uid: 'u1', kind: 'crash' as const, path: '/groups/g1?tab=balances#x', version: '7.2.0', ua: 'UA', standalone: true, now: 5 }

describe('app error reports', () => {
  it('keeps what helps debugging and masks long numbers', () => {
    const e = new TypeError('cannot read 9876543210')
    const r = appErrorReport(e, ctx)
    expect(r).toMatchObject({ uid: 'u1', at: 5, kind: 'crash', route: '/groups/g1', version: '7.2.0', ua: 'UA', mode: 'standalone' })
    expect(r.message).toBe('TypeError: cannot read ••••••••10')
    expect(r.stack?.split('\n').length).toBeLessThanOrEqual(12)
  })
  it('reads strings and objects, and caps the length', () => {
    expect(appErrorReport('boom', ctx).message).toBe('boom')
    expect(appErrorReport({ code: 'x' }, ctx).message).toBe('{"code":"x"}')
    expect(appErrorReport('y'.repeat(900), ctx).message).toHaveLength(500)
    expect(appErrorReport(new Error('n'), { ...ctx, standalone: false }).mode).toBe('browser')
  })
  it('sends each message once, and a few per session at most', () => {
    const ok = reportGate(2)
    expect(ok({ kind: 'crash', message: 'a' })).toBe(true)
    expect(ok({ kind: 'crash', message: 'a' })).toBe(false)
    expect(ok({ kind: 'save', message: 'a' })).toBe(true)
    expect(ok({ kind: 'crash', message: 'b' })).toBe(false)
  })
})

describe('voiceProblem', () => {
  it('one line with the stage, the browser’s code and what the app knew', () => {
    expect(voiceProblem({ stage: 'mic', code: 'NotReadableError', engine: 'ai', perm: 'granted', native: true, recorder: true, okBefore: false })).toBe(
      'voice mic: NotReadableError | engine=ai perm=granted native=1 rec=1 ok=0',
    )
    expect(voiceProblem({ stage: 'speech', engine: null, perm: 'unknown', native: false, recorder: false, okBefore: true })).toMatch(
      /^voice speech: unknown \| engine=none/,
    )
  })
})
