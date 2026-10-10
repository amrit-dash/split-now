import { describe, expect, it } from 'vitest'
import { backSteps, recordNav, type NavStack } from './nav-stack'

describe('recordNav', () => {
  it('records pushes and forgets the forward history on a new push', () => {
    let s: NavStack = []
    s = recordNav(s, 0, '/', 'push')
    s = recordNav(s, 1, '/groups/g1', 'push')
    s = recordNav(s, 2, '/groups/g1/edit', 'push')
    expect(s).toEqual(['/', '/groups/g1', '/groups/g1/edit'])
    // Back twice, then somewhere new from Home: the old entries after it are gone.
    s = recordNav(s, 1, '/settle', 'push')
    expect(s).toEqual(['/', '/settle'])
  })
  it('a back or forward keeps the forward history', () => {
    const s = recordNav(['/', '/groups/g1', '/groups/g1/edit'], 1, '/groups/g1', 'pop')
    expect(s).toEqual(['/', '/groups/g1', '/groups/g1/edit'])
  })
  it('a replace overwrites the entry in place and keeps what came before', () => {
    let s: NavStack = ['/', '/groups/g1', '/add']
    s = recordNav(s, 2, '/groups/g1', 'replace')
    expect(s).toEqual(['/', '/groups/g1', '/groups/g1'])
  })
})

describe('backSteps', () => {
  it('goes back to where you came from: Edit group → Manage members → back to Edit group', () => {
    const s = ['/', '/groups/g1', '/groups/g1/edit', '/groups/g1/members']
    expect(backSteps(s, 3, '/groups/g1/members')).toBe(1)
  })
  it('steps past a form that replaced itself with the screen it saved into', () => {
    // Group → + → Add expense → saved (replaced by the group): back leaves the group, not to itself.
    const s = ['/', '/groups/g1', '/groups/g1']
    expect(backSteps(s, 2, '/groups/g1')).toBe(2)
    // Query strings don't make it a different screen.
    expect(backSteps(['/groups/g1?tab=balances', '/groups/g1'], 1, '/groups/g1')).toBeNull()
  })
  it('has nothing to go back to on the first screen of a visit (the caller uses its fallback)', () => {
    expect(backSteps(['/groups/g1/members'], 0, '/groups/g1/members')).toBeNull()
    expect(backSteps([], undefined, '/x')).toBeNull()
    expect(backSteps(['/groups/g1', '/groups/g1'], 1, '/groups/g1/')).toBeNull()
  })
  it('treats an entry from before a reload (unknown) as a real screen to go back to', () => {
    expect(backSteps([undefined, '/groups/g1'], 1, '/groups/g1')).toBe(1)
  })
})
