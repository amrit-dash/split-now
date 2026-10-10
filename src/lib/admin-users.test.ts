import { describe, expect, it } from 'vitest'
import { userRowActions } from './admin-users'

describe('userRowActions', () => {
  it('offers nothing on your own row', () => {
    expect(userRowActions({ uid: 'me', admin: true, blocked: false }, 'me')).toEqual([])
  })
  it('offers make admin and block for an ordinary account', () => {
    expect(userRowActions({ uid: 'a', admin: false, blocked: false }, 'me')).toEqual(['make-admin', 'block'])
  })
  it('only unblock for a blocked account (it must be unblocked before it can be an admin)', () => {
    expect(userRowActions({ uid: 'a', admin: false, blocked: true }, 'me')).toEqual(['unblock'])
  })
  it('only remove admin for another admin (admins cannot be blocked)', () => {
    expect(userRowActions({ uid: 'a', admin: true, blocked: false }, 'me')).toEqual(['remove-admin'])
  })
})
