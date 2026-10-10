import { describe, expect, it } from 'vitest'
import { adminChangeRefusal, type AdminChange } from './admin-core'

const base: AdminChange = { me: 'boss', uid: 'alice', makeAdmin: true, isAdmin: false, hasProfile: true, blocked: false }

describe('adminChangeRefusal', () => {
  it('lets an admin promote a signed-up, unblocked account', () => {
    expect(adminChangeRefusal(base)).toBeNull()
  })
  it('refuses a blocked account and one that never signed in', () => {
    expect(adminChangeRefusal({ ...base, blocked: true })).toMatch(/Unblock/)
    expect(adminChangeRefusal({ ...base, hasProfile: false })).toMatch(/sign in/)
  })
  it('treats promoting an existing admin as a no-op, not an error', () => {
    expect(adminChangeRefusal({ ...base, isAdmin: true, hasProfile: false })).toBeNull()
  })
  it('lets an admin remove another admin but not themselves', () => {
    expect(adminChangeRefusal({ ...base, makeAdmin: false, isAdmin: true })).toBeNull()
    expect(adminChangeRefusal({ ...base, makeAdmin: false, isAdmin: true, uid: 'boss' })).toMatch(/your own/)
  })
})
