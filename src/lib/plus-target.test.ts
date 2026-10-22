import { describe, expect, it } from 'vitest'
import { groupOfPath, plusTap } from './plus-target'

describe('groupOfPath', () => {
  it('finds the group on its screens', () => {
    expect(groupOfPath('/groups/g_goa')).toBe('g_goa')
    expect(groupOfPath('/groups/g_goa/settle')).toBe('g_goa')
    expect(groupOfPath('/groups/a%20b/chat')).toBe('a b')
  })
  it('none on the group list, New group and Import', () => {
    expect(groupOfPath('/groups')).toBeUndefined()
    expect(groupOfPath('/groups/new')).toBeUndefined()
    expect(groupOfPath('/groups/import')).toBeUndefined()
    expect(groupOfPath('/')).toBeUndefined()
  })
})

describe('plusTap', () => {
  it('inside a group, straight to Add expense for it', () => {
    expect(plusTap('/groups/g_goa')).toEqual({ kind: 'add', to: '/add?group=g_goa' })
    expect(plusTap('/groups/a b')).toEqual({ kind: 'add', to: '/add?group=a%20b' })
  })
  it('elsewhere, the Create sheet', () => {
    expect(plusTap('/')).toEqual({ kind: 'sheet' })
    expect(plusTap('/groups')).toEqual({ kind: 'sheet' })
    expect(plusTap('/groups/new')).toEqual({ kind: 'sheet' })
  })
})
