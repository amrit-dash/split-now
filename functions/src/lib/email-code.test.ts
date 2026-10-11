import { describe, expect, it } from 'vitest'
import { checkCode, checkMessage, cleanCode, CODE_TTL_MS, hashCode, MAX_ATTEMPTS, newCode, resendWait, RESEND_GAP_MS, type StoredCode } from './email-code'

const stored = (over: Partial<StoredCode> = {}): StoredCode => ({
  email: 'priya@x.com',
  purpose: 'verify',
  salt: 's1',
  hash: hashCode('042137', 's1'),
  expiresAt: 1_000 + CODE_TTL_MS,
  attempts: 0,
  sentAt: 1_000,
  ...over,
})

describe('email codes', () => {
  it('are six digits, leading zeros kept', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/)
  })
  it('read what people type or paste', () => {
    expect(cleanCode('042137')).toBe('042137')
    expect(cleanCode(' 042 137 ')).toBe('042137')
    expect(cleanCode('042-137')).toBe('042137')
    expect(cleanCode('42137')).toBe('')
    expect(cleanCode('04213a')).toBe('')
    expect(cleanCode(42137)).toBe('')
  })
  it('the right code for the right email and purpose, in time', () => {
    expect(checkCode(stored(), 'priya@x.com', 'verify', '042137', 2_000)).toBe('ok')
  })
  it('refuse a wrong code, another email, another purpose, a late or a used-up code', () => {
    expect(checkCode(stored(), 'priya@x.com', 'verify', '042138', 2_000)).toBe('wrong')
    expect(checkCode(stored(), 'sam@x.com', 'verify', '042137', 2_000)).toBe('other-email')
    expect(checkCode(stored(), 'priya@x.com', 'add', '042137', 2_000)).toBe('missing')
    expect(checkCode(undefined, 'priya@x.com', 'verify', '042137', 2_000)).toBe('missing')
    expect(checkCode(stored(), 'priya@x.com', 'verify', '042137', 1_001 + CODE_TTL_MS)).toBe('expired')
    expect(checkCode(stored({ attempts: MAX_ATTEMPTS }), 'priya@x.com', 'verify', '042137', 2_000)).toBe('locked')
  })
  it('a new code waits 30 seconds after the last', () => {
    expect(resendWait(undefined, 5_000)).toBe(0)
    expect(resendWait(stored(), 1_000 + 10_000)).toBe(RESEND_GAP_MS - 10_000)
    expect(resendWait(stored(), 1_000 + RESEND_GAP_MS)).toBe(0)
  })
  it('say what went wrong in plain words', () => {
    expect(checkMessage('wrong')).toMatch(/isn’t right/)
    expect(checkMessage('expired')).toMatch(/expired/)
    expect(checkMessage('locked')).toMatch(/Too many/)
    expect(checkMessage('missing')).toMatch(/new code/)
  })
})
