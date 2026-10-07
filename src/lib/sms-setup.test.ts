import { describe, expect, it } from 'vitest'
import { bodyTemplate, bodyTemplateText, checkScope, ddmmyy, interpretResponse, randomRef, sampleDate, sampleSms, tokenLabel, webhookUrl } from './sms-setup'

describe('webhook URL and body templates', () => {
  it('builds the /api/capture URL from the origin', () => {
    expect(webhookUrl('https://splitnow.web.app')).toBe('https://splitnow.web.app/api/capture')
    expect(webhookUrl('https://x.app/')).toBe('https://x.app/api/capture')
  })
  it('uses Shortcuts variables on iOS and MacroDroid magic text on Android', () => {
    expect(bodyTemplate('tok', 'ios')).toEqual({ token: 'tok', text: '[Shortcut Input]', sender: '[Sender]', device: 'ios' })
    expect(bodyTemplate('tok', 'android')).toEqual({ token: 'tok', text: '[sms_message]', sender: '[sms_number]', device: 'android' })
  })
  it('produces valid JSON text containing the token', () => {
    const t = bodyTemplateText('abc"def', 'android')
    expect(JSON.parse(t).token).toBe('abc"def')
    expect(t).toContain('\n')
  })
})

describe('checkScope', () => {
  const today = '2026-10-07'
  it('rejects the personal wallet and groups without dates', () => {
    expect(checkScope({ type: 'personal', startDate: '2026-10-01' }, today)).toMatchObject({ ok: false, state: 'personal' })
    expect(checkScope({ type: 'trip' }, today)).toMatchObject({ ok: false, state: 'no_dates' })
  })
  it('classifies live, upcoming, ended and open-ended trips', () => {
    expect(checkScope({ type: 'trip', startDate: '2026-10-01', endDate: '2026-10-10' }, today).state).toBe('live')
    expect(checkScope({ type: 'trip', startDate: '2026-11-01', endDate: '2026-11-10' }, today).state).toBe('upcoming')
    expect(checkScope({ type: 'trip', startDate: '2026-09-01', endDate: '2026-09-10' }, today).state).toBe('ended')
    expect(checkScope({ type: 'event', startDate: '2026-10-01' }, today)).toMatchObject({ ok: true, state: 'open' })
  })
})

describe('sample SMS', () => {
  it('formats dates the way Indian banks do', () => {
    expect(ddmmyy('2026-10-07')).toBe('07-10-26')
  })
  it('clamps the test date into the trip window', () => {
    expect(sampleDate('2026-10-07')).toBe('2026-10-07')
    expect(sampleDate('2026-10-07', { startDate: '2026-10-01', endDate: '2026-10-10' })).toBe('2026-10-07')
    expect(sampleDate('2026-10-07', { startDate: '2026-11-01', endDate: '2026-11-10' })).toBe('2026-11-01')
    expect(sampleDate('2026-10-07', { startDate: '2026-09-01', endDate: '2026-09-10' })).toBe('2026-09-10')
  })
  it('builds a UPI debit alert with the date and reference', () => {
    const s = sampleSms('2026-10-07', '987654321098')
    expect(s).toContain('Rs.250.00 debited')
    expect(s).toContain('on 07-10-26')
    expect(s).toContain('UPI Ref No 987654321098')
  })
  it('makes 12-digit references without a leading zero', () => {
    for (let i = 0; i < 20; i++) expect(randomRef()).toMatch(/^[1-9]\d{11}$/)
  })
  it('labels tokens by scope', () => {
    expect(tokenLabel()).toBe('All my trips')
    expect(tokenLabel({ name: 'Goa 2026' })).toBe('Goa 2026')
  })
})

describe('interpretResponse', () => {
  it('passes a success through', () => {
    const r = { ok: true, captureId: 'c1', parsed: { amount: 25000, currency: 'INR', direction: 'debit', date: '2026-10-07' }, pushed: true }
    expect(interpretResponse(200, r)).toEqual({ kind: 'ok', response: r })
  })
  it('explains known rejection reasons', () => {
    expect(interpretResponse(200, { ok: false, reason: 'outside_trip' })).toMatchObject({ kind: 'rejected', reason: 'outside_trip' })
    expect(interpretResponse(403, { ok: false, reason: 'bad_token' }).kind).toBe('rejected')
    expect(interpretResponse(400, { ok: false, reason: 'weird' })).toMatchObject({ kind: 'rejected', message: 'Rejected: weird' })
  })
  it('detects a missing backend', () => {
    expect(interpretResponse(404, null).kind).toBe('not_deployed')
    expect(interpretResponse(200, null).kind).toBe('not_deployed')
    expect(interpretResponse(500, null)).toEqual({ kind: 'error', message: 'The server answered 500.' })
  })
})
