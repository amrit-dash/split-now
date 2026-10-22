import { describe, expect, it } from 'vitest'
import { type ScanAiInput, scanAiButton, scanAiTitle, scanAiToggledText, scanAiWhyLink, scanAiWhyText } from './scan-ai'

const base: ScanAiInput = { kind: 'receipt', simple: false, demo: false, adminOn: true, available: true, masterOn: true, on: true }

describe('scanAiButton', () => {
  it('shows on Bill and Statement, following the bills switch', () => {
    expect(scanAiButton(base)).toEqual({ show: true, state: 'on' })
    expect(scanAiButton({ ...base, on: false })).toEqual({ show: true, state: 'off' })
    expect(scanAiButton({ ...base, kind: 'statement' })).toEqual({ show: true, state: 'on' })
  })

  it('never shows on Payment: screenshots are read on the phone only', () => {
    expect(scanAiButton({ ...base, kind: 'payment' })).toEqual({ show: false })
  })

  it('hides on every card in Simple, even when AI is unavailable', () => {
    for (const kind of ['receipt', 'payment', 'statement'] as const) {
      expect(scanAiButton({ ...base, kind, simple: true })).toEqual({ show: false })
      expect(scanAiButton({ ...base, kind, simple: true, demo: true })).toEqual({ show: false })
    }
  })

  it('says why instead of toggling, in the same order as the old switch', () => {
    expect(scanAiButton({ ...base, demo: true, adminOn: false })).toEqual({ show: true, state: 'unavailable', why: 'demo' })
    expect(scanAiButton({ ...base, adminOn: false, available: false })).toEqual({ show: true, state: 'unavailable', why: 'admin' })
    expect(scanAiButton({ ...base, available: false, masterOn: false })).toEqual({ show: true, state: 'unavailable', why: 'account' })
    expect(scanAiButton({ ...base, masterOn: false })).toEqual({ show: true, state: 'unavailable', why: 'master' })
  })

  it('does not block while the status or prefs are still loading', () => {
    expect(scanAiButton({ ...base, available: undefined, masterOn: undefined, on: false })).toEqual({ show: true, state: 'off' })
  })
})

describe('scan AI copy', () => {
  it('names the fallback per card', () => {
    expect(scanAiWhyText('admin', 'receipt')).toContain('Bills are read on this phone')
    expect(scanAiWhyText('admin', 'statement')).toContain('Statements need it')
    expect(scanAiWhyText('demo', 'statement')).toContain('sample')
    expect(scanAiWhyText('master', 'receipt')).toContain('Settings → AI features')
  })

  it('links to the place that fixes it', () => {
    expect(scanAiWhyLink('account', false)).toEqual({ label: 'AI settings', to: '/settings/ai' })
    expect(scanAiWhyLink('account', true)).toEqual({ label: 'Set up', to: '/settings/admin' })
    expect(scanAiWhyLink('master', true)?.to).toBe('/settings/ai')
    expect(scanAiWhyLink('demo', false)).toBeUndefined()
    expect(scanAiWhyLink('admin', true)).toBeUndefined()
  })

  it('always says where the photo goes', () => {
    expect(scanAiToggledText(true, 'receipt')).toContain('Google Gemini')
    expect(scanAiToggledText(false, 'receipt')).toContain('on this phone')
    expect(scanAiToggledText(false, 'statement')).toContain('can’t be read')
    expect(scanAiTitle({ show: true, state: 'on' }, 'receipt')).toContain('Google Gemini')
    expect(scanAiTitle({ show: true, state: 'off' }, 'statement')).toContain('can’t be read')
    expect(scanAiTitle({ show: true, state: 'unavailable', why: 'demo' }, 'receipt')).toContain('isn’t available')
    expect(scanAiTitle({ show: false }, 'payment')).toBe('')
  })

  it('uses no exclamation marks or em dashes', () => {
    const all = [
      ...(['demo', 'admin', 'account', 'master'] as const).flatMap((w) => [scanAiWhyText(w, 'receipt'), scanAiWhyText(w, 'statement')]),
      scanAiToggledText(true, 'receipt'),
      scanAiToggledText(false, 'statement'),
    ]
    for (const t of all) expect(t).not.toMatch(/[!—]/)
  })
})
