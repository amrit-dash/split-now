import { describe, expect, it } from 'vitest'
import type { Capture } from '@/types'
import { bulkCandidates, sumCaptures, targetGroupFor } from './inbox-sort'

const g = (id: string, o: Partial<{ startDate: string; endDate: string; currency: string; archived: boolean; type: 'trip' | 'personal' }> = {}) => ({
  id,
  type: o.type ?? ('trip' as const),
  currency: o.currency ?? 'INR',
  updatedAt: 1,
  startDate: o.startDate,
  endDate: o.endDate,
  archived: o.archived,
})
const cap = (id: string, date: string, o: Partial<Capture> = {}): Capture => ({
  id,
  amount: 100,
  merchant: 'Swiggy',
  date,
  source: 'sms-ios',
  status: 'pending',
  createdAt: 1,
  updatedAt: 1,
  ...o,
})

const goa = g('goa', { startDate: '2026-10-01', endDate: '2026-10-10' })
const wedding = g('wed', { startDate: '2026-10-04', endDate: '2026-10-06' })
const flat = g('flat')

describe('targetGroupFor', () => {
  it('honours the server suggestion when the group still exists', () => {
    expect(targetGroupFor(cap('a', '2026-10-05', { suggestedGroup: 'goa' }), [goa, wedding])).toBe('goa')
  })
  it('falls back to the trip-window ranking when the suggested group is gone or archived', () => {
    expect(targetGroupFor(cap('a', '2026-10-05', { suggestedGroup: 'old' }), [goa, wedding])).toBe('wed')
    expect(targetGroupFor(cap('a', '2026-10-05', { suggestedGroup: 'goa' }), [{ ...goa, archived: true }, wedding])).toBe('wed')
  })
  it('nothing in a window → undefined', () => {
    expect(targetGroupFor(cap('a', '2026-12-01'), [goa, flat])).toBeUndefined()
  })
})

describe('bulkCandidates', () => {
  it('needs two or more captures in one live trip, in its currency', () => {
    const list = [
      cap('a', '2026-10-02'),
      cap('b', '2026-10-03'),
      cap('c', '2026-10-05', { suggestedGroup: 'wed' }),
      cap('d', '2026-10-09', { currency: 'AUD' }),
      cap('e', '2026-12-01'),
    ]
    const out = bulkCandidates(list, [goa, wedding, flat])
    expect(out).toHaveLength(1)
    expect(out[0].group.id).toBe('goa')
    expect(out[0].captures.map((c) => c.id)).toEqual(['a', 'b'])
  })
  it('skips handled captures and sorts the biggest set first', () => {
    const list = [
      cap('a', '2026-10-02'),
      cap('b', '2026-10-03', { status: 'assigned' }),
      cap('c', '2026-10-05', { suggestedGroup: 'wed' }),
      cap('d', '2026-10-05', { suggestedGroup: 'wed' }),
      cap('e', '2026-10-06', { suggestedGroup: 'wed' }),
    ]
    const out = bulkCandidates(list, [goa, wedding])
    expect(out.map((c) => [c.group.id, c.captures.length])).toEqual([['wed', 3]])
  })
  it('sums amounts', () => {
    expect(sumCaptures([cap('a', '2026-10-02', { amount: 150 }), cap('b', '2026-10-02', { amount: 250 })])).toBe(400)
  })
})
