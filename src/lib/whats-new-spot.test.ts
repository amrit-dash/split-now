import { describe, expect, it } from 'vitest'
import { whatsNewMayShow } from './whats-new-spot'

describe('whatsNewMayShow', () => {
  it('shows on any screen with the tab bar, not only Home', () => {
    for (const p of ['/', '/groups', '/groups/g1', '/profile', '/settings/preferences', '/help', '/insights', '/inbox'])
      expect(whatsNewMayShow({ pathname: p, hasNav: true })).toBe(true)
  })
  it('waits on screens without the tab bar', () => {
    for (const p of ['/add', '/groups/g1/settle', '/groups/g1/chat', '/scan', '/split']) expect(whatsNewMayShow({ pathname: p, hasNav: false })).toBe(false)
  })
  it('waits on tab-bar forms whose main action sits at the bottom', () => {
    for (const p of ['/groups/new', '/groups/import', '/groups/g1/edit', '/admin', '/admin/flags'])
      expect(whatsNewMayShow({ pathname: p, hasNav: true })).toBe(false)
  })
  it('does not mistake a screen whose path only starts like a form screen', () => {
    expect(whatsNewMayShow({ pathname: '/groups/newyear', hasNav: true })).toBe(true)
    expect(whatsNewMayShow({ pathname: '/administer', hasNav: true })).toBe(true)
  })
})
