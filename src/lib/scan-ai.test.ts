import { describe, expect, it } from 'vitest'
import {
  type ScanAiInput,
  scanAiButton,
  scanAiTitle,
  scanAiToggledText,
  scanAiWhyLink,
  scanAiWhyText,
  scanFootHint,
  scanReader,
  scanReaderLine,
} from './scan-ai'

const base: ScanAiInput = { kind: 'receipt', demo: false, adminOn: true, available: true, masterOn: true, on: true }

describe('scanAiButton', () => {
  it('shows on Bill and Statement, following the bills switch', () => {
    expect(scanAiButton(base)).toEqual({ show: true, state: 'on' })
    expect(scanAiButton({ ...base, on: false })).toEqual({ show: true, state: 'off' })
    expect(scanAiButton({ ...base, kind: 'statement' })).toEqual({ show: true, state: 'on' })
  })

  it('never shows on Payment: screenshots are read on the phone only', () => {
    expect(scanAiButton({ ...base, kind: 'payment' })).toEqual({ show: false })
  })

  it('shows the same in Simple and Advanced: the mode is not an input', () => {
    expect(scanAiButton({ ...base, kind: 'receipt' })).toEqual({ show: true, state: 'on' })
    expect(scanAiButton({ ...base, kind: 'statement', on: false })).toEqual({ show: true, state: 'off' })
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
    expect(scanAiWhyText('admin', 'statement')).toContain('Statements are read on this phone')
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
    expect(scanAiToggledText(true)).toContain('Google Gemini')
    expect(scanAiToggledText(false)).toContain('on this phone')
    expect(scanAiToggledText(false)).toContain('read on this phone')
    expect(scanAiTitle({ show: true, state: 'on' })).toContain('Google Gemini')
    expect(scanAiTitle({ show: true, state: 'off' })).toContain('read on this phone')
    expect(scanAiTitle({ show: true, state: 'unavailable', why: 'demo' })).toContain('isn’t available')
    expect(scanAiTitle({ show: false })).toBe('')
  })

  it('uses no exclamation marks or em dashes', () => {
    const all = [
      ...(['demo', 'admin', 'account', 'master'] as const).flatMap((w) => [scanAiWhyText(w, 'receipt'), scanAiWhyText(w, 'statement')]),
      scanAiToggledText(true),
      scanAiToggledText(false),
    ]
    for (const t of all) expect(t).not.toMatch(/[!—]/)
  })
})

describe('scanReader', () => {
  const r = { kind: 'receipt' as const, demo: false, adminOn: true, available: true, masterOn: true, on: true }

  it('reads a bill with Gemini only when the corner button would be on', () => {
    expect(scanReader(r)).toBe('ai')
    expect(scanReader({ ...r, on: false })).toBe('phone')
    expect(scanReader({ ...r, adminOn: false })).toBe('phone')
    expect(scanReader({ ...r, available: false })).toBe('phone')
    expect(scanReader({ ...r, masterOn: false })).toBe('phone')
  })

  it('follows the bills switch while the status and prefs load', () => {
    expect(scanReader({ ...r, available: undefined, masterOn: undefined })).toBe('ai')
    expect(scanReader({ ...r, available: undefined, masterOn: undefined, on: false })).toBe('phone')
  })

  it('reads demo bills on the phone and shows a sample statement', () => {
    expect(scanReader({ ...r, demo: true })).toBe('phone')
    expect(scanReader({ ...r, kind: 'statement', demo: true })).toBe('demo')
    expect(scanReader({ ...r, kind: 'payment', demo: true })).toBe('phone')
  })

  it('always reads payment screenshots on the phone', () => {
    expect(scanReader({ ...r, kind: 'payment' })).toBe('phone')
  })

  it('reads statements like bills', () => {
    expect(scanReader({ ...r, kind: 'statement' })).toBe('ai')
    expect(scanReader({ ...r, kind: 'statement', on: false })).toBe('phone')
  })

  it('reads a bill on the phone first for someone with private groups, only when AI is on', () => {
    expect(scanReader({ ...r, deviceFirst: true })).toBe('phoneFirst')
    expect(scanReader({ ...r, deviceFirst: true, on: false })).toBe('phone')
    expect(scanReader({ ...r, kind: 'statement', deviceFirst: true })).toBe('ai')
  })
})

describe('scan card lines', () => {
  const readers = ['ai', 'phone', 'phoneFirst', 'demo'] as const
  const kinds = ['receipt', 'payment', 'statement'] as const

  it('says Google Gemini when AI reads, and this phone otherwise', () => {
    expect(scanReaderLine('receipt', 'ai')).toEqual({ icon: 'ai', hint: expect.objectContaining({ short: 'Read by Google Gemini' }) })
    expect(scanReaderLine('statement', 'ai')).toEqual({ icon: 'ai', hint: expect.objectContaining({ short: 'Read by Google Gemini' }) })
    expect(scanReaderLine('receipt', 'phone').hint.short).toBe('Read on this phone, check the total')
    expect(scanReaderLine('statement', 'phone').hint.short).toBe('Read on this phone, check each payment')
    expect(scanReaderLine('payment', 'phone').hint.short).toBe('Read on this phone, check the amount')
    expect(scanReaderLine('receipt', 'phoneFirst')).toEqual({
      icon: 'phone',
      hint: expect.objectContaining({ short: expect.stringContaining('Google Gemini') }),
    })
    expect(scanReaderLine('statement', 'demo').hint.full).toContain('sample')
  })

  it('never says a payment screenshot goes to Gemini', () => {
    for (const reader of ['ai', 'phone', 'phoneFirst'] as const) {
      const line = scanReaderLine('payment', reader)
      expect(line.icon).toBe('phone')
      expect(line.hint.full).not.toContain('Gemini')
    }
  })

  it('keeps every line in Simple: where the photo goes, and that nothing is added by itself', () => {
    for (const kind of kinds) {
      expect(scanFootHint(kind).tier).toBe('key')
      for (const reader of readers) expect(scanReaderLine(kind, reader).hint.tier).toBe('key')
    }
  })

  it('words the foot for each tab', () => {
    expect(scanFootHint('receipt').full).toContain('pick a group')
    expect(scanFootHint('payment')).toEqual(scanFootHint('receipt'))
    expect(scanFootHint('statement').full).toContain('tick payments')
    expect(scanFootHint('statement').full).toContain('stay on this device')
  })

  it('uses no exclamation marks or em dashes', () => {
    const all = kinds.flatMap((k) => [scanFootHint(k).full, ...readers.map((r) => scanReaderLine(k, r).hint.full)])
    for (const t of all) expect(t).not.toMatch(/[!—]/)
  })
})
