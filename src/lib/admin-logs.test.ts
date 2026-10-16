import { describe, expect, it } from 'vitest'
import { asCopyText, FUNCTION_NAMES, functionLabel, levelTone, matchesText } from './admin-logs'

// Read the functions' index so the list can't drift from what is deployed (as flags.test.ts does with the rules).
const fsModule = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: 'utf8') => string }

describe('admin logs', () => {
  it('lists every exported Cloud Function', () => {
    const index = readFileSync(new URL('../../functions/src/index.ts', import.meta.url), 'utf8')
    const exported = [...index.matchAll(/^export \{([^}]+)\}/gm)].flatMap((m) => m[1].split(',').map((s: string) => s.trim())).sort()
    expect([...FUNCTION_NAMES].sort()).toEqual(exported)
  })
  it('names a Cloud Run service by its function', () => {
    expect(functionLabel('onexpensecreated')).toBe('onExpenseCreated')
    expect(functionLabel('something')).toBe('something')
  })
  it('groups severities into four looks', () => {
    expect(levelTone('ERROR')).toBe('error')
    expect(levelTone('CRITICAL')).toBe('error')
    expect(levelTone('WARNING')).toBe('warn')
    expect(levelTone('INFO')).toBe('info')
    expect(levelTone('DEFAULT')).toBe('debug')
  })
  it('finds words anywhere in an app report, and copies entries as JSON', () => {
    const r = { id: '1', uid: 'u9', at: 1, kind: 'crash', message: 'TypeError: x', stack: 'at GroupDetail', route: '/groups/g1', version: '7.2.0' }
    expect(matchesText(r, 'groupdetail')).toBe(true)
    expect(matchesText(r, 'u9')).toBe(true)
    expect(matchesText(r, '  ')).toBe(true)
    expect(matchesText(r, 'vault')).toBe(false)
    expect(asCopyText({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})
