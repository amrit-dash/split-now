import { describe, expect, it } from 'vitest'
import { inviteLink } from './invite-link'

describe('inviteLink', () => {
  it('carries the sharer’s first name for the link preview', () => {
    expect(inviteLink('https://s.app', 'ABCD2345', 'Priya Sharma')).toBe('https://s.app/join/ABCD2345?by=Priya')
    expect(inviteLink('https://s.app', 'ABCD2345', 'Zoë')).toBe('https://s.app/join/ABCD2345?by=Zo%C3%AB')
  })
  it('a plain link without a usable name', () => {
    expect(inviteLink('https://s.app', 'ABCD2345')).toBe('https://s.app/join/ABCD2345')
    expect(inviteLink('https://s.app', 'ABCD2345', '  ')).toBe('https://s.app/join/ABCD2345')
    expect(inviteLink('https://s.app', 'ABCD2345', '<b>')).toBe('https://s.app/join/ABCD2345')
  })
})
