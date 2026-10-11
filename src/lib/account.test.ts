import { describe, expect, it } from 'vitest'
import { accountEmailsOf, emailProblem, needsEmailCode, resendIn } from './account'

describe('needsEmailCode', () => {
  const base = { uid: 'u', displayName: 'Priya' }
  it('an email-and-password account that hasn’t confirmed its email waits for the code', () => {
    expect(needsEmailCode({ ...base, providers: ['password'], emailVerified: false })).toBe(true)
  })
  it('never Google accounts, confirmed ones, guests, demo or signed out', () => {
    expect(needsEmailCode({ ...base, providers: ['password', 'google.com'], emailVerified: false })).toBe(false)
    expect(needsEmailCode({ ...base, providers: ['password'], emailVerified: true })).toBe(false)
    expect(needsEmailCode({ ...base, isAnonymous: true, emailVerified: false })).toBe(false)
    expect(needsEmailCode(base)).toBe(false)
    expect(needsEmailCode(null)).toBe(false)
  })
})

describe('accountEmailsOf', () => {
  it('lists added emails oldest first and skips anything malformed', () => {
    expect(accountEmailsOf({ list: { a: { email: 'w@x.com', addedAt: 2 }, b: { email: 'p@x.com', addedAt: 1 }, c: { email: 5 }, d: null } })).toEqual([
      { email: 'p@x.com', addedAt: 1 },
      { email: 'w@x.com', addedAt: 2 },
    ])
    expect(accountEmailsOf(undefined)).toEqual([])
    expect(accountEmailsOf({ list: 'x' })).toEqual([])
  })
})

describe('form checks', () => {
  it('emails', () => {
    expect(emailProblem('')).toBe('Enter your email')
    expect(emailProblem('priya@')).toMatch(/doesn’t look like/)
    expect(emailProblem(' priya@x.com ')).toBe('')
  })
  it('the resend countdown', () => {
    expect(resendIn(0)).toBe('')
    expect(resendIn(24_000)).toBe('0:24')
    expect(resendIn(61_500)).toBe('1:02')
  })
})
