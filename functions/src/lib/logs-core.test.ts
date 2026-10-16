import { describe, expect, it } from 'vitest'
import { buildLogFilter, normalizeEntry } from './logs-core'

const now = Date.parse('2026-10-16T12:00:00Z')

describe('admin logs filter', () => {
  it('defaults to the last day of every function', () => {
    expect(buildLogFilter({}, now)).toBe('resource.type="cloud_run_revision" AND timestamp>="2026-10-15T12:00:00.000Z"')
  })
  it('adds level, function, words and an id, safely', () => {
    const f = buildLogFilter({ level: 'WARNING', fn: 'onExpenseCreated', hours: 1, text: 'push "failed"\n', id: 'g_abc' }, now)
    expect(f).toBe(
      'resource.type="cloud_run_revision" AND timestamp>="2026-10-16T11:00:00.000Z" AND severity>=WARNING AND resource.labels.service_name="onexpensecreated" AND SEARCH("push  failed") AND SEARCH("g_abc")',
    )
    expect(buildLogFilter({ fn: 'x" OR true', id: 'a b' }, now)).not.toMatch(/OR true|a b/)
    expect(buildLogFilter({ hours: 99999 }, now)).toContain('2026-09-16T12:00:00.000Z')
  })
})

describe('log entries', () => {
  it('reads structured, text and request entries into one shape', () => {
    expect(
      normalizeEntry({
        insertId: 'i1',
        timestamp: 't',
        severity: 'INFO',
        resource: { labels: { service_name: 'vault' } },
        jsonPayload: { message: 'vault set up', groupId: 'g1' },
      }),
    ).toEqual({ id: 'i1', at: 't', severity: 'INFO', fn: 'vault', message: 'vault set up', data: { groupId: 'g1' } })
    const text = normalizeEntry({ insertId: 'i2', severity: 'ERROR', textPayload: 'Error: boom\n  at x' })
    expect(text.message).toBe('Error: boom')
    expect(text.data).toBe('Error: boom\n  at x')
    expect(normalizeEntry({ insertId: 'i3', httpRequest: { requestMethod: 'POST', status: 500 } }).message).toBe('POST 500')
  })
})
